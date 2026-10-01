/**
 * @file Parses Windows' microphone usage records (the data behind the taskbar mic
 * indicator). An app whose `LastUsedTimeStop` is 0 is using the microphone now.
 */

/** Registry key holding per-app microphone usage. */
export const MIC_USAGE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

const VALUE_LINE = /^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+0x([0-9a-f]+)/i;

/**
 * Lists the apps currently using the microphone.
 * @param {string} regOutput - Output of `reg query <MIC_USAGE_KEY> /s`.
 * @param {string[]} [ignore=[]] - Substrings of registry keys to skip (e.g. this app's own path).
 * @returns {string[]} Registry keys of apps using the microphone.
 */
export function parseActiveMicUsers(regOutput, ignore = []) {
  const active = [];
  let current = null;
  const commit = () => {
    if (current && current.start && current.stop === 0) active.push(current.key);
  };
  for (const line of regOutput.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      commit();
      current = { key: line.trim(), start: 0, stop: null };
      continue;
    }
    const match = VALUE_LINE.exec(line);
    if (match && current) {
      const value = parseInt(match[2], 16);
      if (match[1] === 'LastUsedTimeStart') current.start = value;
      else current.stop = value;
    }
  }
  commit();
  const skip = ignore.map((s) => s.toLowerCase());
  return active.filter((key) => !skip.some((s) => key.toLowerCase().includes(s)));
}
