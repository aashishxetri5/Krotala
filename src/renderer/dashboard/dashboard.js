// `api` is the IPC bridge exposed globally by src/preload.js.
const CHAOS_ID = '__chaos'; // keep in sync with src/shared/catalog.js
const CATEGORIES = ['All', 'Classic', 'Musical', 'Action', 'Retro', 'Funny', 'Custom'];
const PITCH_HINTS = {
  off: 'Every key plays the sound at its natural pitch.',
  wobble: 'Slight random detune on each press — feels more natural and less robotic.',
  melody: 'Each key is a note on a pentatonic scale. Best with Piano, Harmonium or Marimba.',
};

const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat();

let settings = null;
let sounds = [];
let filter = 'All';

// ---------- Rendering ----------

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

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
  const card = el('div', {
    className: 'card',
    tabIndex: 0,
    role: 'button',
    title: `Use ${sound.name}`,
  }, [
    el('div', { className: 'emoji', textContent: sound.emoji }),
    el('div', { className: 'name', textContent: sound.name }),
    el('div', { className: 'desc', textContent: sound.description }),
  ]);
  card.dataset.id = sound.id;
  if (sound.pitched) card.querySelector('.name').append(' ', el('span', { className: 'tag', textContent: '♪ melodic' }));

  const preview = el('button', { className: 'icon-btn', textContent: '▶ Preview' });
  preview.onclick = (e) => { e.stopPropagation(); api.send('preview', sound.id); };
  const actions = el('div', { className: 'actions' }, preview);

  if (sound.custom) {
    const remove = el('button', { className: 'icon-btn danger', textContent: 'Remove' });
    remove.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove "${sound.name}"?`)) return;
      await api.invoke('sounds:remove', sound.id);
    };
    actions.append(remove);
  }
  card.append(actions);

  const choose = () => {
    setSetting({ soundId: sound.id });
    api.send('preview', sound.id);
  };
  card.onclick = choose;
  card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
  return card;
}

function renderGrid() {
  const visible = sounds.filter((s) => filter === 'All' || s.category === filter);
  const cards = visible.map(soundCard);

  if (filter === 'All') {
    cards.push(soundCard({
      id: CHAOS_ID, name: 'Chaos Mode', emoji: '🎲',
      description: 'A random sound on every single key. Pure mayhem.',
    }));
    cards.at(-1).classList.add('chaos');
  }
  if (filter === 'All' || filter === 'Custom') {
    const add = el('button', { className: 'card add' }, [
      el('div', { className: 'emoji', textContent: '＋' }),
      el('div', { className: 'name', textContent: 'Add your own' }),
      el('div', { className: 'desc', textContent: 'WAV, MP3, OGG, FLAC…' }),
    ]);
    add.onclick = importSounds;
    cards.push(add);
  }
  $('#grid').replaceChildren(...cards);
  markSelected();
}

function markSelected() {
  for (const card of document.querySelectorAll('.card[data-id]')) {
    card.classList.toggle('selected', card.dataset.id === settings.soundId);
  }
}

function renderOverrides() {
  for (const select of document.querySelectorAll('select[data-key]')) {
    const options = [
      el('option', { value: '', textContent: 'Pack default' }),
      el('option', { value: 'mute', textContent: '🔇 Silent' }),
      ...sounds.map((s) => el('option', { value: s.id, textContent: `${s.emoji} ${s.name}` })),
    ];
    select.replaceChildren(...options);
    select.value = settings.overrides[select.dataset.key] ?? '';
  }
}

function setVolumeUi(volume) {
  const pct = Math.round(volume * 100);
  const slider = $('#volume');
  if (document.activeElement !== slider) slider.value = pct;
  slider.style.setProperty('--fill', `${pct}%`);
  $('#volume-value').textContent = `${pct}%`;
}

function renderSettings() {
  document.body.classList.toggle('disabled', !settings.enabled);
  $('#enabled').checked = settings.enabled;
  $('#enabled-label').textContent = settings.enabled ? 'On' : 'Off';
  setVolumeUi(settings.volume);

  for (const id of ['playOnRepeat', 'mouseClicks', 'launchAtLogin']) $(`#${id}`).checked = settings[id];
  for (const btn of document.querySelectorAll('#pitch-mode button')) {
    btn.setAttribute('aria-checked', String(btn.dataset.value === settings.pitchMode));
  }
  $('#pitch-hint').textContent = PITCH_HINTS[settings.pitchMode];

  const current = settings.soundId === CHAOS_ID
    ? 'Chaos Mode'
    : sounds.find((s) => s.id === settings.soundId)?.name ?? '—';
  $('#status-line').textContent = settings.enabled
    ? `Playing ${current} on every keystroke`
    : 'Muted — flip the switch to turn sounds back on';

  markSelected();
  for (const select of document.querySelectorAll('select[data-key]')) {
    select.value = settings.overrides[select.dataset.key] ?? '';
  }
}

function renderStats(stats) {
  const today = new Date().toLocaleDateString('en-CA');
  $('#stat-today').textContent = fmt.format(stats.day === today ? stats.today : 0);
  $('#stat-total').textContent = fmt.format(stats.total);
}

let toastTimer;
function toast(message, kind = 'info') {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
}

// ---------- Actions ----------

async function setSetting(patch) {
  settings = await api.invoke('settings:set', patch);
  renderSettings();
}

async function importSounds() {
  const { added, skipped } = await api.invoke('sounds:import');
  if (added.length) {
    await setSetting({ soundId: added[0].id });
    api.send('preview', added[0].id);
    toast(`Added ${added.map((a) => `"${a.name}"`).join(', ')}`);
  }
  if (skipped.length) toast(`Skipped: ${skipped.join(', ')}`, 'error');
}

async function reloadSounds() {
  sounds = await api.invoke('sounds:list');
  renderFilters();
  renderGrid();
  renderOverrides();
}

function bindControls() {
  $('#enabled').onchange = (e) => setSetting({ enabled: e.target.checked });

  const slider = $('#volume');
  slider.oninput = () => {
    setVolumeUi(slider.value / 100);
    api.invoke('settings:set', { volume: slider.value / 100 });
  };
  slider.onchange = () => api.send('preview', settings.soundId);

  for (const id of ['playOnRepeat', 'mouseClicks', 'launchAtLogin']) {
    $(`#${id}`).onchange = (e) => setSetting({ [id]: e.target.checked });
  }
  for (const btn of document.querySelectorAll('#pitch-mode button')) {
    btn.onclick = () => setSetting({ pitchMode: btn.dataset.value });
  }
  for (const select of document.querySelectorAll('select[data-key]')) {
    select.onchange = () => {
      setSetting({ overrides: { [select.dataset.key]: select.value } });
      if (select.value && select.value !== 'mute') api.send('preview', select.value);
    };
  }
}

// ---------- Boot ----------

(async () => {
  bindControls();
  const [s, list, info, stats] = await Promise.all([
    api.invoke('settings:get'),
    api.invoke('sounds:list'),
    api.invoke('app:info'),
    api.invoke('stats:get'),
  ]);
  settings = s;
  sounds = list;

  $('#hotkey').textContent = info.hotkey;
  $('#version').textContent = `v${info.version}`;
  if (!info.hotkeyRegistered) $('#hotkey-note').textContent = 'Unavailable — another app is using this shortcut';

  renderFilters();
  renderGrid();
  renderOverrides();
  renderSettings();
  renderStats(stats);

  api.on('settings', (next) => { settings = next; renderSettings(); });
  api.on('stats', renderStats);
  api.on('sounds:changed', reloadSounds);
  api.on('toast', ({ message, kind }) => toast(message, kind));
})();
