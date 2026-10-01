// On-screen effects renderer: a lightweight canvas particle system. The loop only
// runs while something is animating, so an idle overlay costs nothing.
// `api` is the IPC bridge exposed globally by src/preload.js.

const canvas = document.getElementById('fx');
const g = canvas.getContext('2d');
const particles = [];
let running = false;
let last = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const COLORS = ['#7c5cff', '#ff5c8a', '#ffb020', '#2ed3a0', '#3fb6ff', '#ff7a45'];
const NOTES = ['♪', '♫', '♬', '♩'];

// ---------- Spawners ----------

const spawners = {
  emoji({ x, y, size, emoji }) {
    particles.push({
      kind: 'text', text: emoji || '✨', x, y,
      vx: rand(-40, 40), vy: rand(-170, -110), gravity: 160,
      rot: rand(-0.4, 0.4), vr: rand(-2, 2), size: 30 * size, ttl: 1.1,
    });
  },
  notes({ x, y, size }) {
    particles.push({
      kind: 'text', text: pick(NOTES), color: pick(COLORS), x, y, sway: rand(0, Math.PI * 2),
      vx: rand(-15, 15), vy: rand(-120, -80), gravity: 0,
      rot: rand(-0.3, 0.3), vr: 0, size: 30 * size, ttl: 1.3,
    });
  },
  ripple({ x, y, size }) {
    particles.push({ kind: 'ring', x, y, r0: 4, r1: 48 * size, width: 3, color: pick(COLORS), ttl: 0.45 });
  },
  confetti({ x, y, size }) {
    for (let i = 0; i < 14; i++) {
      const angle = rand(-Math.PI, 0);
      const speed = rand(180, 420) * size;
      particles.push({
        kind: 'rect', x, y, w: rand(5, 9) * size, h: rand(8, 14) * size, color: pick(COLORS),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 900,
        rot: rand(0, Math.PI), vr: rand(-10, 10), ttl: rand(0.8, 1.2),
      });
    }
  },
  bubbles({ x, y, size }) {
    for (let i = 0; i < 3; i++) {
      particles.push({
        kind: 'bubble', x: x + rand(-14, 14), y, r: rand(6, 14) * size, sway: rand(0, Math.PI * 2),
        vx: 0, vy: rand(-140, -70), gravity: 0, ttl: rand(0.7, 1.1),
      });
    }
  },
  bullet({ x, y, size }) {
    const cracks = Array.from({ length: Math.floor(rand(5, 9)) }, () => {
      const angle = rand(0, Math.PI * 2);
      const len = rand(14, 34) * size;
      const bend = rand(-0.35, 0.35);
      return [angle, len, bend];
    });
    particles.push({ kind: 'hole', x, y, r: 7 * size, cracks, ttl: 1.8 });
    for (let i = 0; i < 8; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(120, 320);
      particles.push({
        kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 600,
        color: pick(['#ffd166', '#ff9f1c', '#fff3b0']), ttl: rand(0.2, 0.4),
      });
    }
  },
  laser({ x, y, size }) {
    const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1);
    particles.push({ kind: 'beam', x, y, angle, len: rand(140, 220) * size, color: pick(['#ff3df5', '#3dfcff', '#7dff6b']), ttl: 0.28 });
    particles.push({ kind: 'ring', x, y, r0: 2, r1: 18 * size, width: 2, color: '#ffffff', ttl: 0.2 });
  },
  slash({ x, y, size }) {
    const angle = rand(-0.9, -0.4) + (Math.random() < 0.5 ? Math.PI : 0);
    particles.push({ kind: 'slash', x, y, angle, len: rand(90, 150) * size, ttl: 0.32 });
  },
};

// ---------- Drawing ----------

function drawParticle(p, t) {
  const k = p.life / p.ttl;           // 0 → 1 over the particle's life
  const fade = 1 - k;
  g.save();
  switch (p.kind) {
    case 'text': {
      const pop = Math.min(1, p.life / 0.08);
      g.globalAlpha = Math.min(1, fade * 1.6);
      g.translate(p.x + (p.sway !== undefined ? Math.sin(t * 6 + p.sway) * 8 : 0), p.y);
      g.rotate(p.rot);
      g.scale(pop, pop);
      g.font = `700 ${p.size}px "Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (p.color) {
        g.fillStyle = p.color;
        g.shadowColor = p.color;
        g.shadowBlur = 12;
      }
      g.fillText(p.text, 0, 0);
      break;
    }
    case 'ring': {
      const ease = 1 - (1 - k) ** 3;
      g.globalAlpha = fade;
      g.strokeStyle = p.color;
      g.lineWidth = p.width * fade + 0.5;
      g.beginPath();
      g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'rect':
      g.globalAlpha = Math.min(1, fade * 2);
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      break;
    case 'bubble': {
      const x = p.x + Math.sin(t * 5 + p.sway) * 6;
      g.globalAlpha = Math.min(1, fade * 2);
      g.strokeStyle = 'rgba(160, 220, 255, 0.95)';
      g.fillStyle = 'rgba(160, 220, 255, 0.15)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      g.beginPath();
      g.arc(x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'hole': {
      g.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
      g.translate(p.x, p.y);
      g.strokeStyle = 'rgba(230, 230, 240, 0.75)';
      g.lineWidth = 1.2;
      for (const [angle, len, bend] of p.cracks) {
        g.beginPath();
        g.moveTo(Math.cos(angle) * p.r * 0.8, Math.sin(angle) * p.r * 0.8);
        g.quadraticCurveTo(
          Math.cos(angle + bend) * len * 0.6, Math.sin(angle + bend) * len * 0.6,
          Math.cos(angle) * len, Math.sin(angle) * len,
        );
        g.stroke();
      }
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, p.r * 1.6);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.55, '#14141a');
      grad.addColorStop(0.7, 'rgba(200, 200, 210, 0.9)');
      grad.addColorStop(1, 'rgba(200, 200, 210, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, p.r * 1.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'spark':
      g.globalAlpha = fade;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      g.fill();
      break;
    case 'beam': {
      const head = Math.min(1, k * 3) * p.len;
      const tail = Math.max(0, k * 3 - 1) * p.len * 0.5;
      g.globalAlpha = fade;
      g.strokeStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 16;
      g.lineCap = 'round';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(p.x + Math.cos(p.angle) * tail, p.y + Math.sin(p.angle) * tail);
      g.lineTo(p.x + Math.cos(p.angle) * head, p.y + Math.sin(p.angle) * head);
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke();
      break;
    }
    case 'slash': {
      const sweep = Math.min(1, k * 2.5);
      const dx = Math.cos(p.angle) * p.len;
      const dy = Math.sin(p.angle) * p.len;
      g.globalAlpha = fade;
      g.strokeStyle = '#ffffff';
      g.shadowColor = '#bfe3ff';
      g.shadowBlur = 14;
      g.lineCap = 'round';
      const steps = 12;
      for (let i = 0; i < steps * sweep; i++) {
        const a = i / steps;
        const b = (i + 1) / steps;
        const curve = (s) => [p.x - dx / 2 + dx * s, p.y - dy / 2 + dy * s - Math.sin(s * Math.PI) * p.len * 0.18];
        const [x1, y1] = curve(a);
        const [x2, y2] = curve(b);
        g.lineWidth = 1 + Math.sin(a * Math.PI) * 6;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      break;
    }
  }
  g.restore();
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  const t = ts / 1000;
  g.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life = (p.life || 0) + dt;
    if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
    if (p.vx !== undefined) {
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (p.vr) p.rot += p.vr * dt;
    drawParticle(p, t);
  }
  if (particles.length) requestAnimationFrame(frame);
  else running = false;
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

// ---------- Combo counter & banners ----------

const comboEl = document.getElementById('combo');
const comboCount = document.getElementById('combo-count');
let comboTimer;

function showCombo({ count }) {
  if (count < 10) return;
  comboCount.textContent = count;
  comboEl.classList.add('show');
  comboEl.classList.remove('bump');
  void comboEl.offsetWidth; // restart the bump animation
  comboEl.classList.add('bump');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => comboEl.classList.remove('show'), 900);
}

function showBanner({ title, sub, kind }) {
  const el = document.createElement('div');
  el.className = `banner ${kind || ''}`;
  const titleEl = document.createElement('div');
  titleEl.className = 'title';
  titleEl.textContent = title;
  const subEl = document.createElement('div');
  subEl.className = 'sub';
  subEl.textContent = sub || '';
  el.append(titleEl, subEl);
  document.getElementById('banners').append(el);
  el.addEventListener('animationend', () => el.remove());
}

api.on('fx', (fx) => {
  if (particles.length > 400) return; // keep it light even when mashing keys
  (spawners[fx.style] || spawners.emoji)(fx);
  start();
});
api.on('combo', showCombo);
api.on('banner', showBanner);
