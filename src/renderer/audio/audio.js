// Audio engine: lives in a hidden window, receives key events from the main process
// and plays decoded buffers through Web Audio (low latency, unlimited overlap).

// `api` is the IPC bridge exposed globally by src/preload.js.
const CHAOS_ID = '__chaos'; // keep in sync with src/shared/catalog.js
const MAX_VOICES = 32;

const ctx = new AudioContext({ latencyHint: 'interactive' });
const master = ctx.createGain();
// Gentle limiter so fast typing with overlapping sounds never clips.
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -8;
limiter.knee.value = 4;
limiter.ratio.value = 12;
limiter.attack.value = 0.002;
limiter.release.value = 0.15;
master.connect(limiter).connect(ctx.destination);

let settings = null;
let soundList = [];
const loading = new Map(); // id -> Promise
const ready = new Map();   // id -> { variants: AudioBuffer[], special: { [key]: AudioBuffer } }
const voices = [];

// ---------- Loading ----------

function decode(bytes) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return ctx.decodeAudioData(copy);
}

function load(id) {
  if (!loading.has(id)) {
    loading.set(id, (async () => {
      try {
        const data = await api.invoke('sound:data', id);
        const variants = await Promise.all(data.variants.map(decode));
        const special = {};
        for (const [key, bytes] of Object.entries(data.special || {})) special[key] = await decode(bytes);
        ready.set(id, { variants, special });
      } catch (err) {
        // Stay in `loading` so a broken file reports once instead of on every keystroke.
        api.send('audio:error', { id, message: String(err?.message || err) });
      }
    })());
  }
  return loading.get(id);
}

async function refreshSoundList() {
  soundList = await api.invoke('sounds:list');
  const ids = new Set(soundList.map((s) => s.id));
  for (const id of [...loading.keys()]) {
    if (!ids.has(id)) { loading.delete(id); ready.delete(id); }
  }
}

// ---------- Key -> sound mapping ----------

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// Melody mode: keyboard rows climb a pentatonic scale, so any typing sounds musical.
const PENTATONIC = [0, 2, 4, 7, 9];
const DEGREE = {};
['ZXCVBNM', 'ASDFGHJKL', 'QWERTYUIOP', '1234567890'].forEach((row, r) => {
  [...row].forEach((ch, c) => { DEGREE[ch] = r * 2 + c; });
});

function melodySemitones(key) {
  let degree = DEGREE[key.replace(/^Numpad(?=\d$)/, '')];
  if (degree === undefined) degree = hash(key) % 7;
  return Math.floor(degree / 5) * 12 + PENTATONIC[degree % 5] - 12;
}

function playbackRate(key) {
  switch (settings.pitchMode) {
    case 'wobble': return 2 ** ((Math.random() * 2 - 1) * 1.5 / 12);
    case 'melody': return 2 ** (melodySemitones(key) / 12);
    default: return 1;
  }
}

function randomBuiltIn() {
  const builtIns = soundList.filter((s) => s.builtIn);
  return builtIns[Math.floor(Math.random() * builtIns.length)]?.id;
}

function pickBuffer(id, pack, key) {
  if (pack.special[key]) return pack.special[key];
  const n = pack.variants.length;
  if (id === 'dialpad') {
    const digit = /^(?:Numpad)?(\d)$/.exec(key);
    if (digit) return pack.variants[Number(digit[1])];
    if (key === 'NumpadMultiply') return pack.variants[10];
  }
  return pack.variants[hash(key) % n];
}

// ---------- Playback ----------

function play(buffer, rate = 1, gain = 1) {
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  voices.push(src);
  src.onended = () => {
    const i = voices.indexOf(src);
    if (i >= 0) voices.splice(i, 1);
    g.disconnect();
  };
  if (voices.length > MAX_VOICES) {
    try { voices.shift().stop(); } catch { /* already ended */ }
  }
}

function onKey({ name }) {
  if (!settings?.enabled) return;
  const key = name === 'NumpadEnter' ? 'Enter' : name;
  const override = settings.overrides?.[key];
  if (override === 'mute') return;

  let id = override || settings.soundId;
  if (id === CHAOS_ID) id = randomBuiltIn();
  if (!id) return;

  const pack = ready.get(id);
  if (!pack) { load(id); return; }
  const gain = settings.pitchMode === 'wobble' ? 0.85 + Math.random() * 0.15 : 1;
  play(pickBuffer(id, pack, key), playbackRate(key), gain);
}

async function onPreview(id) {
  if (id === CHAOS_ID) id = randomBuiltIn();
  await load(id);
  const pack = ready.get(id);
  if (!pack) return;
  play(pack.variants[Math.floor(Math.random() * pack.variants.length)]);
}

function applySettings(s) {
  settings = s;
  // Squared slider feels closer to perceived loudness than linear.
  master.gain.setTargetAtTime(s.volume * s.volume, ctx.currentTime, 0.02);
  load(s.soundId === CHAOS_ID ? randomBuiltIn() : s.soundId);
  for (const id of Object.values(s.overrides || {})) if (id && id !== 'mute') load(id);
}

// ---------- Boot ----------

(async () => {
  api.on('key', onKey);
  api.on('preview', onPreview);
  api.on('settings', applySettings);
  api.on('sounds:changed', async () => {
    await refreshSoundList();
    applySettings(settings);
  });

  await refreshSoundList();
  applySettings(await api.invoke('settings:get'));
  // Warm up every built-in pack so switching (and Chaos mode) is instant.
  for (const s of soundList) if (s.builtIn) load(s.id);
})();
