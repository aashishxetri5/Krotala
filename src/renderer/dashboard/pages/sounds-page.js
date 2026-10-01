/**
 * @file Sounds page: pack grid with category filters, pitch and song selection, and
 * how sounds feel (sustain, stereo, echo).
 */

import { CHAOS_PACK } from '../../../shared/catalog.js';
import {
  CHAOS_SOUND_ID, Invoke, PitchMode, Send, SOUND_CATEGORIES, ToastKind,
} from '../../../shared/constants.js';
import { SONGS } from '../../../shared/songs.js';
import { api } from '../../shared/bridge.js';
import { $, h, setOptions } from '../../shared/dom.js';
import { readPreference, writePreference } from '../../shared/storage.js';
import { ECHO_MODES, PITCH_MODES } from '../copy.js';
import { bindChoiceGroup } from '../components/controls.js';
import { actionCard, soundCard } from '../components/sound-card.js';
import { withBusy } from '../ui/busy.js';
import { showError, showToast } from '../ui/toast.js';

const ALL = 'All';
const FILTER_PREFERENCE = 'sound-filter';

/**
 * @param {import('../store.js').Store} store - Dashboard store.
 * @param {object} dialogs
 * @param {import('../components/pack-editor.js').PackEditor} dialogs.packEditor
 * @param {import('../components/recorder.js').Recorder} dialogs.recorder
 * @returns {void}
 */
export function mountSoundsPage(store, { packEditor, recorder }) {
  const grid = $('#sound-grid');
  const filters = $('#filters');
  let filter = readPreference(FILTER_PREFERENCE) || ALL;

  const select = (id) => {
    store.saveSettings({ soundId: id });
    api.send(Send.PREVIEW, { id });
  };

  const importSounds = async (card) => {
    try {
      const result = await withBusy(card, () => api.invoke(Invoke.PACKS_IMPORT));
      if (!result) return;
      const { added, skipped } = result;
      if (added.length) {
        select(added[0].id);
        showToast({
          kind: ToastKind.SUCCESS,
          title: added.length === 1 ? `Added “${added[0].name}”` : `Added ${added.length} packs`,
          message: 'It is now your active sound.',
        });
      }
      if (skipped.length) showToast({ kind: ToastKind.WARNING, title: 'Some files were skipped', message: skipped.join(', ') });
    } catch (err) {
      showError("Couldn't add those sounds", err);
    }
  };

  const renderFilters = () => {
    const present = new Set(store.state.sounds.map((s) => s.category));
    const categories = [ALL, ...SOUND_CATEGORIES.filter((c) => present.has(c))];
    if (!categories.includes(filter)) filter = ALL;
    filters.replaceChildren(...categories.map((category) => h('button', {
      className: 'chip',
      text: category,
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(category === filter) },
      on: {
        click: () => {
          filter = category;
          writePreference(FILTER_PREFERENCE, category);
          renderFilters();
          renderGrid();
        },
      },
    })));
  };

  const markSelection = () => {
    const { settings, runtime } = store.state;
    if (!settings) return;
    for (const card of grid.querySelectorAll('.card[data-id]')) {
      const el = /** @type {HTMLElement} */ (card);
      el.setAttribute('aria-checked', String(el.dataset.id === settings.soundId));
      el.classList.toggle('profile-active', Boolean(runtime?.profileSoundId) && el.dataset.id === runtime.profileSoundId);
    }
  };

  const renderGrid = () => {
    const packs = store.state.sounds.filter((s) => filter === ALL || s.category === filter);
    const cards = packs.map((pack) => soundCard(pack, {
      onSelect: () => select(pack.id),
      onPreview: () => api.send(Send.PREVIEW, { id: pack.id }),
      onEdit: pack.custom ? () => packEditor.open(pack.id) : null,
    }));
    if (filter === ALL) {
      cards.push(soundCard({ id: CHAOS_SOUND_ID, ...CHAOS_PACK }, {
        onSelect: () => select(CHAOS_SOUND_ID),
        onPreview: () => api.send(Send.PREVIEW, { id: CHAOS_SOUND_ID }),
      }));
    }
    if (filter === ALL || filter === 'Custom') {
      cards.push(actionCard('upload', 'Add your own', 'Audio files or a shared .kbpack', importSounds));
      cards.push(actionCard('mic', 'Record a sound', 'Use your microphone', () => recorder.open()));
    }
    grid.replaceChildren(...cards);
    grid.removeAttribute('aria-busy');
    markSelection();
  };

  // Pitch mode and Song mode.
  const songRow = $('#song-row');
  const songSelect = /** @type {HTMLSelectElement} */ ($('#song'));
  const progress = $('#song-progress');
  bindChoiceGroup(store, $('#pitch-mode'), 'pitchMode', PITCH_MODES);
  bindChoiceGroup(store, $('#echo'), 'echo', ECHO_MODES);
  songSelect.addEventListener('change', () => store.saveSettings({ songId: songSelect.value }));
  $('#song-restart').addEventListener('click', async () => {
    await api.invoke(Invoke.SONG_RESTART);
    refreshSongProgress();
  });

  const refreshSongProgress = async () => {
    if (store.state.settings?.pitchMode !== PitchMode.SONG) return;
    const { index, length } = await api.invoke(Invoke.SONG_PROGRESS);
    progress.textContent = `Note ${index + 1} of ${length}`;
  };

  store.subscribe(['sounds'], ({ settings }) => {
    if (!settings) return; // Keep the loading skeleton until data arrives.
    renderFilters();
    renderGrid();
  });
  store.subscribe(['settings', 'runtime'], markSelection);
  store.subscribe(['settings'], ({ settings }) => {
    if (!settings) return;
    $('#pitch-hint').textContent = PITCH_MODES.find((m) => m.value === settings.pitchMode)?.hint ?? '';
    songRow.hidden = settings.pitchMode !== PitchMode.SONG;
    setOptions(songSelect, SONGS.map((s) => ({ value: s.id, label: `${s.name} (${s.composer})` })), settings.songId);
    refreshSongProgress();
  });
  store.subscribe(['stats'], refreshSongProgress);
}
