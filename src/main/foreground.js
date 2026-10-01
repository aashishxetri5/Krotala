// Windows-only helpers (via koffi FFI): which app is in front, whether it is
// full-screen, and where the text caret is. Every function returns null on
// other platforms or on failure, so callers can degrade gracefully.

const path = require('path');

let win32 = null;

function load() {
  if (win32 !== null || process.platform !== 'win32') return win32;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' });
    const MONITORINFO = koffi.struct('MONITORINFO', {
      cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32',
    });
    const GUITHREADINFO = koffi.struct('GUITHREADINFO', {
      cbSize: 'uint32', flags: 'uint32',
      hwndActive: 'void *', hwndFocus: 'void *', hwndCapture: 'void *',
      hwndMenuOwner: 'void *', hwndMoveSize: 'void *', hwndCaret: 'void *',
      rcCaret: RECT,
    });

    win32 = {
      sizes: { MONITORINFO: koffi.sizeof(MONITORINFO), GUITHREADINFO: koffi.sizeof(GUITHREADINFO) },
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
      decode: (buf, len) => koffi.decode(buf, 'char16', len),
    };
  } catch (err) {
    console.warn('Foreground detection unavailable:', err.message);
    win32 = false;
  }
  return win32;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MONITOR_DEFAULTTONEAREST = 2;
const exeCache = new Map(); // pid -> exe path (pids are reused, so cache is bounded below)

function exePath(api, pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  let result = null;
  const handle = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (handle) {
    const buf = Buffer.alloc(1024 * 2);
    const size = [1024];
    if (api.QueryFullProcessImageNameW(handle, 0, buf, size)) result = buf.toString('utf16le', 0, size[0] * 2);
    api.CloseHandle(handle);
  }
  if (exeCache.size > 200) exeCache.clear();
  exeCache.set(pid, result);
  return result;
}

// { exe: 'Code.exe', path, pid, fullscreen } for the window the user is looking at.
function getForegroundApp() {
  const api = load();
  if (!api) return null;
  try {
    const hwnd = api.GetForegroundWindow();
    if (!hwnd) return null;
    const pid = [0];
    api.GetWindowThreadProcessId(hwnd, pid);
    const full = exePath(api, pid[0]);
    if (!full) return null;
    const exe = path.win32.basename(full);
    return { exe, path: full, pid: pid[0], fullscreen: exe.toLowerCase() !== 'explorer.exe' && isFullscreen(api, hwnd) };
  } catch {
    return null;
  }
}

function isFullscreen(api, hwnd) {
  const rect = {};
  if (!api.GetWindowRect(hwnd, rect)) return false;
  const info = { cbSize: api.sizes.MONITORINFO };
  const monitor = api.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (!monitor || !api.GetMonitorInfoW(monitor, info)) return false;
  const m = info.rcMonitor;
  return rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
}

// Caret position in physical screen pixels, when the focused app exposes one
// (Notepad, Word, most classic Win32 apps). Browsers and Electron apps usually don't.
function getCaretPoint() {
  const api = load();
  if (!api) return null;
  try {
    const hwnd = api.GetForegroundWindow();
    if (!hwnd) return null;
    const threadId = api.GetWindowThreadProcessId(hwnd, [0]);
    const info = { cbSize: api.sizes.GUITHREADINFO };
    if (!api.GetGUIThreadInfo(threadId, info) || !info.hwndCaret) return null;
    const r = info.rcCaret;
    if (r.right === 0 && r.bottom === 0) return null;
    const point = { x: r.left, y: r.bottom };
    if (!api.ClientToScreen(info.hwndCaret, point)) return null;
    return point;
  } catch {
    return null;
  }
}

module.exports = { getForegroundApp, getCaretPoint, isSupported: () => Boolean(load()) };
