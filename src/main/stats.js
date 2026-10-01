// Typing stats, combos and achievements. Pure logic with an injectable clock,
// unit-tested in test/stats.test.js. Only counts are stored — never what was typed.

const COMBO_WINDOW_MS = 700;       // max gap between keys to keep a combo alive
const COMBO_MILESTONES = [25, 50, 100, 200, 300, 500, 1000];
const WPM_WINDOW_MS = 10_000;
const WPM_MIN_KEYS_FOR_BEST = 25;  // ignore tiny bursts when recording a best
const WPM_MAX_PLAUSIBLE = 250;     // anything above this is macro/paste noise
const HISTORY_DAYS = 365;

const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA'); // YYYY-MM-DD, local

const ACHIEVEMENTS = [
  { id: 'keys-100', emoji: '👋', name: 'Hello, World', description: 'Type 100 keys', test: (s) => s.total >= 100 },
  { id: 'keys-1k', emoji: '🔥', name: 'Warming Up', description: 'Type 1,000 keys', test: (s) => s.total >= 1_000 },
  { id: 'keys-10k', emoji: '⚔️', name: 'Keyboard Warrior', description: 'Type 10,000 keys', test: (s) => s.total >= 10_000 },
  { id: 'keys-100k', emoji: '🛠️', name: 'Keysmith', description: 'Type 100,000 keys', test: (s) => s.total >= 100_000 },
  { id: 'keys-1m', emoji: '👑', name: 'Legendary Typist', description: 'Type 1,000,000 keys', test: (s) => s.total >= 1_000_000 },
  { id: 'day-5k', emoji: '🏃', name: 'Marathon', description: 'Type 5,000 keys in one day', test: (s, t) => t.today >= 5_000 },
  { id: 'combo-50', emoji: '💫', name: 'On Fire', description: 'Reach a 50x combo', test: (s) => s.bestCombo >= 50 },
  { id: 'combo-200', emoji: '🌪️', name: 'Unstoppable', description: 'Reach a 200x combo', test: (s) => s.bestCombo >= 200 },
  { id: 'combo-500', emoji: '⚡', name: 'Godlike', description: 'Reach a 500x combo', test: (s) => s.bestCombo >= 500 },
  { id: 'wpm-60', emoji: '🐇', name: 'Quick Fingers', description: 'Hit 60 words per minute', test: (s) => s.bestWpm >= 60 },
  { id: 'wpm-100', emoji: '🏎️', name: 'Speed Demon', description: 'Hit 100 words per minute', test: (s) => s.bestWpm >= 100 },
  { id: 'packs-5', emoji: '🧭', name: 'Sound Explorer', description: 'Try 5 different sound packs', test: (s) => s.packsTried.length >= 5 },
  { id: 'packs-12', emoji: '🎧', name: 'Connoisseur', description: 'Try 12 different sound packs', test: (s) => s.packsTried.length >= 12 },
  { id: 'song-500', emoji: '🎼', name: 'Maestro', description: 'Play 500 notes in Song mode', test: (s) => s.songNotes >= 500 },
  { id: 'streak-3', emoji: '📅', name: 'Habit Forming', description: 'Type on 3 days in a row', test: (s, t) => t.streak >= 3 },
  { id: 'streak-7', emoji: '🗓️', name: 'Week Streak', description: 'Type on 7 days in a row', test: (s, t) => t.streak >= 7 },
  { id: 'night-owl', emoji: '🦉', name: 'Night Owl', description: 'Type between midnight and 4 AM', test: (s, t) => t.hour < 4 },
  { id: 'creator', emoji: '🎙️', name: 'Sound Designer', description: 'Create your own sound pack', test: (s) => s.packsCreated >= 1 },
];

const EMPTY = {
  total: 0,
  days: {},        // 'YYYY-MM-DD' -> key count
  keys: {},        // key name -> count (for the heatmap)
  bestWpm: 0,
  bestCombo: 0,
  songNotes: 0,
  packsTried: [],
  packsCreated: 0,
  achievements: {}, // id -> unlocked timestamp
};

class StatsTracker {
  constructor(data = {}, { now = Date.now } = {}) {
    this.now = now;
    this.data = { ...structuredClone(EMPTY), ...data };
    this.combo = 0;
    this.lastKeyAt = 0;
    this.recentPrintable = []; // timestamps
  }

  // Records one key press. Returns { combo, milestone, achievements } where
  // milestone is a combo number just reached (or null) and achievements are newly unlocked.
  record(key, { printable = false } = {}) {
    const t = this.now();
    const d = this.data;
    const day = dayKey(t);
    d.total += 1;
    d.days[day] = (d.days[day] || 0) + 1;
    d.keys[key] = (d.keys[key] || 0) + 1;

    this.combo = t - this.lastKeyAt <= COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastKeyAt = t;
    d.bestCombo = Math.max(d.bestCombo, this.combo);
    const milestone = COMBO_MILESTONES.includes(this.combo) ? this.combo : null;

    if (printable) {
      this.recentPrintable.push(t);
      while (this.recentPrintable.length && t - this.recentPrintable[0] > WPM_WINDOW_MS) this.recentPrintable.shift();
      if (this.recentPrintable.length >= WPM_MIN_KEYS_FOR_BEST) {
        const wpm = this.currentWpm();
        if (wpm <= WPM_MAX_PLAUSIBLE) d.bestWpm = Math.max(d.bestWpm, wpm);
      }
    }

    return { combo: this.combo, milestone, achievements: this.checkAchievements() };
  }

  // Words per minute over the last few seconds of typing (a word = 5 characters).
  currentWpm() {
    const t = this.now();
    const recent = this.recentPrintable.filter((ts) => t - ts <= WPM_WINDOW_MS);
    if (recent.length < 5 || t - recent.at(-1) > 3000) return 0;
    const spanMs = Math.max(recent.at(-1) - recent[0], 2000);
    return Math.round((recent.length / 5) / (spanMs / 60_000));
  }

  currentCombo() {
    return this.now() - this.lastKeyAt <= COMBO_WINDOW_MS ? this.combo : 0;
  }

  notePackTried(id) {
    if (!id || this.data.packsTried.includes(id)) return [];
    this.data.packsTried.push(id);
    return this.checkAchievements();
  }

  noteSongNote() {
    this.data.songNotes += 1;
  }

  notePackCreated() {
    this.data.packsCreated += 1;
    return this.checkAchievements();
  }

  today() {
    return this.data.days[dayKey(this.now())] || 0;
  }

  // Consecutive days with typing, ending today (or yesterday if nothing typed yet today).
  streak() {
    const oneDay = 86_400_000;
    let t = this.now();
    if (!this.data.days[dayKey(t)]) t -= oneDay;
    let streak = 0;
    while (this.data.days[dayKey(t)]) {
      streak += 1;
      t -= oneDay;
    }
    return streak;
  }

  lastDays(n = 30) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = dayKey(this.now() - i * 86_400_000);
      out.push({ day, count: this.data.days[day] || 0 });
    }
    return out;
  }

  checkAchievements() {
    const context = { today: this.today(), streak: this.streak(), hour: new Date(this.now()).getHours() };
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id] || !a.test(this.data, context)) continue;
      this.data.achievements[a.id] = this.now();
      unlocked.push(publicAchievement(a, this.now()));
    }
    return unlocked;
  }

  prune() {
    const cutoff = dayKey(this.now() - HISTORY_DAYS * 86_400_000);
    for (const day of Object.keys(this.data.days)) if (day < cutoff) delete this.data.days[day];
  }

  // Everything the dashboard's Stats page needs.
  snapshot() {
    return {
      total: this.data.total,
      today: this.today(),
      streak: this.streak(),
      currentWpm: this.currentWpm(),
      bestWpm: this.data.bestWpm,
      combo: this.currentCombo(),
      bestCombo: this.data.bestCombo,
      songNotes: this.data.songNotes,
      days: this.lastDays(30),
      keys: this.data.keys,
      achievements: ACHIEVEMENTS.map((a) => publicAchievement(a, this.data.achievements[a.id] || null)),
    };
  }
}

const publicAchievement = (a, unlockedAt) => ({
  id: a.id, emoji: a.emoji, name: a.name, description: a.description, unlockedAt,
});

module.exports = { StatsTracker, ACHIEVEMENTS, COMBO_MILESTONES, dayKey };
