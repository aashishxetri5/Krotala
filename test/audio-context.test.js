import assert from 'node:assert/strict';
import test from 'node:test';
import { MUTE } from '../src/shared/constants.js';
import { resolveAudioContext } from '../src/main/core/audio-context.js';
import { appLabel } from '../src/shared/names.js';
import { parseActiveMicUsers } from '../src/main/core/mic-usage.js';
import { DEFAULT_SETTINGS } from '../src/main/settings/schema.js';

const settings = (patch = {}) => ({ ...DEFAULT_SETTINGS, ...patch });
const idle = { app: 'Code.exe', micActive: false, fullscreen: false };

test('sounds play when nothing applies', () => {
  assert.deepEqual(resolveAudioContext(settings(), idle), { muteReason: null, profileSoundId: '' });
});

test('turning sounds off wins over everything', () => {
  assert.equal(resolveAudioContext(settings({ enabled: false }), { ...idle, micActive: true }).muteReason, 'Sounds are off');
});

test('app profiles choose a pack or mute, matching case-insensitively', () => {
  const profiles = [{ app: 'code.exe', soundId: 'piano' }, { app: 'Zoom.exe', soundId: MUTE }];
  assert.equal(resolveAudioContext(settings({ profiles }), idle).profileSoundId, 'piano');
  assert.equal(resolveAudioContext(settings({ profiles }), { ...idle, app: 'Zoom.exe' }).muteReason, 'Muted in Zoom');
});

test('auto-mute follows the microphone and full-screen settings', () => {
  assert.match(resolveAudioContext(settings(), { ...idle, micActive: true }).muteReason, /microphone/);
  assert.equal(resolveAudioContext(settings({ autoMuteMic: false }), { ...idle, micActive: true }).muteReason, null);
  assert.equal(resolveAudioContext(settings(), { ...idle, fullscreen: true }).muteReason, null);
  assert.match(resolveAudioContext(settings({ autoMuteFullscreen: true }), { ...idle, fullscreen: true }).muteReason, /full-screen/);
});

test('app labels drop the .exe extension', () => {
  assert.equal(appLabel('Code.exe'), 'Code');
  assert.equal(appLabel(null), '');
});

test('microphone users are read from the registry dump, minus ignored apps', () => {
  const out = [
    'HKEY_CURRENT_USER\\...\\microphone',
    '    Value    REG_SZ    Allow',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\Zoom',
    '    LastUsedTimeStart    REG_QWORD    0x1dca4785d8ee1e0',
    '    LastUsedTimeStop    REG_QWORD    0x0',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\NonPackaged\\C:#apps#keyboard sounds.exe',
    '    LastUsedTimeStart    REG_QWORD    0x1dca4785d8ee1e0',
    '    LastUsedTimeStop    REG_QWORD    0x0',
    '',
    'HKEY_CURRENT_USER\\...\\microphone\\Camera',
    '    LastUsedTimeStart    REG_QWORD    0x1d9ac2c1ed0f5a0',
    '    LastUsedTimeStop    REG_QWORD    0x1d9ac2c26915cee',
  ].join('\r\n');
  assert.deepEqual(parseActiveMicUsers(out, ['C:#apps#Keyboard Sounds.exe']), ['HKEY_CURRENT_USER\\...\\microphone\\Zoom']);
  assert.equal(parseActiveMicUsers(out).length, 2);
});
