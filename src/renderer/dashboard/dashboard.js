// Dashboard UI. `api` is the IPC bridge exposed globally by src/preload.js.

const CHAOS_ID = '__chaos'; // keep in sync with src/shared/catalog.js
const CATEGORIES = ['All', 'Classic', 'Musical', 'Action', 'Retro', 'Funny', 'Custom'];
const PITCH_HINTS = {
  off: 'Every key plays the sound at its natural pitch.',
  wobble: 'A slight random detune on each press — feels more natural, less robotic.',
  melody: 'Each key is a note on a pentatonic scale. Best with Piano, Harmonium or Marimba.',
  song: 'Every key plays the next note of a song — just type and it performs itself.',
};
const FX_STYLES = [
  ['auto', '✨ Auto'], ['emoji', '😀 Emoji'], ['notes', '🎵 Notes'], ['ripple', '💧 Ripples'], ['confetti', '🎉 Confetti'],
  ['bubbles', '🫧 Bubbles'], ['bullet', '💥 Bullet holes'], ['laser', '🔫 Lasers'], ['slash', '🗡️ Slashes'],
];
const OVERRIDE_ROWS = [
  ['Enter', '↵ Enter'], ['Space', '␣ Space'], ['Backspace', '⌫ Backspace'], ['Tab', '⇥ Tab'],
  ['Letters', 'A–Z Letters'], ['Numbers', '0–9 Numbers'], ['Modifiers', '⇧ Shift · Ctrl · Alt'],
  ['Arrows', '↔ Arrow keys'], ['Mouse', '🖱 Mouse clicks'],
];
const SIMPLE_TOGGLES = [
  'stereo', 'playOnRepeat', 'mouseClicks', 'fxEnabled', 'comboEnabled', 'announcer',
  'autoMuteMic', 'autoMuteFullscreen', 'launchAtLogin', 'autoUpdate',
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const fmt = new Intl.NumberFormat();

let settings = null;
let sounds = [];
let runtime = null;
let info = null;
let songs = [];
let statsSnap = null;
let filter = 'All';

// ---------- Helpers ----------

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

const soundById = (id) => (id === CHAOS_ID ? { id, name: 'Chaos Mode', emoji: '🎲' } : sounds.find((s) => s.id === id));
const soundLabel = (s) => `${s.emoji} ${s.name}`;

function soundOptions(leading = [], { chaos = false } = {}) {
  return [
    ...leading.map(([value, text]) => el('option', { value, textContent: text })),
    ...sounds.map((s) => el('option', { value: s.id, textContent: soundLabel(s) })),
    ...(chaos ? [el('option', { value: CHAOS_ID, textContent: '🎲 Chaos Mode' })] : []),
  ];
}

function setSelect(select, options, value) {
  select.replaceChildren(...options);
  select.value = value;
}

async function setSetting(patch) {
  settings = await api.invoke('settings:set', patch);
  renderAll();
}

let toastTimer;
function toast(message, kind = 'info') {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4500);
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// Tooltips: any element with data-tip (survives re-renders via delegation).
const tooltip = $('#tooltip');
document.addEventListener('mousemove', (e) => {
  const target = e.target.closest?.('[data-tip]');
  if (!target) { tooltip.hidden = true; return; }
  tooltip.innerHTML = '';
  const [title, ...rest] = target.dataset.tip.split('\n');
  tooltip.append(el('strong', { textContent: title }), ...rest.map((line) => el('div', { textContent: line })));
  tooltip.style.left = `${e.clientX}px`;
  tooltip.style.top = `${e.clientY}px`;
  tooltip.hidden = false;
});

// ---------- Navigation ----------

function showPage(name) {
  for (const btn of $$('.sidebar button')) btn.classList.toggle('active', btn.dataset.page === name);
  for (const page of $$('.page')) page.classList.toggle('active', page.id === `page-${name}`);
  storageSet('page', name);
  if (name === 'stats') refreshStats();
}

// ---------- Top bar ----------

function setVolumeUi(volume) {
  const pct = Math.round(volume * 100);
  const slider = $('#volume');
  if (document.activeElement !== slider) slider.value = pct;
  slider.style.setProperty('--fill', `${pct}%`);
  $('#volume-value').textContent = `${pct}%`;
}

function renderStatus() {
  $('#enabled').checked = settings.enabled;
  $('#enabled-label').textContent = settings.enabled ? 'On' : 'Off';
  setVolumeUi(settings.volume);
  const playing = soundById(runtime?.profileSoundId || settings.soundId);
  const reason = runtime?.muteReason;
  let line = reason || `Playing ${playing?.name ?? '—'} on every keystroke`;
  if (!reason && runtime?.profileSoundId) line += ` (profile for ${runtime.appLabel})`;
  $('#status-line').textContent = line;
  document.body.classList.toggle('muted-state', Boolean(reason));
}

// ---------- Sounds page ----------

function renderFilters() {
  const present = new Set(sounds.map((s) => s.category));
  $('#filters').replaceChildren(...CATEGORIES
    .filter((c) => c === 'All' || present.has(c))
    .map((c) => el('button', {
      className: `chip${c === filter ? ' active' : ''}`,
      textContent: c,
      onclick: () => { filter = c; renderFilters(); renderGrid(); },
    })));
}

function soundCard(sound) {
  const card = el('div', { className: 'card', tabIndex: 0, role: 'button', title: `Use ${sound.name}` }, [
    el('div', { className: 'emoji', textContent: sound.emoji }),
    el('div', { className: 'name', textContent: sound.name }),
    el('div', { className: 'desc', textContent: sound.description }),
  ]);
  card.dataset.id = sound.id;
  if (sound.pitched) card.querySelector('.name').append(' ', el('span', { className: 'tag', textContent: '♪ melodic' }));

  const preview = el('button', { className: 'icon-btn', textContent: '▶ Preview' });
  preview.onclick = (e) => { e.stopPropagation(); api.send('preview', { id: sound.id }); };
  const actions = el('div', { className: 'actions' }, preview);
  if (sound.custom) {
    const edit = el('button', { className: 'icon-btn', textContent: '✎ Edit' });
    edit.onclick = (e) => { e.stopPropagation(); openPackEditor(sound.id); };
    actions.append(edit);
  }
  card.append(actions);

  const choose = () => {
    setSetting({ soundId: sound.id });
    api.send('preview', { id: sound.id });
  };
  card.onclick = choose;
  card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
  return card;
}

function addCard(emoji, name, desc, onclick) {
  const card = el('button', { className: 'card add' }, [
    el('div', { className: 'emoji', textContent: emoji }),
    el('div', { className: 'name', textContent: name }),
    el('div', { className: 'desc', textContent: desc }),
  ]);
  card.onclick = onclick;
  return card;
}

function renderGrid() {
  const cards = sounds.filter((s) => filter === 'All' || s.category === filter).map(soundCard);
  if (filter === 'All') {
    const chaos = soundCard({ id: CHAOS_ID, name: 'Chaos Mode', emoji: '🎲', description: 'A random sound on every single key. Pure mayhem.' });
    chaos.classList.add('chaos');
    cards.push(chaos);
  }
  if (filter === 'All' || filter === 'Custom') {
    cards.push(addCard('＋', 'Add your own', 'Audio files or a shared .kbpack', importSounds));
    cards.push(addCard('🎙️', 'Record a sound', 'Use your microphone', () => openRecorder()));
  }
  $('#grid').replaceChildren(...cards);
  markSelected();
}

function markSelected() {
  for (const card of $$('.card[data-id]')) {
    card.classList.toggle('selected', card.dataset.id === settings.soundId);
    card.classList.toggle('profile-active', Boolean(runtime?.profileSoundId) && card.dataset.id === runtime.profileSoundId);
  }
}

async function importSounds() {
  const result = await api.invoke('packs:import');
  if (!result) return;
  const { added, skipped } = result;
  if (added.length) {
    await setSetting({ soundId: added[0].id });
    api.send('preview', { id: added[0].id });
    toast(`Added ${added.map((a) => `"${a.name}"`).join(', ')}`);
  }
  if (skipped.length) toast(`Skipped: ${skipped.join(', ')}`, 'error');
}

function renderPitch() {
  for (const btn of $$('#pitch-mode button')) btn.setAttribute('aria-checked', String(btn.dataset.value === settings.pitchMode));
  $('#pitch-hint').textContent = PITCH_HINTS[settings.pitchMode];
  $('#song-controls').hidden = settings.pitchMode !== 'song';
  const select = $('#song');
  if (select.options.length !== songs.length) {
    select.replaceChildren(...songs.map((s) => el('option', { value: s.id, textContent: `${s.name} — ${s.composer}` })));
  }
  select.value = settings.songId;
}

async function refreshSongProgress() {
  if (settings.pitchMode !== 'song') return;
  const { progress } = await api.invoke('songs:list');
  $('#song-progress').textContent = `Note ${progress.index + 1} of ${progress.length}`;
}

// ---------- Keys page ----------

function renderKeys() {
  const container = $('#overrides');
  if (!container.children.length) {
    container.append(...OVERRIDE_ROWS.map(([key, label]) => {
      const select = el('select', { id: `ov-${key}` });
      select.dataset.key = key;
      select.onchange = () => {
        setSetting({ overrides: { [key]: select.value } });
        if (select.value && select.value !== 'mute') api.send('preview', { id: select.value });
      };
      return el('div', { className: 'override' }, [el('label', { htmlFor: `ov-${key}`, textContent: label }), select]);
    }));
  }
  for (const [key] of OVERRIDE_ROWS) {
    setSelect($(`#ov-${key}`), soundOptions([['', 'Default'], ['mute', '🔇 Silent']], { chaos: true }), settings.overrides[key] ?? '');
  }
  setSelect($('#keyUpSound'), soundOptions([['', 'Off'], ['pack', 'Pack default']]), settings.keyUpSound);
}

// ---------- Effects page ----------

function renderEffects() {
  $('#fx-options').classList.toggle('off', !settings.fxEnabled);
  $('#fx-style').replaceChildren(...FX_STYLES.map(([value, label]) => el('button', {
    className: `chip${settings.fxStyle === value ? ' active' : ''}`,
    textContent: label,
    onclick: () => setSetting({ fxStyle: value }),
  })));
  const size = $('#fxSize');
  const pct = Math.round(settings.fxSize * 100);
  if (document.activeElement !== size) size.value = pct;
  size.style.setProperty('--fill', `${((pct - 50) / 150) * 100}%`);
  $('#fxSize-value').textContent = `${pct}%`;
  for (const btn of $$('#fx-position button')) btn.setAttribute('aria-checked', String(btn.dataset.value === settings.fxPosition));
}

// ---------- Apps page ----------

function renderApps() {
  if (!runtime) return;
  const { features } = runtime;
  $('#row-autoMuteMic').hidden = !features.micDetection;

  if (!features.appDetection) {
    $('#apps-now').textContent = 'Per-app profiles and full-screen detection are available on Windows.';
  } else if (runtime.muteReason && settings.enabled) {
    $('#apps-now').textContent = `${runtime.muteReason}.`;
  } else if (runtime.app) {
    const profile = runtime.profileSoundId ? soundById(runtime.profileSoundId) : null;
    $('#apps-now').textContent = profile
      ? `You're in ${runtime.appLabel} — playing ${profile.name} (profile).`
      : `You're in ${runtime.appLabel} — using your main sound.`;
  } else {
    $('#apps-now').textContent = 'Switch to another app to see it here.';
  }

  const list = $('#profiles');
  if (!settings.profiles.length) {
    list.replaceChildren(el('div', { className: 'empty', textContent: 'No profiles yet.' }));
  } else {
    list.replaceChildren(...settings.profiles.map((p, i) => {
      const select = el('select', { 'aria-label': `Sound for ${p.app}` });
      setSelect(select, soundOptions([['mute', '🔇 Mute']], { chaos: true }), p.soundId);
      select.onchange = () => updateProfile(i, { soundId: select.value });
      const remove = el('button', { className: 'icon-btn', textContent: '✕', title: 'Remove profile' });
      remove.onclick = () => setSetting({ profiles: settings.profiles.filter((_, j) => j !== i) });
      const isActive = runtime.app && runtime.app.toLowerCase() === p.app.toLowerCase();
      return el('div', { className: 'profile-row' }, [
        el('span', { className: `app${isActive ? ' active' : ''}`, textContent: p.app.replace(/\.exe$/i, ''), title: p.app }),
        select,
        remove,
      ]);
    }));
  }

  const taken = new Set(settings.profiles.map((p) => p.app.toLowerCase()));
  const candidates = runtime.recentApps.filter((a) => !taken.has(a.toLowerCase()));
  const picker = $('#profile-app');
  if (document.activeElement !== picker) {
    picker.replaceChildren(...(candidates.length
      ? candidates.map((a) => el('option', { value: a, textContent: a.replace(/\.exe$/i, '') }))
      : [el('option', { value: '', textContent: 'Recently used apps appear here' })]));
  }
  $('#profile-add').disabled = !candidates.length;
  for (const id of ['#profile-app', '#profile-add', '#profile-browse']) $(id).disabled ||= !features.appDetection;
}

function updateProfile(index, patch) {
  setSetting({ profiles: settings.profiles.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
}

function addProfile(app) {
  if (!app || settings.profiles.some((p) => p.app.toLowerCase() === app.toLowerCase())) return;
  setSetting({ profiles: [...settings.profiles, { app, soundId: 'mute' }] });
}

// ---------- Stats page ----------

function niceStep(max, ticks = 4) {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

const shortDate = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const longDate = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

let lastDaysJson = '';
function renderDayChart(days) {
  const json = JSON.stringify(days);
  if (json === lastDaysJson) return;
  lastDaysJson = json;

  const max = Math.max(...days.map((d) => d.count));
  const step = niceStep(max);
  const top = Math.max(step * 4, step * Math.ceil(max / step));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peakIndex = max > 0 ? days.findIndex((d) => d.count === max) : -1;

  const yAxis = el('div', { className: 'y-axis' }, ticks.map((t) => {
    const span = el('span', { textContent: fmt.format(t) });
    span.style.bottom = `${(t / top) * 100}%`;
    return span;
  }));
  const plot = el('div', { className: 'plot' });
  for (const t of ticks.slice(1)) {
    const line = el('div', { className: 'gridline' });
    line.style.bottom = `${(t / top) * 100}%`;
    plot.append(line);
  }
  const bars = el('div', { className: 'bars' }, days.map((d, i) => {
    const bar = el('div', { className: 'bar' });
    bar.style.height = `${(d.count / top) * 100}%`;
    const slot = el('div', { className: `slot${i === days.length - 1 ? ' today' : ''}` }, bar);
    slot.dataset.tip = `${fmt.format(d.count)} keys\n${longDate(d.day)}${i === days.length - 1 ? ' (today)' : ''}`;
    if (i === peakIndex) {
      const label = el('span', { className: 'bar-label', textContent: fmt.format(d.count) });
      label.style.bottom = `${(d.count / top) * 100}%`;
      slot.append(label);
    }
    return slot;
  }));
  plot.append(bars);
  $('#day-chart').replaceChildren(yAxis, plot);

  const xAxis = el('div', { className: 'chart-x' }, [
    el('span', { textContent: shortDate(days[0].day) }),
    el('span', { textContent: shortDate(days[15].day) }),
    el('span', { textContent: 'Today' }),
  ]);
  $('#day-chart').nextElementSibling?.classList.contains('chart-x')
    ? $('#day-chart').nextElementSibling.replaceWith(xAxis)
    : $('#day-chart').after(xAxis);

  $('#day-table tbody').replaceChildren(...[...days].reverse().map((d) => el('tr', {}, [
    el('td', { textContent: longDate(d.day) }), el('td', { textContent: fmt.format(d.count) }),
  ])));
}

const KEYBOARD_ROWS = [
  [['Backquote', '`'], ...'1234567890'.split('').map((k) => [k, k]), ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map((k) => [k, k]), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...'ASDFGHJKL'.split('').map((k) => [k, k]), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]],
  [['Shift', 'Shift', 2.25], ...'ZXCVBNM'.split('').map((k) => [k, k]), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]],
  [['Ctrl', 'Ctrl', 1.25], ['Meta', 'Win', 1.25], ['Alt', 'Alt', 1.25], ['Space', 'Space', 6.25], ['AltRight', 'Alt', 1.25], ['CtrlRight', 'Ctrl', 1.25]],
];
const KEY_UNIT = 40;

let lastKeysJson = '';
function renderHeatmap(keys) {
  const json = JSON.stringify(keys);
  if (json === lastKeysJson) return;
  lastKeysJson = json;
  const count = (k) => (keys[k] || 0) + (/^\d$/.test(k) ? keys[`Numpad${k}`] || 0 : 0);
  const max = Math.max(1, ...KEYBOARD_ROWS.flat().map(([k]) => count(k)));
  $('#heatmap').replaceChildren(...KEYBOARD_ROWS.map((row) => el('div', { className: 'heat-row' }, row.map(([k, label, w = 1]) => {
    const n = count(k);
    const heat = n ? 0.12 + 0.88 * Math.sqrt(n / max) : 0; // sqrt so rare keys still show
    const cell = el('div', { className: `heat-key${heat > 0.55 ? ' hot' : ''}`, textContent: label });
    cell.style.width = `${w * KEY_UNIT + (w - 1) * 4}px`;
    cell.style.setProperty('--heat', heat.toFixed(3));
    cell.dataset.tip = `${label === ' ' ? 'Space' : label}\n${fmt.format(n)} presses`;
    return cell;
  }))));
}

function renderAchievements(list) {
  const unlocked = list.filter((a) => a.unlockedAt).length;
  $('#ach-count').textContent = `${unlocked} of ${list.length} unlocked`;
  $('#achievements').replaceChildren(...list.map((a) => {
    const node = el('div', { className: `ach ${a.unlockedAt ? 'unlocked' : 'locked'}` }, [
      el('div', { className: 'ach-emoji', textContent: a.emoji }),
      el('div', {}, [el('div', { className: 'ach-name', textContent: a.name }), el('div', { className: 'ach-desc', textContent: a.description })]),
    ]);
    node.dataset.tip = a.unlockedAt ? `Unlocked\n${new Date(a.unlockedAt).toLocaleString()}` : `Locked\n${a.description}`;
    return node;
  }));
}

function renderStats(snap) {
  statsSnap = snap;
  if (!$('#page-stats').classList.contains('active')) return;
  $('#st-today').textContent = fmt.format(snap.today);
  $('#st-total').textContent = fmt.format(snap.total);
  $('#st-streak').textContent = fmt.format(snap.streak);
  $('#st-wpm').textContent = fmt.format(snap.currentWpm);
  $('#st-best-wpm').textContent = fmt.format(snap.bestWpm);
  $('#st-best-combo').textContent = fmt.format(snap.bestCombo);
  renderDayChart(snap.days);
  renderHeatmap(snap.keys);
  renderAchievements(snap.achievements);
}

async function refreshStats() {
  renderStats(await api.invoke('stats:get'));
}

// ---------- Settings page ----------

function renderSettingsPage() {
  if (!info) return;
  $('#hotkey').textContent = info.hotkey;
  if (!info.hotkeyRegistered) $('#hotkey-note').textContent = 'Unavailable — another app is using this shortcut';
  $('#about').textContent = `Keyboard Sounds v${info.version}`;
}

function renderUpdates(u) {
  const text = {
    dev: 'Updates work in the installed app (this is a development build).',
    idle: 'Not checked yet.',
    checking: 'Checking for updates…',
    latest: "You're on the latest version.",
    available: `Version ${u.version} is available.`,
    downloading: `Downloading version ${u.version}… ${u.progress}%`,
    ready: `Version ${u.version} is ready to install.`,
    error: `Couldn't check for updates: ${u.error}`,
  }[u.status] || '';
  $('#update-status').textContent = text;
  $('#update-check').disabled = u.status === 'dev' || u.status === 'checking' || u.status === 'downloading';
  $('#update-install').hidden = u.status !== 'ready';
}

// ---------- Render all ----------

function renderToggles() {
  for (const id of SIMPLE_TOGGLES) $(`#${id}`).checked = settings[id];
}

function renderAll() {
  renderStatus();
  renderToggles();
  markSelected();
  renderPitch();
  renderKeys();
  renderEffects();
  renderApps();
  if (!$('#pack-dialog').open) return;
  renderPackEditor();
}

// ---------- Pack editor ----------

let editingPack = null;

function openPackEditor(id) {
  editingPack = id;
  renderPackEditor();
  $('#pack-dialog').showModal();
}

function renderPackEditor() {
  const pack = sounds.find((s) => s.id === editingPack);
  if (!pack) { $('#pack-dialog').close(); return; }
  if (document.activeElement !== $('#pack-name')) $('#pack-name').value = pack.name;
  if (document.activeElement !== $('#pack-emoji')) $('#pack-emoji').value = pack.emoji;
  $('#pack-variants').replaceChildren(...pack.variants.map((_, i) => {
    const play = el('button', { type: 'button', className: 'icon-btn', textContent: '▶' });
    play.onclick = () => api.send('preview', { id: pack.id, index: i });
    const remove = el('button', { type: 'button', className: 'icon-btn', textContent: '✕', disabled: pack.variants.length === 1, title: 'Remove sound' });
    remove.onclick = () => api.invoke('packs:removeVariant', pack.id, i);
    return el('li', {}, [el('span', { textContent: `Sound ${i + 1}` }), play, remove]);
  }));
}

function bindPackEditor() {
  const save = () => api.invoke('packs:update', editingPack, { name: $('#pack-name').value, emoji: $('#pack-emoji').value });
  $('#pack-name').onchange = save;
  $('#pack-emoji').onchange = save;
  $('#pack-add-files').onclick = async () => {
    const result = await api.invoke('packs:addFiles', editingPack);
    if (result?.skipped.length) toast(`Skipped: ${result.skipped.join(', ')}`, 'error');
  };
  $('#pack-record').onclick = () => openRecorder(editingPack);
  $('#pack-export').onclick = async () => {
    const file = await api.invoke('packs:export', editingPack);
    if (file) toast('Saved! Anyone with Keyboard Sounds can double-click that file to install your pack.');
  };
  $('#pack-delete').onclick = async () => {
    const pack = sounds.find((s) => s.id === editingPack);
    if (!pack || !confirm(`Delete "${pack.name}"? This can't be undone.`)) return;
    await api.invoke('packs:delete', editingPack);
    $('#pack-dialog').close();
  };
}

// ---------- Recorder ----------

const MAX_RECORD_MS = 4000;
const rec = { stream: null, recorder: null, chunks: [], samples: null, sampleRate: 48000, timer: null, packId: null };
let previewCtx = null;
const getPreviewCtx = () => (previewCtx ||= new AudioContext());

function openRecorder(packId = null) {
  rec.packId = packId;
  rec.samples = null;
  $('#rec-edit').hidden = true;
  $('#rec-status').textContent = 'Press to record (up to 4 seconds). Clap, snap, say “pew”!';
  const customs = sounds.filter((s) => s.custom);
  setSelect($('#rec-target'), [
    el('option', { value: '', textContent: 'A new pack' }),
    ...customs.map((s) => el('option', { value: s.id, textContent: soundLabel(s) })),
  ], packId || '');
  $('#rec-dialog').showModal();
}

async function startRecording() {
  if (!(await api.invoke('mic:request'))) { toast('Microphone access was denied.', 'error'); return; }
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    toast('No microphone available.', 'error');
    return;
  }
  rec.chunks = [];
  rec.recorder = new MediaRecorder(rec.stream);
  rec.recorder.ondataavailable = (e) => rec.chunks.push(e.data);
  rec.recorder.onstop = processRecording;
  rec.recorder.start();
  rec.timer = setTimeout(stopRecording, MAX_RECORD_MS);
  $('#rec-toggle').classList.add('recording');
  $('#rec-status').textContent = 'Recording… press again to stop.';
}

function stopRecording() {
  clearTimeout(rec.timer);
  if (rec.recorder?.state === 'recording') rec.recorder.stop();
  rec.stream?.getTracks().forEach((t) => t.stop());
  rec.stream = null;
  $('#rec-toggle').classList.remove('recording');
}

async function processRecording() {
  try {
    const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType });
    const audio = await getPreviewCtx().decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / audio.numberOfChannels;
    }
    rec.samples = mono;
    rec.sampleRate = audio.sampleRate;
    autoTrim();
    $('#rec-edit').hidden = false;
    $('#rec-status').textContent = 'Trim it, give it a name, and save.';
    drawWave();
  } catch {
    toast("Couldn't read that recording. Try again?", 'error');
  }
}

// Cut leading/trailing silence so the sound fires instantly on a keystroke.
function autoTrim() {
  const s = rec.samples;
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const threshold = Math.max(0.01, peak * 0.08);
  let first = s.findIndex((v) => Math.abs(v) > threshold);
  let last = s.length - 1;
  while (last > 0 && Math.abs(s[last]) <= threshold) last--;
  if (first < 0) { first = 0; last = s.length - 1; }
  first = Math.max(0, first - Math.round(0.01 * rec.sampleRate));
  last = Math.min(s.length - 1, last + Math.round(0.08 * rec.sampleRate));
  $('#rec-start').value = Math.round((first / s.length) * 1000);
  $('#rec-end').value = Math.round((last / s.length) * 1000);
}

function selection() {
  const s = rec.samples;
  let a = Math.round((Number($('#rec-start').value) / 1000) * s.length);
  let b = Math.round((Number($('#rec-end').value) / 1000) * s.length);
  if (b - a < 0.02 * rec.sampleRate) b = Math.min(s.length, a + Math.round(0.02 * rec.sampleRate));
  if (a >= b) a = Math.max(0, b - 1);
  return s.slice(a, b);
}

function drawWave() {
  const canvas = $('#rec-wave');
  const dpr = devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const s = rec.samples;
  const styles = getComputedStyle(document.body);
  const accent = styles.getPropertyValue('--accent').trim();
  const muted = styles.getPropertyValue('--muted').trim();
  const start = (Number($('#rec-start').value) / 1000) * w;
  const end = (Number($('#rec-end').value) / 1000) * w;
  g.clearRect(0, 0, w, h);
  const per = Math.max(1, Math.floor(s.length / w));
  for (let x = 0; x < w; x++) {
    let min = 0;
    let max = 0;
    for (let i = x * per; i < (x + 1) * per && i < s.length; i++) {
      if (s[i] < min) min = s[i];
      if (s[i] > max) max = s[i];
    }
    g.fillStyle = x >= start && x <= end ? accent : muted;
    g.globalAlpha = x >= start && x <= end ? 1 : 0.35;
    g.fillRect(x, h / 2 - (max * h) / 2, 1, Math.max(1, ((max - min) * h) / 2));
  }
  g.globalAlpha = 1;
}

// Normalized, faded 16-bit mono WAV.
function encodeWav(samples, sampleRate) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const fade = Math.min(Math.round(0.005 * sampleRate), Math.floor(samples.length / 2));
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const text = (offset, str) => [...str].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * gain;
    if (i < fade) v *= i / fade;
    if (samples.length - 1 - i < fade) v *= (samples.length - 1 - i) / fade;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  return new Uint8Array(buf);
}

function bindRecorder() {
  $('#rec-toggle').onclick = () => (rec.recorder?.state === 'recording' ? stopRecording() : startRecording());
  $('#rec-again').onclick = () => { $('#rec-edit').hidden = true; startRecording(); };
  for (const id of ['#rec-start', '#rec-end']) $(id).oninput = drawWave;
  $('#rec-play').onclick = () => {
    const ctx = getPreviewCtx();
    const data = selection();
    const buffer = ctx.createBuffer(1, data.length, rec.sampleRate);
    buffer.copyToChannel(data, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  };
  $('#rec-save').onclick = async () => {
    try {
      await api.invoke('packs:saveRecording', {
        bytes: encodeWav(selection(), rec.sampleRate),
        name: $('#rec-name').value,
        packId: $('#rec-target').value || null,
      });
      $('#rec-dialog').close();
      toast('Saved! Your sound is ready to use.');
    } catch {
      toast("Couldn't save the recording.", 'error');
    }
  };
  $('#rec-dialog').addEventListener('close', stopRecording);
}

// ---------- Bindings ----------

async function reloadSounds() {
  sounds = await api.invoke('sounds:list');
  renderFilters();
  renderGrid();
  renderAll();
}

function bindControls() {
  for (const btn of $$('.sidebar button')) btn.onclick = () => showPage(btn.dataset.page);
  $('#enabled').onchange = (e) => setSetting({ enabled: e.target.checked });

  const volume = $('#volume');
  volume.oninput = () => {
    setVolumeUi(volume.value / 100);
    api.invoke('settings:set', { volume: volume.value / 100 });
  };
  volume.onchange = () => api.send('preview', { id: settings.soundId });

  for (const id of SIMPLE_TOGGLES) $(`#${id}`).onchange = (e) => setSetting({ [id]: e.target.checked });

  for (const btn of $$('#pitch-mode button')) {
    btn.onclick = async () => { await setSetting({ pitchMode: btn.dataset.value }); refreshSongProgress(); };
  }
  $('#song').onchange = async (e) => { await setSetting({ songId: e.target.value }); refreshSongProgress(); };
  $('#song-restart').onclick = async () => { await api.invoke('song:restart'); refreshSongProgress(); };
  $('#keyUpSound').onchange = (e) => setSetting({ keyUpSound: e.target.value });

  const size = $('#fxSize');
  size.oninput = () => setSetting({ fxSize: size.value / 100 });
  for (const btn of $$('#fx-position button')) btn.onclick = () => setSetting({ fxPosition: btn.dataset.value });

  $('#profile-add').onclick = () => addProfile($('#profile-app').value);
  $('#profile-browse').onclick = async () => addProfile(await api.invoke('profiles:browse'));

  $('#update-check').onclick = async () => renderUpdates(await api.invoke('updates:check'));
  $('#update-install').onclick = () => api.invoke('updates:install');

  bindPackEditor();
  bindRecorder();
}

// ---------- Boot ----------

(async () => {
  bindControls();
  const [s, list, rt, appInfo, songList, updates] = await Promise.all([
    api.invoke('settings:get'),
    api.invoke('sounds:list'),
    api.invoke('runtime:get'),
    api.invoke('app:info'),
    api.invoke('songs:list'),
    api.invoke('updates:get'),
  ]);
  settings = s;
  sounds = list;
  runtime = rt;
  info = appInfo;
  songs = songList.songs;

  renderFilters();
  renderGrid();
  renderAll();
  renderSettingsPage();
  renderUpdates(updates);
  showPage(storageGet('page') || 'sounds');
  refreshSongProgress();

  api.on('settings', (next) => { settings = next; renderAll(); });
  api.on('runtime', (next) => { runtime = next; renderStatus(); markSelected(); renderApps(); });
  api.on('stats', (snap) => { renderStats(snap); refreshSongProgress(); });
  api.on('sounds:changed', reloadSounds);
  api.on('updates', renderUpdates);
  api.on('toast', ({ message, kind }) => toast(message, kind));
})();
