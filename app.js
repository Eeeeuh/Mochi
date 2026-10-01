/* Mochi — petit compagnon pour les tâches du quotidien.
   Tout est stocké localement (localStorage). Les rappels passent par ntfy (https://ntfy.sh). */
'use strict';

// ---------------------------------------------------------------- utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pick = a => a[Math.floor(Math.random() * a.length)];
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
const diffDays = (a, b) => { // b - a, in days
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};
const atTime = (k, hhmm) => { const d = parseKey(k); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

// ---------------------------------------------------------------- sons doux (WebAudio, pas de fichiers)
let audioCtx;
function sfx(kind) {
  if (S.settings.sound === false) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'level' ? [523, 659, 784, 1047] : kind === 'step' ? [660] : kind === 'undo' ? [440] : [587, 880];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * .09;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .38);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + .4);
    });
  } catch (e) {}
}

// ---------------------------------------------------------------- data
const KEY = 'mochi.v1';
const SIZES = { 1: { xp: 10, c: 2, label: 'Petite', ic: '🌱' }, 2: { xp: 20, c: 4, label: 'Moyenne', ic: '🌿' }, 3: { xp: 35, c: 7, label: 'Grosse', ic: '🌳' } };
const NOTE_XP = 5, BONUS_XP = 25, BONUS_C = 5;

const PRESETS = [
  { emoji: '🍽️', name: 'Faire la vaisselle', rec: { type: 'daily' }, size: 2 },
  { emoji: '🛏️', name: 'Faire mon lit', rec: { type: 'daily' }, size: 1 },
  { emoji: '💊', name: 'Prendre mes médocs', rec: { type: 'daily' }, size: 1, time: '09:00' },
  { emoji: '💧', name: 'Boire un grand verre d\'eau', rec: { type: 'daily' }, size: 1 },
  { emoji: '🧽', name: 'Ranger 5 minutes', rec: { type: 'daily' }, size: 1 },
  { emoji: '🦷', name: 'Me brosser les dents', rec: { type: 'daily' }, size: 1 },
  { emoji: '🚿', name: 'Prendre ma douche', rec: { type: 'daily' }, size: 1 },
  { emoji: '🧺', name: 'Lancer une lessive', rec: { type: 'interval', every: 4 }, size: 2 },
  { emoji: '🗑️', name: 'Sortir les poubelles', rec: { type: 'interval', every: 3 }, size: 1 },
  { emoji: '🪴', name: 'Arroser les plantes', rec: { type: 'interval', every: 3 }, size: 1 },
  { emoji: '🧹', name: 'Passer l\'aspirateur', rec: { type: 'weekly', days: [6] }, size: 3 },
  { emoji: '🛒', name: 'Faire les courses', rec: { type: 'weekly', days: [3] }, size: 3 },
];
const EMOJIS = ['🍽️', '🧺', '🗑️', '🛏️', '💊', '💧', '🧹', '🧽', '🚿', '🦷', '🪴', '🛒', '🍳', '👕', '🐾', '📞', '💸', '📬', '🏃', '🧘', '📚', '💻', '🚗', '✨'];

const COLORS = {
  lilac: { name: 'Lilas', a: '#d9ccfb', b: '#a993ec', price: 0 },
  mint: { name: 'Menthe', a: '#c8f2df', b: '#7fcfac', price: 50 },
  peach: { name: 'Pêche', a: '#ffd9c7', b: '#f5a383', price: 50 },
  sky: { name: 'Ciel', a: '#cfe8fb', b: '#86bfeb', price: 50 },
  butter: { name: 'Beurre', a: '#fff0bf', b: '#f2cd62', price: 70 },
  rose: { name: 'Rose', a: '#fdd3e3', b: '#ee9abd', price: 70 },
  cloud: { name: 'Nuage', a: '#ffffff', b: '#d8d3e6', price: 90 },
  night: { name: 'Nuit', a: '#8c86c9', b: '#55509a', price: 160 },
};
const ITEMS = {
  bow: { name: 'Nœud', slot: 'head', price: 40, ic: '🎀' },
  flower: { name: 'Fleur', slot: 'head', price: 40, ic: '🌸' },
  party: { name: 'Cône fête', slot: 'head', price: 60, ic: '🥳' },
  glasses: { name: 'Lunettes', slot: 'face', price: 60, ic: '👓' },
  scarf: { name: 'Écharpe', slot: 'neck', price: 80, ic: '🧣' },
  beret: { name: 'Béret', slot: 'head', price: 100, ic: '🎨' },
  shades: { name: 'Lunettes de soleil', slot: 'face', price: 120, ic: '🕶️' },
  crown: { name: 'Couronne', slot: 'head', price: 250, ic: '👑' },
};
const STAGES = [
  { min: 1, key: 'egg', name: 'Œuf' },
  { min: 2, key: 'baby', name: 'Bébé' },
  { min: 5, key: 'small', name: 'Petit' },
  { min: 10, key: 'big', name: 'Grand' },
  { min: 20, key: 'spirit', name: 'Esprit' },
];

function defaults() {
  return {
    v: 1, onboarded: false, created: dkey(),
    pet: { name: 'Mochi', color: 'lilac', eq: {} },
    owned: ['lilac'], xp: 0, coins: 0,
    tasks: [], notes: [], log: {}, bonus: {},
    settings: { server: 'https://ntfy.sh', topic: '', enabled: false, recapOn: true, recap: '08:30', sound: true, theme: 'auto' },
    stepLog: {}, badDay: null,
    sched: {},
  };
}
let S;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(defaults(), JSON.parse(raw)); } catch (e) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ Impossible de sauvegarder'); }
}
S = load();

// ---------------------------------------------------------------- levels
const xpToNext = lvl => 40 + 20 * (lvl - 1);
function levelInfo(xp = S.xp) {
  let lvl = 1, rest = xp;
  while (rest >= xpToNext(lvl)) { rest -= xpToNext(lvl); lvl++; }
  return { lvl, cur: rest, need: xpToNext(lvl) };
}
const stageOf = lvl => [...STAGES].reverse().find(s => lvl >= s.min);

// ---------------------------------------------------------------- tasks logic
const doneEntries = k => S.log[k] || [];
const isDoneOn = (t, k) => doneEntries(k).some(e => e.id === t.id);
function isDue(t, k) {
  const r = t.rec;
  if (k < t.created && r.type !== 'once') return false;
  switch (r.type) {
    case 'daily': return true;
    case 'weekly': return (r.days || []).includes(parseKey(k).getDay());
    case 'interval': return !t.last || diffDays(t.last, k) >= (r.every || 1);
    case 'once': return !t.doneAt && k >= r.date;
  }
  return false;
}
function lateDays(t, k) {
  if (t.rec.type === 'interval' && t.last) return diffDays(t.last, k) - (t.rec.every || 1);
  if (t.rec.type === 'once') return diffDays(t.rec.date, k);
  return 0;
}
const isBadDay = (k = dkey()) => S.badDay === k;
function todayTasks(k = dkey()) {
  let base = S.tasks.filter(t => isDue(t, k) || isDoneOn(t, k));
  if (isBadDay(k)) { // mode petit jour : seulement l'essentiel (tâches marquées, sinon les 3 plus légères)
    const ess = base.filter(t => t.essential);
    const keep = new Set((ess.length ? ess : [...base].sort((a, b) => a.size - b.size).slice(0, 3)).map(t => t.id));
    base = base.filter(t => keep.has(t.id) || isDoneOn(t, k));
  }
  return base.sort((a, b) => {
    const da = isDoneOn(a, k), db = isDoneOn(b, k);
    if (da !== db) return da ? 1 : -1;
    if (!!a.time !== !!b.time) return a.time ? -1 : 1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.size - b.size;
  });
}
function recLabel(t) {
  const r = t.rec;
  if (r.type === 'daily') return 'Tous les jours';
  if (r.type === 'weekly') return (r.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAYS[d]).join(' · ') || 'Aucun jour';
  if (r.type === 'interval') return r.every === 1 ? 'Tous les jours (souple)' : `Tous les ${r.every} jours`;
  if (r.type === 'once') return `Le ${fmtDate(r.date)}`;
}
function fmtDate(k) { const d = parseKey(k); return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }

function completeTask(id, k = dkey(), fromEl) {
  const t = S.tasks.find(x => x.id === id);
  if (!t || isDoneOn(t, k)) return false;
  const sz = SIZES[t.size] || SIZES[1];
  (S.log[k] = S.log[k] || []).push({ id, xp: sz.xp, c: sz.c, prev: t.last || null, prevDone: t.doneAt || null });
  if (!t.last || t.last < k) t.last = k;
  if (t.rec.type === 'once') t.doneAt = k;
  t.count = (t.count || 0) + 1;
  sfx('done');
  reward(sz.xp, sz.c, fromEl);
  checkBonus(k);
  save(); scheduleSync();
  petReact('happy');
  return true;
}
function uncompleteTask(id, k = dkey()) {
  const arr = S.log[k] || [], i = arr.findIndex(e => e.id === id);
  if (i < 0) return;
  const e = arr[i], t = S.tasks.find(x => x.id === id);
  arr.splice(i, 1);
  if (t) { t.last = e.prev; t.doneAt = e.prevDone; t.count = Math.max(0, (t.count || 1) - 1); }
  S.xp = Math.max(0, S.xp - e.xp); S.coins = Math.max(0, S.coins - e.c);
  if (S.stepLog && S.stepLog[k]) delete S.stepLog[k][id];
  save(); scheduleSync();
}
function checkBonus(k) {
  if (S.bonus[k]) return;
  const list = todayTasks(k);
  if (list.length >= (isBadDay(k) ? 1 : 3) && list.every(t => isDoneOn(t, k))) {
    S.bonus[k] = true;
    setTimeout(() => { reward(BONUS_XP, BONUS_C); toast(`🌈 Journée complète ! +${BONUS_XP} XP bonus`); confetti(60); }, 700);
  }
}
function reward(xp, c, fromEl) {
  const before = levelInfo().lvl;
  S.xp += xp; S.coins += c;
  save();
  if (fromEl) floatText(`+${xp} XP`, fromEl);
  vibrate(18);
  const after = levelInfo().lvl;
  if (after > before) setTimeout(() => levelUp(before, after), 650);
  refreshHeader();
}

// ---------------------------------------------------------------- étapes
const stepsDone = (t, k) => ((S.stepLog || {})[k] || {})[t.id] || [];
function toggleStep(id, i, k = dkey()) {
  const t = S.tasks.find(x => x.id === id); if (!t || !t.steps) return;
  S.stepLog = S.stepLog || {};
  const m = (S.stepLog[k] = S.stepLog[k] || {}), arr = (m[id] = m[id] || []), pos = arr.indexOf(i);
  if (pos >= 0) arr.splice(pos, 1); else arr.push(i);
  save(); sfx(pos >= 0 ? 'undo' : 'step'); vibrate(10);
  if (pos < 0 && arr.length >= t.steps.length) { completeTask(id, k); confetti(25); }
  render();
}

// ---------------------------------------------------------------- streak / stats
function activeDays() { return Object.keys(S.log).filter(k => S.log[k].length).sort(); }
function streak() {
  const set = new Set(activeDays());
  let k = dkey(), n = 0;
  if (!set.has(k)) k = addDays(k, -1);
  while (set.has(k)) { n++; k = addDays(k, -1); }
  return n;
}
function totalDone() { return Object.values(S.log).reduce((a, l) => a + l.length, 0); }

// ---------------------------------------------------------------- pet rendering
function isNight() { const h = new Date().getHours(); return h >= 22 || h < 7; }
let awakeUntil = 0;
function petMood() {
  if (isNight() && Date.now() > awakeUntil) return 'sleep';
  const list = todayTasks(), done = list.filter(t => isDoneOn(t, dkey())).length;
  if (list.length && done === list.length) return 'joy';
  if (done > 0) return 'happy';
  return 'calm';
}
function petSVG(opts = {}) {
  const lvl = opts.lvl ?? levelInfo().lvl, st = (opts.stage || stageOf(lvl)).key;
  const col = COLORS[opts.color || S.pet.color] || COLORS.lilac, eq = opts.eq || S.pet.eq || {};
  const mood = opts.mood || petMood();
  const gid = 'g' + uid();
  const defs = `<defs>
    <radialGradient id="${gid}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${col.a}"/><stop offset="1" stop-color="${col.b}"/></radialGradient>
    <radialGradient id="${gid}au" cx="50%" cy="50%" r="50%"><stop offset=".55" stop-color="#fff6c9" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></radialGradient>
  </defs>`;
  const shadow = `<ellipse class="pet-shadow" cx="100" cy="186" rx="${st === 'egg' ? 34 : 58}" ry="7" fill="rgba(60,40,90,.13)"/>`;
  if (st === 'egg') {
    return `<svg viewBox="0 0 200 200">${defs}${shadow}<g class="egg-wobble">
      <path d="M100 70 C130 70 146 120 146 145 C146 172 126 184 100 184 C74 184 54 172 54 145 C54 120 70 70 100 70Z" fill="#fffaf3" stroke="#eadfce" stroke-width="2"/>
      <ellipse cx="86" cy="112" rx="9" ry="7" fill="${col.b}" opacity=".75"/><ellipse cx="117" cy="138" rx="12" ry="9" fill="${col.b}" opacity=".75"/>
      <ellipse cx="88" cy="160" rx="7" ry="5" fill="${col.b}" opacity=".75"/><ellipse cx="80" cy="96" rx="6" ry="10" fill="#fff" opacity=".8"/>
    </g></svg>`;
  }
  const scale = { baby: .62, small: .78, big: .92, spirit: 1 }[st];
  const eyes = mood === 'sleep'
    ? `<path d="M70 126 Q78 132 86 126" stroke="#3b3346" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M114 126 Q122 132 130 126" stroke="#3b3346" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    : mood === 'joy'
      ? `<path d="M70 128 Q78 118 86 128" stroke="#3b3346" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M114 128 Q122 118 130 128" stroke="#3b3346" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : `<g class="eye"><ellipse cx="78" cy="124" rx="6.5" ry="8.5" fill="#3b3346"/><circle cx="80.5" cy="120.5" r="2.4" fill="#fff"/></g>
         <g class="eye"><ellipse cx="122" cy="124" rx="6.5" ry="8.5" fill="#3b3346"/><circle cx="124.5" cy="120.5" r="2.4" fill="#fff"/></g>`;
  const mouth = mood === 'joy' ? `<path d="M90 139 Q100 154 110 139 Z" fill="#7a3b4f"/><path d="M95 146 Q100 150 105 146" fill="#f08aa0"/>`
    : mood === 'happy' ? `<path d="M91 139 Q100 149 109 139" stroke="#3b3346" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      : mood === 'sleep' ? `<ellipse cx="100" cy="142" rx="3.5" ry="2.5" fill="#3b3346"/>`
        : `<path d="M94 140 Q100 145 106 140" stroke="#3b3346" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  const limbs = st === 'baby' ? '' : `
    <ellipse cx="78" cy="181" rx="13" ry="7" fill="${col.b}"/><ellipse cx="122" cy="181" rx="13" ry="7" fill="${col.b}"/>
    <ellipse cx="29" cy="148" rx="9" ry="13" fill="${col.b}" transform="rotate(25 29 148)"/><ellipse cx="171" cy="148" rx="9" ry="13" fill="${col.b}" transform="rotate(-25 171 148)"/>`;
  const sprout = (st === 'big' || st === 'spirit') && !eq.head ? `
    <path d="M100 62 Q99 50 101 42" stroke="#6fb38e" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M101 46 Q88 32 78 42 Q90 50 101 46Z" fill="#8fd1a8"/><path d="M101 44 Q114 28 125 38 Q113 48 101 44Z" fill="#a7dfbb"/>` : '';
  const aura = st === 'spirit' ? `<circle class="aura" cx="100" cy="122" r="98" fill="url(#${gid}au)"/>
    <text x="30" y="70" font-size="14">✨</text><text x="160" y="90" font-size="12">✨</text>` : '';
  const zzz = mood === 'sleep' ? `<text class="zzz" x="150" y="72" font-size="22" font-weight="800" fill="#b8b0d8">z</text><text class="zzz" x="164" y="56" font-size="16" font-weight="800" fill="#b8b0d8" style="animation-delay:1.2s">z</text>` : '';
  return `<svg viewBox="0 0 200 200">${defs}${aura}${shadow}
    <g class="pet-body"><g transform="translate(100 182) scale(${scale}) translate(-100 -182)">
      ${limbs}
      <path d="M100 60 C152 60 176 110 176 146 C176 173 146 184 100 184 C54 184 24 173 24 146 C24 110 48 60 100 60Z" fill="url(#${gid})"/>
      <ellipse cx="74" cy="88" rx="16" ry="9" fill="#fff" opacity=".45" transform="rotate(-25 74 88)"/>
      ${neckItem(eq.neck)}
      ${sprout}
      ${eyes}
      <ellipse cx="62" cy="140" rx="10" ry="6" fill="#ff9fb2" opacity=".55"/><ellipse cx="138" cy="140" rx="10" ry="6" fill="#ff9fb2" opacity=".55"/>
      ${mouth}
      ${faceItem(eq.face)}
      ${headItem(eq.head)}
    </g></g>${zzz}</svg>`;
}
function headItem(id) {
  switch (id) {
    case 'bow': return `<g transform="translate(132 72) rotate(15)"><path d="M0 0 L-20 -12 L-20 12Z" fill="#ff7fa3"/><path d="M0 0 L20 -12 L20 12Z" fill="#ff7fa3"/><circle r="6" fill="#ff5c8a"/></g>`;
    case 'flower': return `<g transform="translate(64 74)">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="7" ry="11" cy="-9" fill="#ffc2d6" transform="rotate(${a})"/>`).join('')}<circle r="6" fill="#ffd166"/></g>`;
    case 'party': return `<g transform="translate(100 66) rotate(-8)"><path d="M-20 0 L0 -50 L20 0Z" fill="#7cc6fe"/><path d="M-13 -16 L13 -16 M-7 -32 L7 -32" stroke="#ffd166" stroke-width="5"/><circle cy="-52" r="7" fill="#ff7fa3"/></g>`;
    case 'beret': return `<g transform="translate(96 64) rotate(-10)"><ellipse rx="40" ry="13" fill="#e2566f"/><ellipse cy="-6" rx="34" ry="12" fill="#ef6b83"/><path d="M0 -17 L2 -27" stroke="#c94660" stroke-width="5" stroke-linecap="round"/></g>`;
    case 'crown': return `<g transform="translate(100 62)"><path d="M-28 4 L-30 -24 L-15 -10 L0 -30 L15 -10 L30 -24 L28 4Z" fill="#f7c948" stroke="#e0a82e" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-8" r="4" fill="#ff6b8b"/><circle cx="-18" cy="-4" r="3" fill="#7cc6fe"/><circle cx="18" cy="-4" r="3" fill="#7cc6fe"/></g>`;
  }
  return '';
}
function faceItem(id) {
  if (id === 'glasses') return `<g fill="rgba(255,255,255,.25)" stroke="#3b3346" stroke-width="3.5"><circle cx="78" cy="124" r="15"/><circle cx="122" cy="124" r="15"/><path d="M93 122 Q100 116 107 122" fill="none"/></g>`;
  if (id === 'shades') return `<g><path d="M60 114 H96 Q96 138 78 138 Q60 138 60 114Z M104 114 H140 Q140 138 122 138 Q104 138 104 114Z" fill="#2e2a3a"/><path d="M96 117 H104" stroke="#2e2a3a" stroke-width="4"/><path d="M66 119 L74 119" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/></g>`;
  return '';
}
function neckItem(id) {
  if (id === 'scarf') return `<path d="M36 160 Q100 182 164 160 L166 172 Q100 194 34 172Z" fill="#7cc6fe"/><path d="M130 170 L138 196 L152 192 L142 166Z" fill="#5fb2ef"/>`;
  return '';
}

const MSG = {
  calm: ['Coucou toi 👋', 'On commence par un petit truc ?', 'Une seule tâche, ça compte déjà !', 'Je suis là, on y va doucement 🌿', 'Pas besoin d\'être parfait·e 💜', 'Respire. Une chose à la fois.'],
  happy: ['Trop bien, continue ! ✨', 'Je me sens grandir 🌱', 'Tu gères 💪', 'Encore une et on fait la fête ?', 'Fier·e de toi !'],
  joy: ['Journée complète !! 🎉', 'Tu es incroyable 🌈', 'Repos mérité, vraiment 😌', 'Meilleure équipe 💜'],
  sleep: ['Zzz… 😴', '…mmh ? Bonne nuit 🌙', 'Dodo, on verra demain 💤'],
  egg: ['*toc toc* 🥚', 'Fais une tâche pour me faire éclore !', 'Ça bouge là-dedans…'],
};
let bubbleTimer;
function say(text, ms = 2600) {
  const b = $('#bubble'); if (!b) return;
  b.textContent = text; b.classList.add('show');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.remove('show'), ms);
}
function petReact(kind) {
  const p = $('#pet'); if (!p) return;
  drawPet();
  p.classList.remove('jump', 'wiggle'); void p.offsetWidth;
  p.classList.add(kind === 'happy' ? 'jump' : 'wiggle');
  const st = stageOf(levelInfo().lvl).key;
  say(pick(st === 'egg' ? MSG.egg : MSG[kind === 'happy' ? 'happy' : petMood()]));
}
function drawPet() { const p = $('#pet'); if (p) p.innerHTML = petSVG(); }

// ---------------------------------------------------------------- UI shell
let tab = 'today';
function setTab(t) {
  tab = t;
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render(); window.scrollTo(0, 0);
}
$$('.nav button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

function header(title, sub) {
  return `<header class="topbar"><div><div class="hello">${esc(sub)}</div><div class="title">${esc(title)}</div></div>
    <div class="pills"><span class="pill" id="coins">🪙 ${S.coins}</span><button class="icon-btn" data-act="settings" aria-label="Réglages">⚙️</button></div></header>`;
}
function refreshHeader() {
  const c = $('#coins'); if (c) c.textContent = `🪙 ${S.coins}`;
  const li = levelInfo(), bar = $('#xpbar');
  if (bar) { bar.style.width = `${Math.round(li.cur / li.need * 100)}%`; $('#xplbl').innerHTML = `<b>Niveau ${li.lvl}</b>`; $('#xpnum').textContent = `${li.cur} / ${li.need} XP`; }
  const ps = $('.pet-stage'); if (ps) ps.textContent = `${stageOf(li.lvl).name} · Nv ${li.lvl}`;
}
function applyTheme() {
  const t = S.settings.theme || 'auto', r = document.documentElement;
  if (t === 'auto') delete r.dataset.theme; else r.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#16131d' : '#f6f1ea';
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {}
function render() {
  document.documentElement.dataset.night = isNight() ? '1' : '0';
  $('.nav button[data-tab=pet]').innerHTML = `<span class="ic">🎀</span>${esc(S.pet.name.slice(0, 10))}`;
  const app = $('#app');
  app.innerHTML = ({ today: viewToday, routines: viewRoutines, notes: viewNotes, pet: viewPet, settings: viewSettings })[tab]();
  if (tab === 'today' || tab === 'pet') { drawPet(); refreshHeader(); }
}

// ---------------------------------------------------------------- views
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}
function viewToday() {
  const k = dkey(), list = todayTasks(k), done = list.filter(t => isDoneOn(t, k)).length;
  const d = new Date(), li = levelInfo();
  const notesToday = S.notes.filter(n => !n.done && (n.pinned || (n.remind && n.remind.slice(0, 10) <= k)));
  const stars = Array.from({ length: 14 }, (_, i) => `<i class="star" style="left:${(i * 37) % 100}%;top:${(i * 23) % 55}%;animation-delay:${i * .3}s"></i>`).join('');
  return `${header(`${greeting()} ✨`, `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`)}
  <div class="scene">${stars}
    <div class="cloud" style="top:40px;width:60px;animation-delay:-8s"></div><div class="cloud" style="top:86px;width:44px;animation-delay:-26s;animation-duration:55s"></div>
    <div class="ground"></div>
    <span class="deco" style="left:22px;bottom:30px">🌷</span><span class="deco" style="right:26px;bottom:34px">🌿</span>
    <div id="bubble" class="bubble"></div>
    <div id="pet" data-act="pet"></div>
    <div class="pet-name">${esc(S.pet.name)}</div><div class="pet-stage">${stageOf(li.lvl).name} · Nv ${li.lvl}</div>
  </div>
  <div class="xpcard"><div class="xprow"><span id="xplbl"></span><span id="xpnum"></span></div><div class="bar"><i id="xpbar"></i></div></div>
  <div class="section">
    ${list.length && done < list.length ? `<button class="one-thing" data-act="focus"><span class="big">🎯</span><div><b>Juste une chose</b><span>Je te choisis une tâche, tu fais 5 minutes. C'est tout.</span></div></button>` : ''}
  </div>
  <div class="section">
    ${isBadDay(k) ? `<div class="badday"><span>🌧️</span><div><b>Petit jour</b><p class="small">Seulement l'essentiel aujourd'hui. Le reste peut attendre, vraiment.</p></div><button class="btn ghost" data-act="badday">Revenir</button></div>`
      : `<button class="linkbtn" data-act="badday">🌧️ Journée difficile ? Ne garder que l'essentiel</button>`}
    <div class="section-head"><h2>Aujourd'hui</h2><span class="sub">${done}/${list.length} fait${done > 1 ? 's' : ''}</span></div>
    ${list.length ? `<div class="list">${list.map(t => taskItem(t, k)).join('')}</div>`
      : `<div class="empty"><div class="big">🌤️</div><b>Rien de prévu aujourd'hui</b><p class="small">Ajoute une routine avec le bouton +, ou profite 😌</p></div>`}
  </div>
  ${notesToday.length ? `<div class="section"><div class="section-head"><h2>À ne pas oublier</h2></div><div class="list">${notesToday.map(noteItem).join('')}</div></div>` : ''}
  <button class="fab" data-act="add-task" aria-label="Ajouter">+</button>`;
}
function taskItem(t, k) {
  const done = isDoneOn(t, k), sz = SIZES[t.size] || SIZES[1], late = !done ? lateDays(t, k) : 0;
  const meta = [];
  if (t.time) meta.push(`<span class="tag">⏰ ${t.time}</span>`);
  if (late > 0) meta.push(`<span class="tag late">en attente depuis ${late} j</span>`);
  meta.push(`<span class="tag xp">+${sz.xp} XP</span>`);
  const st = t.steps || [], sd = stepsDone(t, k);
  if (st.length && !done) meta.unshift(`<span class="tag">${sd.length}/${st.length} étapes</span>`);
  const sub = st.length && !done ? `<div class="steps-list">${st.map((x, i) => `<button class="step ${sd.includes(i) ? 'on' : ''}" data-act="step" data-id="${t.id}" data-i="${i}"><span class="sbox">${sd.includes(i) ? '✓' : ''}</span>${esc(x)}</button>`).join('')}</div>` : '';
  return `<div class="taskwrap"><div class="item ${done ? 'done' : ''}" data-act="toggle" data-id="${t.id}">
    <span class="emoji">${t.emoji}</span><div class="txt"><div class="name">${esc(t.name)}</div><div class="meta">${meta.join('')}</div></div>
    <span class="check">✓</span></div>${sub}</div>`;
}
function noteItem(n) {
  const meta = [];
  if (n.remind) meta.push(`<span class="tag ${n.remind < new Date().toISOString().slice(0, 16) && !n.done ? 'late' : ''}">⏰ ${fmtRemind(n.remind)}</span>`);
  if (n.pinned) meta.push(`<span class="tag pin">📌 épinglé</span>`);
  return `<div class="item note ${n.done ? 'done' : ''}">
    <span class="check" data-act="note-done" data-id="${n.id}">✓</span>
    <div class="txt" data-act="edit-note" data-id="${n.id}"><div class="name">${esc(n.text)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div></div>`;
}
function fmtRemind(r) {
  const [k, hm] = r.split('T'), today = dkey();
  const day = k === today ? 'aujourd\'hui' : k === addDays(today, 1) ? 'demain' : k === addDays(today, -1) ? 'hier' : fmtDate(k);
  return `${day} ${hm}`;
}
function viewRoutines() {
  const groups = [['daily', 'Chaque jour'], ['interval', 'Tous les X jours'], ['weekly', 'Certains jours'], ['once', 'Une seule fois']];
  const k = dkey();
  const body = S.tasks.length ? groups.map(([type, label]) => {
    const ts = S.tasks.filter(t => t.rec.type === type && !(type === 'once' && t.doneAt));
    if (!ts.length) return '';
    return `<div class="section"><div class="section-head"><h2>${label}</h2></div><div class="list">${ts.map(t => `
      <div class="item" data-act="edit-task" data-id="${t.id}"><span class="emoji">${t.emoji}</span>
        <div class="txt"><div class="name">${esc(t.name)}</div><div class="meta"><span class="tag">${recLabel(t)}</span>${t.time ? `<span class="tag">⏰ ${t.time}</span>` : ''}
        ${t.rec.type === 'interval' && t.last ? `<span class="tag">fait ${diffDays(t.last, k) === 0 ? 'aujourd\'hui' : `il y a ${diffDays(t.last, k)} j`}</span>` : ''}
        <span class="tag xp">${SIZES[t.size].ic} ${SIZES[t.size].xp} XP</span></div></div><span class="edit-btn">›</span></div>`).join('')}</div></div>`;
  }).join('') : `<div class="section"><div class="empty"><div class="big">🔁</div><b>Aucune routine pour l'instant</b><p class="small">Ajoute les trucs que tu oublies tout le temps.</p><button class="btn" data-act="presets">✨ Choisir parmi des idées</button></div></div>`;
  return `${header('Routines', 'Ce qui revient souvent')}${body}
    ${S.tasks.length ? `<div class="section"><button class="btn soft block" data-act="presets">✨ Ajouter depuis les idées</button></div>` : ''}
    <button class="fab" data-act="add-task" aria-label="Ajouter">+</button>`;
}
let noteFilter = 'todo';
function viewNotes() {
  const todo = S.notes.filter(n => !n.done).sort((a, b) => (b.pinned - a.pinned) || ((a.remind || '9') < (b.remind || '9') ? -1 : 1));
  const done = S.notes.filter(n => n.done).sort((a, b) => (b.doneAt || '') < (a.doneAt || '') ? -1 : 1);
  const list = noteFilter === 'todo' ? todo : done;
  return `${header('Pense-bête', 'Vide ta tête ici')}
  <div class="section">
    <div class="notes-filter"><button class="chip ${noteFilter === 'todo' ? 'on' : ''}" data-act="nf" data-v="todo">À faire (${todo.length})</button><button class="chip ${noteFilter === 'done' ? 'on' : ''}" data-act="nf" data-v="done">Faits (${done.length})</button></div>
    ${list.length ? `<div class="list">${list.map(noteItem).join('')}</div>`
      : `<div class="empty"><div class="big">🧠</div><b>${noteFilter === 'todo' ? 'Tête vide, esprit léger' : 'Rien ici pour l\'instant'}</b><p class="small">Note un truc dès qu'il te passe par la tête, et ajoute un rappel si besoin.</p></div>`}
    ${noteFilter === 'done' && done.length ? `<div style="margin-top:12px"><button class="btn ghost block" data-act="clear-done">🧹 Effacer les notes faites</button></div>` : ''}
  </div>
  <button class="fab" data-act="add-note" aria-label="Nouvelle note">+</button>`;
}
function viewPet() {
  const li = levelInfo(), st = stageOf(li.lvl), next = STAGES.find(s => s.min > li.lvl);
  return `${header(S.pet.name, `${st.name} · niveau ${li.lvl}`)}
  <div class="scene" style="height:230px"><div class="ground"></div><div id="bubble" class="bubble"></div><div id="pet" data-act="pet" style="width:170px;height:170px"></div></div>
  <div class="xpcard"><div class="xprow"><span id="xplbl"></span><span id="xpnum"></span></div><div class="bar"><i id="xpbar"></i></div>
    <div class="hint">${next ? `Prochaine évolution : <b>${next.name}</b> au niveau ${next.min}` : 'Forme finale atteinte 🌟'}</div></div>
  <div class="section"><div class="stats">
    <div class="stat"><b>🔥 ${streak()}</b><span>jours d'affilée</span></div>
    <div class="stat"><b>✅ ${totalDone()}</b><span>tâches faites</span></div>
    <div class="stat"><b>📅 ${activeDays().length}</b><span>jours actifs</span></div>
  </div></div>
  <div class="section"><div class="section-head"><h2>Ta semaine</h2><span class="sub">tâches faites par jour</span></div>${weekChart()}</div>
  <div class="section"><div class="section-head"><h2>Accessoires</h2><span class="sub">🪙 ${S.coins}</span></div>
    <div class="grid">${Object.entries(ITEMS).map(([id, it]) => {
      const own = S.owned.includes(id), on = S.pet.eq[it.slot] === id;
      return `<button class="shop-item ${on ? 'on' : ''} ${!own && S.coins < it.price ? 'locked' : ''}" data-act="item" data-id="${id}"><div class="ic">${it.ic}</div><div class="nm">${it.name}</div><div class="pr">${on ? 'Porté ✓' : own ? 'Mettre' : `🪙 ${it.price}`}</div></button>`;
    }).join('')}</div></div>
  <div class="section"><div class="section-head"><h2>Couleurs</h2></div>
    <div class="grid">${Object.entries(COLORS).map(([id, c]) => {
      const own = S.owned.includes(id), on = S.pet.color === id;
      return `<button class="shop-item ${on ? 'on' : ''} ${!own && S.coins < c.price ? 'locked' : ''}" data-act="color" data-id="${id}"><div class="swatch" style="background:radial-gradient(circle at 35% 30%, ${c.a}, ${c.b})"></div><div class="nm">${c.name}</div><div class="pr">${on ? 'Actuelle ✓' : own ? 'Choisir' : `🪙 ${c.price}`}</div></button>`;
    }).join('')}</div></div>
  <div class="section"><p class="small muted" style="text-align:center">💜 ${esc(S.pet.name)} ne tombe jamais malade et ne t'en veut jamais. Si tu disparais quelques jours, il dort simplement en t'attendant.</p></div>`;
}
function weekChart() {
  const k0 = dkey(), days = Array.from({ length: 7 }, (_, i) => addDays(k0, i - 6));
  const vals = days.map(k => (S.log[k] || []).length), max = Math.max(3, ...vals);
  return `<div class="week">${days.map((k, i) => `<div class="wcol"><div class="wnum">${vals[i] || ''}</div><div class="wbar"><i style="height:${Math.round(vals[i] / max * 100)}%" class="${k === k0 ? 'today' : ''}"></i></div><div class="wday">${DAYS[parseKey(k).getDay()].slice(0, 2)}</div></div>`).join('')}</div>`;
}
function viewSettings() {
  const s = S.settings, ok = s.enabled && s.topic;
  const host = s.server.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `<header class="topbar"><div><div class="hello">Réglages</div><div class="title">Paramètres</div></div><button class="icon-btn" data-act="back">✕</button></header>
  <div class="section">
    <div class="card"><h4>🐣 Ton compagnon</h4>
      <div class="field"><label>Son nom</label><input class="input" id="petname" maxlength="16" value="${esc(S.pet.name)}"></div></div>

    <div class="card"><h4>🎨 Apparence</h4>
      <div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button class="chip ${(s.theme || 'auto') === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="hint">Auto suit le réglage de ton téléphone.</p></div>

    <div class="card"><h4>🔊 Sons</h4>
      <div class="toggle"><span>Petits sons doux</span><button class="switch ${S.settings.sound !== false ? 'on' : ''}" data-act="toggle-sound"></button></div></div>

    <div class="card"><h4>🔔 Notifications <span class="small muted">(via ntfy)</span></h4>
      <p class="small"><span class="status-dot ${ok ? 'ok' : 'warn'}"></span>${ok ? `Activées · ${Object.keys(S.sched).length} rappel(s) programmé(s)` : 'Pas encore activées'}</p>
      <ol class="steps">
        <li>Installe l'appli <b>ntfy</b> : <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Play Store</a> ou <a href="https://f-droid.org/packages/io.heckel.ntfy/" target="_blank" rel="noopener">F-Droid</a>.</li>
        <li>Dans ntfy, appuie sur <b>+</b> et abonne-toi à ce sujet (c'est ton canal secret) :</li>
      </ol>
      <div class="code" id="topic">${esc(s.topic)}</div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="copy-topic">📋 Copier</button><a class="btn ghost" href="ntfy://${esc(host)}/${esc(s.topic)}" style="text-decoration:none">📲 Ouvrir ntfy</a></div>
      <ol class="steps" start="3"><li>Reviens ici et active :</li></ol>
      <div class="toggle"><span>Activer les rappels</span><button class="switch ${s.enabled ? 'on' : ''}" data-act="toggle-notif"></button></div>
      <div class="toggle"><span>Récap du matin</span><button class="switch ${s.recapOn ? 'on' : ''}" data-act="toggle-recap"></button></div>
      <div class="field"><label>Heure du récap</label><input class="input" type="time" id="recap" value="${esc(s.recap)}"></div>
      <button class="btn soft block" data-act="test-notif">🧪 Envoyer une notif de test</button>
      <p class="hint">Les rappels sont programmés jusqu'à 3 jours à l'avance. Ouvre l'appli au moins une fois tous les 3 jours pour qu'ils restent à jour (sinon Mochi t'enverra un petit message pour te le rappeler).<br>Garde ton sujet secret : quiconque le connaît peut lire tes rappels.</p>
      <details class="small"><summary class="muted">Avancé</summary>
        <div class="field" style="margin-top:8px"><label>Serveur ntfy</label><input class="input" id="server" value="${esc(s.server)}"></div>
        <button class="btn ghost block" data-act="new-topic">🎲 Générer un nouveau sujet</button></details>
    </div>

    <div class="card"><h4>💾 Sauvegarde</h4>
      <p class="small muted">Tes données restent sur ce téléphone. Exporte-les de temps en temps.</p>
      <div class="row"><button class="btn ghost" data-act="export">⬇️ Exporter</button><button class="btn ghost" data-act="import">⬆️ Importer</button></div>
      <input type="file" id="importfile" accept="application/json" class="hidden"></div>

    <div class="card"><h4>🧨 Zone sensible</h4><button class="btn danger block" data-act="reset">Tout effacer et recommencer</button></div>
    <p class="small muted" style="text-align:center">Mochi · fait avec 💜 pour les cerveaux qui oublient</p>
  </div>`;
}

// ---------------------------------------------------------------- sheets
function openSheet(html, onMount) {
  const sh = $('#sheet'), ov = $('#overlay');
  sh.innerHTML = `<div class="grabber"></div>${html}`;
  ov.classList.remove('hidden');
  requestAnimationFrame(() => { ov.classList.add('show'); sh.classList.add('show'); });
  onMount && onMount(sh);
}
function closeSheet() {
  const sh = $('#sheet'), ov = $('#overlay');
  sh.classList.remove('show'); ov.classList.remove('show');
  clearInterval(focusTimer);
  setTimeout(() => ov.classList.add('hidden'), 250);
}
let sheetLocked = false;
$('#overlay').onclick = () => { if (!sheetLocked) closeSheet(); };

function chipGroup(name, opts, val, multi) {
  return `<div class="chips" data-group="${name}" ${multi ? 'data-multi="1"' : ''}>${opts.map(([v, l]) => `<button type="button" class="chip ${(multi ? val.includes(v) : val === v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function bindChips(root, cb) {
  $$('.chips', root).forEach(g => g.addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (g.dataset.multi) c.classList.toggle('on');
    else { $$('.chip', g).forEach(x => x.classList.remove('on')); c.classList.add('on'); }
    cb && cb();
  }));
}
const chipVal = (root, name) => { const g = $(`[data-group=${name}]`, root); const on = $$('.chip.on', g).map(c => c.dataset.v); return g.dataset.multi ? on : on[0]; };

function taskSheet(t) {
  const isNew = !t;
  t = t || { emoji: '✨', name: '', rec: { type: 'daily', days: [], every: 2, date: dkey() }, time: '', size: 1 };
  const r = Object.assign({ days: [], every: 2, date: dkey() }, t.rec);
  openSheet(`<h3>${isNew ? 'Nouvelle routine' : 'Modifier'}</h3>
    <div class="field"><label>Icône</label><div class="emoji-pick">${EMOJIS.map(e => `<button type="button" class="${e === t.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
    <div class="field"><label>Quoi ?</label><input class="input" id="tname" maxlength="60" placeholder="ex : Faire la vaisselle" value="${esc(t.name)}"></div>
    <div class="field"><label>Quand ?</label>${chipGroup('type', [['daily', 'Tous les jours'], ['interval', 'Tous les X jours'], ['weekly', 'Certains jours'], ['once', 'Une fois']], r.type)}</div>
    <div class="field" data-show="weekly"><label>Quels jours ?</label>${chipGroup('days', [1, 2, 3, 4, 5, 6, 0].map(d => [String(d), DAYS[d]]), r.days.map(String), true)}</div>
    <div class="field" data-show="interval"><label>Tous les combien de jours ?</label><input class="input" type="number" id="every" min="1" max="60" value="${r.every}">
      <p class="hint">Compté depuis la dernière fois que tu l'as fait. Si tu oublies, elle t'attend gentiment.</p></div>
    <div class="field" data-show="once"><label>Quel jour ?</label><input class="input" type="date" id="odate" value="${r.date}"></div>
    <div class="field"><label>Rappel (optionnel)</label><input class="input" type="time" id="ttime" value="${t.time || ''}"></div>
    <div class="field"><label>Étapes (optionnel)</label><textarea class="input" id="tsteps" maxlength="400" placeholder="Une étape par ligne :&#10;Vider l'évier&#10;Laver&#10;Essuyer" style="min-height:84px">${esc((t.steps || []).join('\n'))}</textarea>
      <p class="hint">Une grosse tâche en petits pas, c'est moins lourd à démarrer.</p></div>
    <div class="toggle"><span>⭐ Essentielle les jours difficiles</span><button type="button" class="switch ${t.essential ? 'on' : ''}" id="tess"></button></div>
    <div class="field"><label>Effort</label>${chipGroup('size', Object.entries(SIZES).map(([k, s]) => [k, `${s.ic} ${s.label} · ${s.xp} XP`]), String(t.size))}</div>
    <div class="sheet-actions">${isNew ? '' : '<button class="btn danger" data-act="del-task">Supprimer</button>'}<button class="btn" data-act="save-task">${isNew ? 'Ajouter' : 'Enregistrer'}</button></div>`,
  sh => {
    const sync = () => { const ty = chipVal(sh, 'type'); $$('[data-show]', sh).forEach(f => f.classList.toggle('hidden', f.dataset.show !== ty)); };
    bindChips(sh, sync); sync();
    $('.emoji-pick', sh).onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('.emoji-pick button', sh).forEach(x => x.classList.remove('on')); b.classList.add('on'); };
    if (isNew) setTimeout(() => $('#tname').focus(), 300);
    $('#tess').onclick = e => e.currentTarget.classList.toggle('on');
    sh.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'del-task') {
        if (!confirm(`Supprimer « ${t.name} » ?`)) return;
        S.tasks = S.tasks.filter(x => x.id !== t.id); save(); scheduleSync(); closeSheet(); render(); toast('Routine supprimée');
      }
      if (a.dataset.act === 'save-task') {
        const name = $('#tname').value.trim(); if (!name) { $('#tname').focus(); return; }
        const type = chipVal(sh, 'type'), rec = { type };
        if (type === 'weekly') { rec.days = chipVal(sh, 'days').map(Number); if (!rec.days.length) return toast('Choisis au moins un jour'); }
        if (type === 'interval') rec.every = Math.max(1, Math.min(60, parseInt($('#every').value) || 1));
        if (type === 'once') rec.date = $('#odate').value || dkey();
        const data = { emoji: $('.emoji-pick .on', sh)?.textContent || '✨', name, rec, time: $('#ttime').value || '', size: Number(chipVal(sh, 'size')) || 1,
          steps: $('#tsteps').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10), essential: $('#tess').classList.contains('on') };
        if (isNew) S.tasks.push({ id: uid(), created: dkey(), last: null, count: 0, ...data });
        else Object.assign(S.tasks.find(x => x.id === t.id), data);
        save(); scheduleSync(); closeSheet(); render();
        toast(isNew ? `${data.emoji} Ajoutée !` : 'Enregistré ✓');
      }
    };
  });
}

function presetsSheet() {
  const have = new Set(S.tasks.map(t => t.name));
  const avail = PRESETS.filter(p => !have.has(p.name));
  if (!avail.length) return toast('Toutes les idées sont déjà ajoutées 😉');
  openSheet(`<h3>Des idées pour démarrer</h3><p class="small muted">Choisis ce qui te parle. Tu pourras tout modifier ensuite.</p>
    <div class="chips" data-group="pre" data-multi="1">${avail.map((p, i) => `<button class="chip" data-v="${i}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>
    <div class="sheet-actions" style="margin-top:16px"><button class="btn" data-act="add-presets">Ajouter</button></div>`,
  sh => {
    bindChips(sh);
    $('[data-act=add-presets]', sh).onclick = () => {
      const sel = chipVal(sh, 'pre').map(i => avail[i]);
      sel.forEach(p => S.tasks.push({ id: uid(), created: dkey(), last: null, count: 0, time: p.time || '', ...JSON.parse(JSON.stringify(p)) }));
      save(); scheduleSync(); closeSheet(); render();
      if (sel.length) toast(`✨ ${sel.length} routine${sel.length > 1 ? 's' : ''} ajoutée${sel.length > 1 ? 's' : ''}`);
    };
  });
}

function noteSheet(n) {
  const isNew = !n;
  n = n || { text: '', remind: '', pinned: false };
  const [rd, rt] = (n.remind || '').split('T');
  const k = dkey();
  openSheet(`<h3>${isNew ? 'Nouvelle note' : 'Modifier la note'}</h3>
    <div class="field"><textarea class="input" id="ntext" maxlength="500" placeholder="Appeler le médecin, racheter du lait…">${esc(n.text)}</textarea></div>
    <div class="field"><label>Me le rappeler</label>${chipGroup('when', [['', 'Non'], ['1h', 'Dans 1 h'], ['tonight', 'Ce soir'], ['tomorrow', 'Demain matin'], ['custom', 'Choisir…']], n.remind ? 'custom' : '')}</div>
    <div class="row" data-custom><input class="input" type="date" id="rdate" value="${rd || k}"><input class="input" type="time" id="rtime" value="${rt || '18:00'}"></div>
    <div class="toggle"><span>📌 Épingler sur l'accueil</span><button class="switch ${n.pinned ? 'on' : ''}" id="npin"></button></div>
    <div class="sheet-actions">${isNew ? '' : '<button class="btn danger" data-act="del-note">Supprimer</button>'}<button class="btn" data-act="save-note">${isNew ? 'Noter' : 'Enregistrer'}</button></div>`,
  sh => {
    const sync = () => $('[data-custom]', sh).classList.toggle('hidden', chipVal(sh, 'when') !== 'custom');
    bindChips(sh, sync); sync();
    $('#npin').onclick = e => e.currentTarget.classList.toggle('on');
    if (isNew) setTimeout(() => $('#ntext').focus(), 300);
    sh.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'del-note') { S.notes = S.notes.filter(x => x.id !== n.id); save(); scheduleSync(); closeSheet(); render(); }
      if (a.dataset.act === 'save-note') {
        const text = $('#ntext').value.trim(); if (!text) return $('#ntext').focus();
        const w = chipVal(sh, 'when'), now = new Date();
        let remind = '';
        const fmt = d => `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (w === '1h') remind = fmt(new Date(now.getTime() + 36e5));
        if (w === 'tonight') { const d = new Date(); d.setHours(19, 0, 0, 0); if (d < now) d.setTime(now.getTime() + 36e5); remind = fmt(d); }
        if (w === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); remind = fmt(d); }
        if (w === 'custom') remind = `${$('#rdate').value || k}T${$('#rtime').value || '09:00'}`;
        const data = { text, remind, pinned: $('#npin').classList.contains('on') };
        if (isNew) S.notes.push({ id: uid(), created: new Date().toISOString(), done: false, ...data });
        else Object.assign(S.notes.find(x => x.id === n.id), data);
        save(); scheduleSync(); closeSheet(); render();
        toast(remind ? `📝 Noté · rappel ${fmtRemind(remind)}` : '📝 Noté !');
        if (remind && !(S.settings.enabled && S.settings.topic)) setTimeout(() => toast('🔔 Active les notifs dans ⚙️ pour recevoir le rappel'), 2600);
      }
    };
  });
}

let focusTimer;
function focusSheet(skip = []) {
  const k = dkey();
  const pending = todayTasks(k).filter(t => !isDoneOn(t, k));
  let pool = pending.filter(t => !skip.includes(t.id));
  if (!pool.length) { pool = pending; skip = []; }
  if (!pool.length) return closeSheet();
  // le plus petit effort d'abord, puis ce qui attend depuis le plus longtemps
  pool.sort((a, b) => a.size - b.size || lateDays(b, k) - lateDays(a, k));
  const t = pool[0];
  openSheet(`<div class="focus"><div class="big">${t.emoji}</div><div class="tname">${esc(t.name)}</div>
      <p class="muted small">Pas besoin de finir. Juste commencer.</p>
      <div class="ring hidden"><svg width="170" height="170"><circle cx="85" cy="85" r="76" stroke="var(--accent-soft)" stroke-width="12" fill="none"/><circle id="ringfg" cx="85" cy="85" r="76" stroke="var(--accent)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="477.5" stroke-dashoffset="0"/></svg><div class="timer" id="timer">5:00</div></div>
      <div class="sheet-actions" style="flex-direction:column">
        <button class="btn" data-act="go5">▶️ Lancer 5 minutes</button>
        <button class="btn soft" data-act="fdone">✅ C'est fait !</button>
        ${pending.length > 1 ? '<button class="btn ghost" data-act="fnext">🔀 Une autre</button>' : ''}
      </div></div>`,
  sh => {
    sh.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'fnext') { clearInterval(focusTimer); focusSheet([...skip, t.id]); }
      if (a.dataset.act === 'fdone') { clearInterval(focusTimer); completeTask(t.id, k, a); confetti(30); closeSheet(); render(); }
      if (a.dataset.act === 'go5') {
        a.remove(); $('.ring', sh).classList.remove('hidden');
        const end = Date.now() + 5 * 60e3;
        const tick = () => {
          const left = Math.max(0, end - Date.now());
          $('#timer').textContent = `${Math.floor(left / 6e4)}:${pad(Math.floor(left / 1e3) % 60)}`;
          $('#ringfg').setAttribute('stroke-dashoffset', 477.5 * (1 - left / 3e5));
          if (!left) { clearInterval(focusTimer); vibrate([200, 100, 200]); $('#timer').textContent = '🎉'; toast('5 minutes ! Tu continues ou tu t\'arrêtes, les deux sont ok 💜'); }
        };
        tick(); focusTimer = setInterval(tick, 500);
      }
    };
  });
}

function onboarding() {
  openSheet(`<div style="text-align:center"><div style="width:150px;height:150px;margin:0 auto">${petSVG({ lvl: 2, mood: 'happy' })}</div>
    <h3>Salut ! 👋</h3><p class="small muted">Je suis ton petit compagnon. Chaque tâche que tu fais me fait grandir. Et je ne t'en voudrai jamais si tu oublies 💜</p></div>
    <div class="field"><label>Comment tu veux m'appeler ?</label><input class="input" id="obname" maxlength="16" value="Mochi"></div>
    <div class="field"><label>Qu'est-ce que tu oublies souvent ? (choisis-en quelques-uns)</label>
      <div class="chips" data-group="pre" data-multi="1">${PRESETS.map((p, i) => `<button class="chip ${[0, 2, 7, 8].includes(i) ? 'on' : ''}" data-v="${i}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn block" data-act="ob-go">C'est parti ✨</button></div>`,
  sh => {
    bindChips(sh);
    $('[data-act=ob-go]', sh).onclick = () => {
      S.pet.name = $('#obname').value.trim() || 'Mochi';
      chipVal(sh, 'pre').forEach(i => { const p = PRESETS[i]; S.tasks.push({ id: uid(), created: dkey(), last: null, count: 0, time: p.time || '', ...JSON.parse(JSON.stringify(p)) }); });
      S.onboarded = true; sheetLocked = false; save(); closeSheet(); render();
      setTimeout(() => say(`Je m'appelle ${S.pet.name} ! Fais une tâche pour me faire éclore 🥚`, 4000), 500);
    };
  });
  sheetLocked = true;
}

// ---------------------------------------------------------------- fx
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function floatText(txt, el) {
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float-xp'; f.textContent = txt; f.style.left = `${r.right - 70}px`; f.style.top = `${r.top}px`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
}
function confetti(n = 40) {
  const cols = ['#a993ec', '#7fcfac', '#f5a383', '#f2cd62', '#ee9abd', '#86bfeb'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'confetti';
    c.style.background = pick(cols); c.style.left = `${50 + (Math.random() - .5) * 20}vw`; c.style.top = '40vh';
    document.body.appendChild(c);
    const dx = (Math.random() - .5) * 500, dy = -200 - Math.random() * 300;
    c.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: .5 }, { transform: `translate(${dx * 1.3}px, ${dy + 600}px) rotate(${Math.random() * 1440}deg)`, opacity: 0 }],
      { duration: 1600 + Math.random() * 800, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
  }
}
function levelUp(from, to) {
  const s1 = stageOf(from), s2 = stageOf(to), evolved = s1.key !== s2.key;
  const el = document.createElement('div'); el.className = 'levelup';
  el.innerHTML = `<div class="box"><div style="width:150px;height:150px;margin:0 auto">${petSVG({ lvl: to, mood: 'joy' })}</div>
    <div class="lv">Niveau ${to}</div>
    <p><b>${evolved ? (s1.key === 'egg' ? `${esc(S.pet.name)} est né ! 🐣` : `${esc(S.pet.name)} a évolué : ${s2.name} !`) : `${esc(S.pet.name)} grandit 🌱`}</b></p>
    <button class="btn block">Trop bien ✨</button></div>`;
  document.body.appendChild(el); confetti(evolved ? 90 : 50); vibrate([30, 60, 30]); sfx('level');
  el.onclick = () => { el.remove(); render(); };
}

// ---------------------------------------------------------------- actions
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a || a.closest('#sheet')) return;
  const id = a.dataset.id, act = a.dataset.act;
  switch (act) {
    case 'toggle': {
      const k = dkey(), t = S.tasks.find(x => x.id === id);
      if (isDoneOn(t, k)) { uncompleteTask(id, k); render(); toast('Décoché'); }
      else { a.classList.add('done', 'pop'); completeTask(id, k, a); setTimeout(render, 450); }
      break;
    }
    case 'pet': awakeUntil = Date.now() + 15e3; petReact('wiggle'); vibrate(10); break;
    case 'focus': focusSheet(); break;
    case 'step': toggleStep(id, Number(a.dataset.i)); break;
    case 'badday': S.badDay = isBadDay() ? null : dkey(); save(); render(); toast(S.badDay ? '🌧️ Mode petit jour. Juste l\'essentiel, c\'est déjà beaucoup 💜' : 'Retour au programme normal'); break;
    case 'theme': S.settings.theme = a.dataset.v; save(); applyTheme(); render(); break;
    case 'toggle-sound': S.settings.sound = S.settings.sound === false; save(); render(); if (S.settings.sound) sfx('done'); break;
    case 'add-task': tab === 'notes' ? noteSheet() : taskSheet(); break;
    case 'edit-task': taskSheet(S.tasks.find(x => x.id === id)); break;
    case 'presets': presetsSheet(); break;
    case 'add-note': noteSheet(); break;
    case 'edit-note': noteSheet(S.notes.find(x => x.id === id)); break;
    case 'note-done': {
      const n = S.notes.find(x => x.id === id); if (!n) break;
      n.done = !n.done; n.doneAt = n.done ? new Date().toISOString() : null;
      if (n.done && !n.rewarded) { n.rewarded = true; reward(NOTE_XP, 1, a); petReact('happy'); }
      save(); scheduleSync(); setTimeout(render, n.done ? 350 : 0);
      if (n.done) a.closest('.item').classList.add('done');
      break;
    }
    case 'nf': noteFilter = a.dataset.v; render(); break;
    case 'clear-done': S.notes = S.notes.filter(n => !n.done); save(); render(); break;
    case 'item': {
      const it = ITEMS[id];
      if (!S.owned.includes(id)) {
        if (S.coins < it.price) return toast(`Il te manque ${it.price - S.coins} 🪙. Fais quelques tâches !`);
        if (!confirm(`Acheter « ${it.name} » pour ${it.price} 🪙 ?`)) return;
        S.coins -= it.price; S.owned.push(id); S.pet.eq[it.slot] = id; confetti(30);
      } else S.pet.eq[it.slot] = S.pet.eq[it.slot] === id ? undefined : id;
      save(); render(); petReact('happy'); break;
    }
    case 'color': {
      const c = COLORS[id];
      if (!S.owned.includes(id)) {
        if (S.coins < c.price) return toast(`Il te manque ${c.price - S.coins} 🪙`);
        if (!confirm(`Débloquer la couleur ${c.name} pour ${c.price} 🪙 ?`)) return;
        S.coins -= c.price; S.owned.push(id);
      }
      S.pet.color = id; save(); render(); petReact('happy'); break;
    }
    case 'settings': setTab('settings'); break;
    case 'back': setTab('today'); break;
    case 'copy-topic': navigator.clipboard?.writeText(S.settings.topic).then(() => toast('Copié ✓'), () => toast('Sélectionne et copie le texte')); break;
    case 'toggle-notif':
      S.settings.enabled = !S.settings.enabled;
      if (!S.settings.enabled) cancelAll(); else scheduleSync(0);
      save(); render(); break;
    case 'toggle-recap': S.settings.recapOn = !S.settings.recapOn; save(); scheduleSync(); render(); break;
    case 'test-notif': testNotif(); break;
    case 'new-topic':
      if (!confirm('Générer un nouveau sujet ? Il faudra te réabonner dans ntfy.')) return;
      cancelAll().then(() => { S.settings.topic = newTopic(); save(); render(); scheduleSync(0); }); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const u = URL.createObjectURL(blob), l = document.createElement('a');
      l.href = u; l.download = `mochi-sauvegarde-${dkey()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); break;
    }
    case 'import': $('#importfile').click(); break;
    case 'reset':
      if (!confirm('Tout effacer ? Ton compagnon, tes routines et tes notes seront supprimés.')) return;
      cancelAll().finally(() => { localStorage.removeItem(KEY); location.reload(); }); break;
  }
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'petname') { S.pet.name = e.target.value.trim() || 'Mochi'; save(); toast('Nom enregistré ✓'); render(); }
  if (id === 'recap') { S.settings.recap = e.target.value || '08:30'; save(); scheduleSync(); }
  if (id === 'server') { S.settings.server = (e.target.value.trim() || 'https://ntfy.sh').replace(/\/$/, ''); save(); }
  if (id === 'importfile') {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { const d = JSON.parse(txt); if (!d || !d.pet || !Array.isArray(d.tasks)) throw 0; S = Object.assign(defaults(), d); S.sched = {}; save(); render(); scheduleSync(0); toast('Sauvegarde importée ✓'); })
      .catch(() => toast('Fichier invalide'));
  }
});

// ---------------------------------------------------------------- ntfy reminders
const appUrl = () => location.origin + location.pathname;
function newTopic() { const r = crypto.getRandomValues(new Uint8Array(9)); return 'mochi-' + [...r].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 16); }
if (!S.settings.topic) { S.settings.topic = newTopic(); save(); }

const WINDOW = 70 * 3600e3; // ntfy.sh accepte jusqu'à 3 jours de délai
function buildDesired() {
  const want = {}, now = Date.now(), k0 = dkey(), url = appUrl();
  const ok = d => d.getTime() > now + 30e3 && d.getTime() < now + WINDOW;
  for (let i = 0; i <= 3; i++) {
    const k = addDays(k0, i);
    for (const t of S.tasks) {
      if (!t.time) continue;
      const when = atTime(k, t.time);
      if (!ok(when)) continue;
      const due = i === 0 ? isDue(t, k) && !isDoneOn(t, k) : projectedDue(t, k);
      if (!due) continue;
      const seq = `t${t.id}${k.replace(/-/g, '')}`;
      const msgs = ['C\'est le moment ! Une petite action et c\'est réglé 💜', `${S.pet.name} croit en toi ✨`, 'Juste commencer, c\'est déjà gagner 🌱'];
      want[seq] = {
        at: when, title: `${t.emoji} ${t.name}`, message: msgs[parseInt(hash(seq), 36) % msgs.length],
        tags: ['alarm_clock'], priority: 4, click: url,
        actions: [{ action: 'view', label: '✅ C\'est fait', url: `${url}?done=${t.id}&day=${k}`, clear: true }],
      };
    }
    if (S.settings.recapOn && S.settings.recap) {
      const when = atTime(k, S.settings.recap);
      if (ok(when)) {
        const list = S.tasks.filter(t => i === 0 ? isDue(t, k) && !isDoneOn(t, k) : projectedDue(t, k));
        want[`r${k.replace(/-/g, '')}`] = {
          at: when, title: `☀️ Ta journée avec ${S.pet.name}`, click: url, tags: ['sunny'], priority: 3,
          message: list.length ? `${list.length} petite${list.length > 1 ? 's' : ''} chose${list.length > 1 ? 's' : ''} aujourd'hui :\n${list.slice(0, 6).map(t => `${t.emoji} ${t.name}`).join('\n')}${list.length > 6 ? '\n…' : ''}` : 'Rien de prévu, profite de ta journée 😌',
        };
      }
    }
  }
  for (const n of S.notes) {
    if (n.done || !n.remind) continue;
    const when = new Date(n.remind);
    if (!ok(when)) continue;
    want[`n${n.id}`] = { at: when, title: '📝 Pense-bête', message: n.text, tags: ['memo'], priority: 4, click: url, actions: [{ action: 'view', label: '✅ C\'est fait', url: `${url}?note=${n.id}`, clear: true }] };
  }
  // "Dead man's switch" : si l'app n'est pas ouverte pendant ~3 jours, un message le rappelle
  want.ping = { at: new Date(now + WINDOW - 3600e3), title: `${S.pet.name} s'ennuie de toi 🥺`, message: 'Ouvre l\'appli 2 secondes pour que tes rappels restent à jour 💜', tags: ['wave'], priority: 3, click: url };
  return want;
}
function projectedDue(t, k) { // pour les jours futurs, en supposant que rien n'est coché d'ici là
  if (t.rec.type === 'once') return !t.doneAt && k === t.rec.date;
  return isDue(t, k);
}
function ntfyFetch(method, path, body) {
  return fetch(`${S.settings.server}${path}`, { method, body: body && JSON.stringify(body), headers: body ? { 'Content-Type': 'application/json' } : {} })
    .then(r => { if (!r.ok) throw new Error(`ntfy ${r.status}`); return r; });
}
let syncing = false, again = false, syncT;
function scheduleSync(delay = 1500) { clearTimeout(syncT); syncT = setTimeout(syncReminders, delay); }
async function syncReminders() {
  const s = S.settings;
  if (!s.enabled || !s.topic || !navigator.onLine) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const want = buildDesired(), now = Date.now();
    for (const seq of Object.keys(S.sched)) {
      if (want[seq]) continue;
      if (S.sched[seq].at > now) await ntfyFetch('DELETE', `/${s.topic}/${seq}`).catch(() => {});
      delete S.sched[seq];
    }
    for (const [seq, m] of Object.entries(want)) {
      const at = Math.floor(m.at.getTime() / 1000);
      const body = { topic: s.topic, sequence_id: seq, delay: String(at), title: m.title, message: m.message, tags: m.tags, priority: m.priority, click: m.click, actions: m.actions };
      // le ping n'est repoussé que s'il approche, pour éviter des requêtes à chaque ouverture
      if (seq === 'ping' && S.sched.ping && S.sched.ping.at > now + 48 * 3600e3) continue;
      const h = hash(JSON.stringify({ ...body, delay: seq === 'ping' ? 0 : at }));
      if (S.sched[seq] && S.sched[seq].h === h) continue;
      await ntfyFetch('POST', '/', body);
      S.sched[seq] = { at: at * 1000, h };
    }
    s.lastSync = new Date().toISOString();
  } catch (e) {
    console.warn('sync ntfy', e);
  } finally {
    syncing = false; save();
    if (again) { again = false; scheduleSync(500); }
  }
}
async function cancelAll() {
  const s = S.settings, now = Date.now();
  await Promise.all(Object.entries(S.sched).filter(([, v]) => v.at > now).map(([seq]) => ntfyFetch('DELETE', `/${s.topic}/${seq}`).catch(() => {})));
  S.sched = {}; save();
}
function testNotif() {
  ntfyFetch('POST', '/', { topic: S.settings.topic, title: `${S.pet.name} dit coucou 👋`, message: 'Si tu vois ça, les rappels marchent ! 🎉', tags: ['tada'], click: appUrl() })
    .then(() => toast('Notif envoyée ! Regarde ton téléphone 📲'), () => toast('⚠️ Échec de l\'envoi (connexion ?)'));
}

// ---------------------------------------------------------------- deep links from notifications (?done=…, ?note=…)
function handleLinks() {
  const p = new URLSearchParams(location.search);
  let msg;
  if (p.get('done')) {
    const t = S.tasks.find(x => x.id === p.get('done')), k = p.get('day') || dkey();
    if (t && k <= dkey()) {
      if (completeTask(t.id, k)) msg = `${t.emoji} « ${t.name} » cochée ! Bravo 💜`;
      else msg = 'Déjà cochée 😉';
    }
  }
  if (p.get('note')) {
    const n = S.notes.find(x => x.id === p.get('note'));
    if (n && !n.done) { n.done = true; n.doneAt = new Date().toISOString(); if (!n.rewarded) { n.rewarded = true; reward(NOTE_XP, 1); } save(); scheduleSync(); msg = '📝 Note cochée !'; }
  }
  if (p.toString()) history.replaceState(null, '', location.pathname);
  if (msg) setTimeout(() => { toast(msg); petReact('happy'); }, 400);
}

// ---------------------------------------------------------------- boot
let lastDay = dkey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (dkey() !== lastDay) { lastDay = dkey(); }
  if (!$('#sheet').classList.contains('show')) render();
  scheduleSync(300);
});
setInterval(() => { if (dkey() !== lastDay) { lastDay = dkey(); render(); scheduleSync(); } }, 60e3);
window.addEventListener('online', () => scheduleSync(300));

applyTheme();
render();
handleLinks();
if (!S.onboarded) onboarding();
else setTimeout(() => say(pick(stageOf(levelInfo().lvl).key === 'egg' ? MSG.egg : MSG[petMood()])), 600);
scheduleSync(800);
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
