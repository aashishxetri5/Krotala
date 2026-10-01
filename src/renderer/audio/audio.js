// Audio engine: lives in a hidden window and plays what the main process tells it to.
// All "which sound / pitch / pan" decisions happen in src/main/keymap.js; this file
// only decodes buffers and plays them through Web Audio (low latency, free overlap).
// `api` is the IPC bridge exposed globally by src/preload.js.

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
const loading = new Map(); // id -> Promise
const ready = new Map();   // id -> { variants: AudioBuffer[], special: { [key]: AudioBuffer }, release: AudioBuffer[] }
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
        const special = {};
        for (const [key, bytes] of Object.entries(data.special || {})) special[key] = await decode(bytes);
        ready.set(id, {
          variants: await Promise.all(data.variants.map(decode)),
          special,
          release: await Promise.all((data.release || []).map(decode)),
        });
      } catch (err) {
        // Stay in `loading` so a broken file reports once instead of on every keystroke.
        api.send('audio:error', { id, message: String(err?.message || err) });
      }
    })());
  }
  return loading.get(id);
}

function forget(id) {
  loading.delete(id);
  ready.delete(id);
}

function bufferFor(pack, slot) {
  if (slot.type === 'special') return pack.special[slot.key];
  if (slot.type === 'release') return pack.release[slot.index];
  return pack.variants[slot.index] ?? pack.variants[0];
}

// ---------- Playback ----------

function play({ soundId, slot, rate = 1, pan = 0, gain = 1 }) {
  const pack = ready.get(soundId);
  if (!pack) { load(soundId); return; } // first use: load now, play from the next key
  const buffer = bufferFor(pack, slot);
  if (!buffer) return;
  if (ctx.state === 'suspended') ctx.resume();

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  src.connect(g).connect(panner).connect(master);
  src.start();

  voices.push(src);
  src.onended = () => {
    const i = voices.indexOf(src);
    if (i >= 0) voices.splice(i, 1);
    panner.disconnect();
  };
  if (voices.length > MAX_VOICES) {
    try { voices.shift().stop(); } catch { /* already ended */ }
  }
}

// Game-style announcer for combo milestones, using the OS text-to-speech voices.
function announce({ text }) {
  if (!('speechSynthesis' in window) || !settings?.announcer) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.15;
  utterance.pitch = 0.8;
  utterance.volume = Math.min(1, (settings.volume ?? 0.7) * 1.2);
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((v) => /en[-_](US|GB)/i.test(v.lang) && /male|david|daniel|guy/i.test(v.name))
    || voices.find((v) => /^en/i.test(v.lang)) || null;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function applySettings(s) {
  settings = s;
  // Squared slider feels closer to perceived loudness than linear.
  master.gain.setTargetAtTime(s.volume * s.volume, ctx.currentTime, 0.02);
  for (const id of [s.soundId, s.keyUpSound, ...Object.values(s.overrides || {}), ...s.profiles.map((p) => p.soundId)]) {
    if (id && !['mute', 'pack', '__chaos'].includes(id)) load(id);
  }
}

// ---------- Boot ----------

(async () => {
  api.on('play', play);
  api.on('announce', announce);
  api.on('settings', applySettings);
  api.on('sounds:changed', ({ ids = [] } = {}) => {
    ids.forEach(forget);
    applySettings(settings);
  });

  applySettings(await api.invoke('settings:get'));
  // Warm up every pack so switching (and Chaos mode) is instant.
  for (const s of await api.invoke('sounds:list')) load(s.id);
  load('ui:combo');
  load('ui:achievement');
})();
