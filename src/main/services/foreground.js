/**
 * @file Windows foreground-window queries through koffi: the active app, whether it
 * is full-screen, and the text caret position. Every function returns null on other
 * platforms or when a query fails, so callers degrade gracefully.
 */

import path from 'node:path';
import { IS_WINDOWS } from '../constants.js';

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MONITOR_DEFAULTTONEAREST = 2;
const MAX_PATH_CHARS = 1024;
const EXE_CACHE_LIMIT = 200;
const SHELL_EXE = 'explorer.exe';

/**
 * @typedef {object} ForegroundApp
 * @property {string} exe - Executable file name, e.g. `Code.exe`.
 * @property {number} pid - Owning process id.
 * @property {boolean} fullscreen - The window covers its whole monitor.
 */

/** @type {object | null | false} null = not loaded yet, false = unavailable. */
let win32 = null;
/** @type {Map<number, string | null>} */
const exeCache = new Map();

/**
 * Binds the Win32 functions on first use.
 * @returns {Promise<object | false>} Bound functions, or false when unavailable.
 */
async function load() {
  if (win32 !== null) return win32;
  if (!IS_WINDOWS) return (win32 = false);
  try {
    const { default: koffi } = await import('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    koffi.struct('POINT', { x: 'int32', y: 'int32' });
    const MONITORINFO = koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32' });
    const GUITHREADINFO = koffi.struct('GUITHREADINFO', {
      cbSize: 'uint32', flags: 'uint32',
      hwndActive: 'void *', hwndFocus: 'void *', hwndCapture: 'void *',
      hwndMenuOwner: 'void *', hwndMoveSize: 'void *', hwndCaret: 'void *',
      rcCaret: RECT,
    });
    win32 = {
      monitorInfoSize: koffi.sizeof(MONITORINFO),
      guiThreadInfoSize: koffi.sizeof(GUITHREADINFO),
      GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ RECT *rect)'),
      MonitorFromWindow: user32.func('void * __stdcall MonitorFromWindow(void *hWnd, uint32 flags)'),
      GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(void *hMonitor, _Inout_ MONITORINFO *info)'),
      GetGUIThreadInfo: user32.func('bool __stdcall GetGUIThreadInfo(uint32 threadId, _Inout_ GUITHREADINFO *info)'),
      ClientToScreen: user32.func('bool __stdcall ClientToScreen(void *hWnd, _Inout_ POINT *point)'),
      OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *handle)'),
      QueryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(void *process, uint32 flags, _Out_ uint16 *name, _Inout_ uint32 *size)',
      ),
    };
  } catch (err) {
    console.warn('Foreground detection is unavailable:', err.message);
    win32 = false;
  }
  return win32;
}

/**
 * Prepares the Win32 bindings so later synchronous queries can run.
 * @returns {Promise<boolean>} True when foreground detection is supported.
 */
export async function initForeground() {
  return Boolean(await load());
}

/** @returns {boolean} True when foreground detection is available (after init). */
export function isForegroundSupported() {
  return Boolean(win32);
}

/**
 * Resolves a process id to its executable path.
 * @param {object} api - Win32 bindings.
 * @param {number} pid - Process id.
 * @returns {string | null} Executable path, or null when access is denied.
 */
function executablePath(api, pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  let result = null;
  const handle = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (handle) {
    const buffer = Buffer.alloc(MAX_PATH_CHARS * 2);
    const size = [MAX_PATH_CHARS];
    if (api.QueryFullProcessImageNameW(handle, 0, buffer, size)) result = buffer.toString('utf16le', 0, size[0] * 2);
    api.CloseHandle(handle);
  }
  if (exeCache.size > EXE_CACHE_LIMIT) exeCache.clear();
  exeCache.set(pid, result);
  return result;
}

/**
 * @param {object} api - Win32 bindings.
 * @param {unknown} hwnd - Window handle.
 * @returns {boolean} True when the window covers its whole monitor.
 */
function coversMonitor(api, hwnd) {
  const rect = {};
  if (!api.GetWindowRect(hwnd, rect)) return false;
  const info = { cbSize: api.monitorInfoSize };
  const monitor = api.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (!monitor || !api.GetMonitorInfoW(monitor, info)) return false;
  const m = info.rcMonitor;
  return rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
}

/**
 * Describes the app the user is looking at.
 * @returns {ForegroundApp | null} The foreground app, or null when unknown.
 */
export function getForegroundApp() {
  if (!win32) return null;
  try {
    const hwnd = win32.GetForegroundWindow();
    if (!hwnd) return null;
    const pid = [0];
    win32.GetWindowThreadProcessId(hwnd, pid);
    const fullPath = executablePath(win32, pid[0]);
    if (!fullPath) return null;
    const exe = path.win32.basename(fullPath);
    // The desktop itself (explorer.exe) covers the screen but is not a full-screen app.
    const fullscreen = exe.toLowerCase() !== SHELL_EXE && coversMonitor(win32, hwnd);
    return { exe, pid: pid[0], fullscreen };
  } catch {
    return null;
  }
}

/**
 * Text caret position of the focused app. Classic Win32 apps (Notepad, Word…)
 * expose it; browsers and Electron apps usually don't.
 * @returns {{ x: number, y: number } | null} Caret position in physical screen pixels, or null.
 */
export function getCaretPoint() {
  if (!win32) return null;
  try {
    const hwnd = win32.GetForegroundWindow();
    if (!hwnd) return null;
    const threadId = win32.GetWindowThreadProcessId(hwnd, [0]);
    const info = { cbSize: win32.guiThreadInfoSize };
    if (!win32.GetGUIThreadInfo(threadId, info) || !info.hwndCaret) return null;
    const r = info.rcCaret;
    if (r.right === 0 && r.bottom === 0) return null;
    const point = { x: r.left, y: r.bottom };
    return win32.ClientToScreen(info.hwndCaret, point) ? point : null;
  } catch {
    return null;
  }
}
