// Detects "microphone in use" on Windows (calls, voice chat, recording) by reading
// the same registry data that powers the mic icon in the taskbar: an app whose
// LastUsedTimeStop is 0 is using the microphone right now.

const { execFile } = require('child_process');

const MIC_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

// Parses `reg query <key> /s` output. Returns the subkeys (apps) currently using the mic.
// `ignore` filters out apps by substring (e.g. our own exe, which records sounds).
function parseActiveMicUsers(stdout, ignore = []) {
  const active = [];
  let current = null;
  const flush = () => {
    if (current && current.start && current.stop === 0) active.push(current.key);
  };
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      flush();
      current = { key: line.trim(), start: 0, stop: null };
      continue;
    }
    const m = /^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+0x([0-9a-f]+)/i.exec(line);
    if (m && current) {
      const value = parseInt(m[2], 16);
      if (m[1] === 'LastUsedTimeStart') current.start = value;
      else current.stop = value;
    }
  }
  flush();
  const lowered = ignore.map((s) => s.toLowerCase());
  return active.filter((key) => !lowered.some((s) => key.toLowerCase().includes(s)));
}

class MicWatcher {
  constructor({ intervalMs = 3000, ignore = [], onChange }) {
    this.intervalMs = intervalMs;
    this.ignore = ignore;
    this.onChange = onChange;
    this.active = false;
    this.timer = null;
    this.busy = false;
  }

  start() {
    if (process.platform !== 'win32' || this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.active) {
      this.active = false;
      this.onChange(false);
    }
  }

  poll() {
    if (this.busy) return;
    this.busy = true;
    execFile('reg', ['query', MIC_KEY, '/s'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      this.busy = false;
      if (err || !this.timer) return;
      const active = parseActiveMicUsers(stdout, this.ignore).length > 0;
      if (active !== this.active) {
        this.active = active;
        this.onChange(active);
      }
    });
  }
}

module.exports = { MicWatcher, parseActiveMicUsers };
