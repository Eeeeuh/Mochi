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
const SIZES = { 1: { xp: 10, c: 2, label: 'Petite', ic: '' }, 2: { xp: 20, c: 4, label: 'Moyenne', ic: '' }, 3: { xp: 35, c: 7, label: 'Grosse', ic: '' } };
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
    mood: {}, wins: {}, pets: {}, breath: {}, adv: null, souv: {}, decor: {}, lampOn: null, checkinSkip: null,
    sched: {},
  };
}
let S;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(defaults(), JSON.parse(raw)); } catch (e) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Impossible de sauvegarder'); }
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

function completeTask(id, k = dkey(), fromEl, quiet) {
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
  if (!quiet) petReact('happy');
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
    setTimeout(() => { reward(BONUS_XP, BONUS_C); toast(`Journée complète ! +${BONUS_XP} XP bonus`); confetti(60); }, 700);
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
  const k = dkey(), list = todayTasks(), done = list.filter(t => isDoneOn(t, k)).length;
  if (list.length && done === list.length) return 'joy';
  if (done > 0) return 'happy';
  const m = (S.mood || {})[k];
  if (m && m.m && m.m <= 2) return 'soft';
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
  const shadow = `<ellipse class="pet-shadow" cx="100" cy="186" rx="${st === 'egg' ? 34 : 58}" ry="7" fill="rgba(30,30,50,.16)"/>`;
  if (st === 'egg') {
    return `<svg viewBox="0 0 200 200">${defs}${shadow}<g class="egg-wobble">
      <path d="M100 70 C130 70 146 120 146 145 C146 172 126 184 100 184 C74 184 54 172 54 145 C54 120 70 70 100 70Z" fill="#fffaf3" stroke="#eadfce" stroke-width="2"/>
      <ellipse cx="86" cy="112" rx="9" ry="7" fill="${col.b}" opacity=".75"/><ellipse cx="117" cy="138" rx="12" ry="9" fill="${col.b}" opacity=".75"/>
      <ellipse cx="88" cy="160" rx="7" ry="5" fill="${col.b}" opacity=".75"/><ellipse cx="80" cy="96" rx="6" ry="10" fill="#fff" opacity=".8"/>
    </g></svg>`;
  }
  const scale = { baby: .62, small: .78, big: .92, spirit: 1 }[st];
  const ink = '#2b2536';
  const open = `<g class="pupil"><g class="eye"><ellipse cx="78" cy="124" rx="6.5" ry="8.5" fill="${ink}"/><circle cx="80.5" cy="120.5" r="2.4" fill="#fff"/></g></g>
         <g class="pupil"><g class="eye"><ellipse cx="122" cy="124" rx="6.5" ry="8.5" fill="${ink}"/><circle cx="124.5" cy="120.5" r="2.4" fill="#fff"/></g></g>`;
  const eyes = mood === 'sleep'
    ? `<path d="M70 126 Q78 132 86 126" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M114 126 Q122 132 130 126" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    : mood === 'joy'
      ? `<path d="M70 128 Q78 118 86 128" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M114 128 Q122 118 130 128" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : mood === 'soft'
        ? open + `<path d="M67 111 L89 104" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M111 104 L133 111" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`
        : open;
  const mouth = mood === 'joy' ? `<path d="M90 139 Q100 154 110 139 Z" fill="#7a3b4f"/><path d="M95 146 Q100 150 105 146" fill="#f08aa0"/>`
    : mood === 'happy' ? `<path d="M91 139 Q100 149 109 139" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      : mood === 'sleep' ? `<ellipse cx="100" cy="142" rx="3.5" ry="2.5" fill="${ink}"/>`
        : mood === 'soft' ? `<path d="M94 143 Q100 140 106 143" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
          : `<path d="M94 140 Q100 145 106 140" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  const limbs = st === 'baby' ? '' : `
    <ellipse cx="78" cy="181" rx="13" ry="7" fill="${col.b}"/><ellipse cx="122" cy="181" rx="13" ry="7" fill="${col.b}"/>
    <ellipse cx="29" cy="148" rx="9" ry="13" fill="${col.b}" transform="rotate(25 29 148)"/><ellipse cx="171" cy="148" rx="9" ry="13" fill="${col.b}" transform="rotate(-25 171 148)"/>`;
  const sprout = (st === 'big' || st === 'spirit') && !eq.head ? `
    <path d="M100 62 Q99 50 101 42" stroke="#4f9d78" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M101 46 Q88 32 78 42 Q90 50 101 46Z" fill="#7cc79b"/><path d="M101 44 Q114 28 125 38 Q113 48 101 44Z" fill="#9ad8b2"/>` : '';
  const aura = st === 'spirit' ? `<circle class="aura" cx="100" cy="122" r="98" fill="url(#${gid}au)"/>
    <path d="M32 66l3 8 8 3-8 3-3 8-3-8-8-3 8-3z M164 88l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#f5c02e"/>` : '';
  const zzz = mood === 'sleep' ? `<text class="zzz" x="150" y="72" font-size="22" font-weight="800" fill="#b8c0e0">z</text><text class="zzz" x="164" y="56" font-size="16" font-weight="800" fill="#b8c0e0" style="animation-delay:1.2s">z</text>` : '';
  const blush = mood === 'soft' ? .35 : .55;
  return `<svg viewBox="0 0 200 200">${defs}${aura}${shadow}
    <g class="pet-body"><g transform="translate(100 182) scale(${scale}) translate(-100 -182)">
      ${limbs}
      <path d="M100 60 C152 60 176 110 176 146 C176 173 146 184 100 184 C54 184 24 173 24 146 C24 110 48 60 100 60Z" fill="url(#${gid})"/>
      <ellipse cx="74" cy="88" rx="16" ry="9" fill="#fff" opacity=".45" transform="rotate(-25 74 88)"/>
      ${neckItem(eq.neck)}
      ${sprout}
      ${eyes}
      <ellipse cx="62" cy="140" rx="10" ry="6" fill="#ff8fa6" opacity="${blush}"/><ellipse cx="138" cy="140" rx="10" ry="6" fill="#ff8fa6" opacity="${blush}"/>
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
  calm: ['Coucou.', 'On commence par un petit truc ?', 'Une seule tâche, ça compte déjà.', 'Je suis là, on y va doucement.', 'Pas besoin d\'être parfait·e.', 'Respire. Une chose à la fois.'],
  soft: ['Je suis là. Pas besoin de faire grand-chose.', 'On y va tout doucement.', 'Une seule petite chose, si tu veux.', 'Tu as le droit d\'aller lentement.'],
  happy: ['Trop bien, continue !', 'Je sens que je grandis.', 'Tu gères.', 'Encore une et on fait la fête ?', 'Fier·e de toi.'],
  joy: ['Journée complète !', 'Tu es incroyable.', 'Repos mérité, vraiment.', 'Meilleure équipe.'],
  sleep: ['Zzz…', '…mmh ? Bonne nuit.', 'Dodo, on verra demain.'],
  egg: ['*toc toc*', 'Fais une tâche pour me faire éclore.', 'Ça bouge là-dedans…'],
  poke: ['Hihi, ça chatouille !', 'Hé !', 'Oui ?', 'Tu veux un câlin ? Reste appuyé·e.', 'Je suis là.'],
};
let bubbleTimer;
function say(text, ms = 2600) {
  const b = $('#bubble'); if (!b) return;
  b.textContent = text; b.classList.add('show');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.remove('show'), ms);
}
function petReact(kind) {
  const p = $('#pet'); if (!p || advActive()) return;
  drawPet();
  p.classList.remove('jump', 'wiggle'); void p.offsetWidth;
  p.classList.add(kind === 'happy' ? 'jump' : 'wiggle');
  const st = stageOf(levelInfo().lvl).key;
  if (kind !== 'quiet') say(pick(st === 'egg' ? MSG.egg : kind === 'happy' ? MSG.happy : MSG[petMood()] || MSG.calm));
}
function drawPet(opts) { const p = $('#pet'); if (p) p.innerHTML = advActive() ? '' : petSVG(opts); }

// ---- interactions : les yeux suivent le doigt, appui long = câlin, balayage = valider
let lookT = 0;
function lookAt(x, y) {
  const p = $('#pet'); if (!p) return;
  const r = p.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * .6), d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 170) * 3.8;
  p.style.setProperty('--lx', (dx / d * m).toFixed(2)); p.style.setProperty('--ly', (dy / d * m * .8).toFixed(2)); lookT = Date.now();
}
document.addEventListener('pointermove', e => lookAt(e.clientX, e.clientY), { passive: true });
setInterval(() => { // quand personne ne touche l'écran, il regarde un peu partout
  const p = $('#pet'); if (!p || Date.now() - lookT < 5000) return;
  p.style.setProperty('--lx', (Math.random() * 7 - 3.5).toFixed(2)); p.style.setProperty('--ly', (Math.random() * 3 - 1.2).toFixed(2));
}, 3200);

const HEART = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 21C7.500 17.800 3.500 14.500 3.500 10.200A4.200 4.200 0 0 1 12 8.300a4.200 4.200 0 0 1 8.500 1.900C20.500 14.500 16.500 17.800 12 21z" fill="currentColor"/></svg>';
function spawnHeart() {
  const sc = $('#scene'), p = $('#pet'); if (!sc || !p) return;
  const r = p.getBoundingClientRect(), s = sc.getBoundingClientRect(), h = document.createElement('span');
  h.className = 'heart'; h.innerHTML = HEART;
  h.style.left = `${r.left - s.left + r.width * (.3 + Math.random() * .4)}px`; h.style.top = `${r.top - s.top + r.height * .22}px`;
  h.style.setProperty('--hx', `${Math.random() * 50 - 25}px`); h.style.setProperty('--hr', `${Math.random() * 40 - 20}deg`);
  sc.appendChild(h); setTimeout(() => h.remove(), 1400);
}
let petTimer = null;
function addPetSeconds(s) {
  const k = dkey(); S.pets = S.pets || {};
  const before = S.pets[k] || 0; S.pets[k] = before + s;
  if (before < 3 && S.pets[k] >= 3) { reward(3, 1); toast('Câlin du jour : +3 XP'); }
}
function beginPet() {
  const p = $('#pet'); if (!p || petTimer || advActive()) return;
  p.classList.add('petting'); drawPet({ mood: 'joy' });
  const tick = () => { spawnHeart(); vibrate(7); addPetSeconds(.4); };
  tick(); petTimer = setInterval(tick, 400);
}
function endPet() {
  if (!petTimer) return;
  clearInterval(petTimer); petTimer = null; save();
  const p = $('#pet'); if (p) { p.classList.remove('petting'); drawPet(); }
  render();
}
function hug() {
  if (advActive()) return toast(`${S.pet.name} est parti explorer`);
  if (tab !== 'today' && tab !== 'pet') setTab('today');
  awakeUntil = Date.now() + 15e3; beginPet(); setTimeout(endPet, 2800);
}
let holdT = null, pressedPet = false;
document.addEventListener('pointerdown', e => {
  lookAt(e.clientX, e.clientY);
  if (!e.target.closest('#pet') || advActive()) return;
  pressedPet = true; awakeUntil = Date.now() + 15e3;
  holdT = setTimeout(beginPet, 280);
});
const releasePet = () => {
  if (!pressedPet) return; pressedPet = false; clearTimeout(holdT);
  if (petTimer) endPet(); else { petReact('wiggle'); say(pick(MSG.poke)); vibrate(10); }
};
document.addEventListener('pointerup', releasePet); document.addEventListener('pointercancel', releasePet);
document.addEventListener('contextmenu', e => { if (e.target.closest('#pet')) e.preventDefault(); });

// ---- balayer une tâche vers la droite pour la valider
let sw = null, swipedAt = 0;
document.addEventListener('pointerdown', e => {
  const it = e.target.closest('.trow .item[data-act=toggle]');
  sw = it && !it.classList.contains('done') ? { it, x: e.clientX, y: e.clientY, dx: 0, on: false } : null;
});
document.addEventListener('pointermove', e => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) {
    if (dx > 12 && dx > Math.abs(dy) * 1.5) { sw.on = true; sw.it.classList.add('swiping'); try { sw.it.setPointerCapture(e.pointerId); } catch (_) {} }
    else if (Math.abs(dy) > 10 || dx < -12) { sw = null; return; }
  }
  if (sw.on) { sw.dx = Math.max(0, Math.min(dx, 170)); sw.it.style.transform = `translateX(${sw.dx}px)`; const armed = sw.dx > 95; if (armed !== sw.it.parentNode.classList.contains('armed')) { sw.it.parentNode.classList.toggle('armed', armed); if (armed) vibrate(12); } }
});
const endSwipe = () => {
  if (!sw) return; const { it, dx, on } = sw; sw = null; if (!on) return;
  swipedAt = Date.now(); it.classList.remove('swiping'); it.style.transform = ''; it.parentNode.classList.remove('armed');
  if (dx > 95) toggleTask(it.dataset.id, it);
};
document.addEventListener('pointerup', endSwipe); document.addEventListener('pointercancel', endSwipe);

// ---------------------------------------------------------------- icônes (tracé maison, 24x24)
const ICONS = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  repeat: 'M17 2l3 3-3 3 M4 11V9a4 4 0 0 1 4-4h12 M7 22l-3-3 3-3 M20 13v2a4 4 0 0 1-4 4H4',
  note: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h4',
  pet: 'M12 4c5 0 8 4.5 8 9.5 0 3.5-3 5.5-8 5.5s-8-2-8-5.5C4 8.5 7 4 12 4z M9.200 12.200v.8 M14.800 12.200v.8 M10.500 15.800q1.500 1 3 0',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.500v5 M9 14.500v5',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  x: 'M6 6l12 12 M18 6L6 18',
  wind: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8',
  heart: 'M12 20.500C8 17.500 4 14.500 4 10.500A4 4 0 0 1 12 8.800a4 4 0 0 1 8 1.700c0 4-4 7-8 10z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.500 8.500l-2 5-5 2 2-5z',
  star: 'M12 3.500l2.600 5.300 5.800.8-4.200 4.100 1 5.800L12 16.800l-5.200 2.700 1-5.800L3.600 9.600l5.800-.8z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9 10v.5 M15 10v.5 M8.500 14.500q3.500 3 7 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.500V12l3 2',
  cloud: 'M7 18a4 4 0 0 1-.5-8A5.500 5.500 0 0 1 17 11a3.500 3.500 0 0 1 0 7z M9 21l1-2 M13 21l1-2 M17 21l1-2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.500 2h-15z M10 21h4',
  volume: 'M4 9v6h4l5 4V5L8 9z M16.500 9a4 4 0 0 1 0 6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2.500v2 M12 19.500v2 M2.500 12h2 M19.500 12h2 M5.300 5.300l1.400 1.400 M17.300 17.300l1.400 1.400 M5.300 18.700l1.400-1.400 M17.300 6.700l1.400-1.400',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 9l5-5 5 5 M5 20h14',
  trash: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  pin: 'M12 16.500V22 M8 3h8l-1 7 3 3.500H6L9 10z',
  chev: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15z M5 19l7-7',
};
const ico = (n, s = 22, sw = 1.8) => `<svg class="ico" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const COIN = (s = 18) => `<svg class="coin-ic" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="var(--gold)"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="var(--gold-ink)" stroke-width="1.6" opacity=".75"/></svg>`;
const CHECKSVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
function faceSVG(v) {
  const my = 32 + (v - 3) * 4.5;
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="var(--m${v})"/><circle cx="17" cy="20" r="2.6" fill="#1b2a2c"/><circle cx="31" cy="20" r="2.6" fill="#1b2a2c"/><path d="M15 32 Q24 ${my} 33 32" fill="none" stroke="#1b2a2c" stroke-width="2.8" stroke-linecap="round"/></svg>`;
}

// ---------------------------------------------------------------- souvenirs, déco, aventures
const SOUV = [
  { id: 'pebble', name: 'Galet lisse', shape: 'blob', a: '#b5c9d8', b: '#6f8da6' },
  { id: 'shell', name: 'Coquillage', shape: 'fan', a: '#f8cdb8', b: '#e69a7a' },
  { id: 'feather', name: 'Plume', shape: 'leaf', a: '#d3ead9', b: '#7fb99c' },
  { id: 'acorn', name: 'Gland', shape: 'drop', a: '#e0bd8a', b: '#a87a44' },
  { id: 'crystal', name: 'Cristal', shape: 'gem', a: '#cfd9ff', b: '#7d8fe8' },
  { id: 'star', name: 'Étoile tombée', shape: 'star', a: '#ffe9a6', b: '#f2b705' },
  { id: 'button', name: 'Bouton ancien', shape: 'ring', a: '#e8e0cf', b: '#b3a58a' },
  { id: 'leaf', name: 'Feuille rousse', shape: 'leaf', a: '#f7bf96', b: '#d4683a' },
  { id: 'moon', name: 'Éclat de lune', shape: 'moon', a: '#f2f3ff', b: '#aab4e6' },
  { id: 'berry', name: 'Baie', shape: 'blob', a: '#f5a9bf', b: '#d4506f' },
  { id: 'key', name: 'Petite clé', shape: 'ring', a: '#f4e1a2', b: '#c9a53a' },
  { id: 'cloudp', name: 'Bout de nuage', shape: 'cloud', a: '#ffffff', b: '#c4d0de' },
];
const SHAPES = {
  blob: 'M24 6c11 0 19 8 18 19-1 11-9 18-19 17C12 41 6 32 7 22 8 13 14 6 24 6z',
  fan: 'M24 8C14 8 6 16 6 29h36C42 16 34 8 24 8z M24 12v17 M15 15l5 14 M33 15l-5 14',
  leaf: 'M8 40C8 18 22 6 42 6c0 22-12 36-34 34z M10 38L30 18',
  drop: 'M24 6c8 11 14 18 14 26a14 14 0 0 1-28 0c0-8 6-15 14-26z',
  gem: 'M14 8h20l9 11-19 23L5 19z M5 19h38 M18 8l-4 11 10 23 10-23-4-11',
  star: 'M24 5l5.500 13 13.500 1-10 9 3 14-12-7-12 7 3-14-10-9 13.500-1z',
  ring: 'M24 6a18 18 0 1 0 0 36 18 18 0 0 0 0-36zm0 10a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
  moon: 'M30 6a18 18 0 1 0 12 28A14 14 0 0 1 30 6z',
  cloud: 'M14 37a9 9 0 0 1-1-18 12 12 0 0 1 23 3 7.500 7.500 0 0 1-1 15z',
};
function souvSVG(s, size = 48) {
  const id = 'sv' + uid();
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.a}"/><stop offset="1" stop-color="${s.b}"/></linearGradient></defs><path d="${SHAPES[s.shape]}" fill="url(#${id})" fill-rule="evenodd" stroke="${s.b}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
const STORIES = [
  'a suivi un ruisseau jusqu\'à une clairière pleine de lucioles.',
  's\'est endormi un moment sur une pierre chaude au soleil.',
  'a croisé un hérisson très poli. Ils ont partagé une mûre.',
  'a trouvé une cabane abandonnée et l\'a gentiment rangée.',
  'a regardé les nuages passer pendant une heure. Rien d\'autre.',
  'a sauté dans toutes les flaques du chemin.',
  'a rencontré un vieux chêne qui lui a raconté des histoires.',
  'a compté les étoiles, en a perdu le fil, et c\'était très bien.',
];
const ADV = [
  { id: 's', label: 'Petite balade', h: 1, coins: 6, xp: 5, chance: .3 },
  { id: 'm', label: 'Sortie', h: 3, coins: 16, xp: 12, chance: .65 },
  { id: 'l', label: 'Grande expédition', h: 8, coins: 40, xp: 30, chance: 1 },
];
const DECOR = { rug: { name: 'Tapis', price: 50 }, plant: { name: 'Plante', price: 60 }, lamp: { name: 'Lampe', price: 90 }, lights: { name: 'Guirlande', price: 120 } };
const advActive = () => !!(S.adv && S.adv.end > Date.now());
const advReady = () => !!(S.adv && S.adv.end <= Date.now());
const lampLit = () => S.lampOn ?? isNight();
function fmtLeft(ms) { const m = Math.max(1, Math.ceil(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`; }
function decorSVG(id, attrs = '') {
  switch (id) {
    case 'rug': return `<svg ${attrs} viewBox="0 0 200 36" aria-hidden="true"><ellipse cx="100" cy="20" rx="98" ry="15" fill="#e8634a"/><ellipse cx="100" cy="20" rx="70" ry="10" fill="#f5c02e"/><ellipse cx="100" cy="20" rx="42" ry="6" fill="#e8634a"/></svg>`;
    case 'plant': return `<svg ${attrs} viewBox="0 0 60 80" aria-hidden="true"><path d="M30 54C30 38 20 30 12 14c14 2 20 14 18 40z" fill="#4f9d78"/><path d="M30 54c0-16 8-26 20-34-2 16-8 28-20 34z" fill="#7cc79b"/><path d="M30 54C28 40 30 26 30 8c6 14 4 30 0 46z" fill="#3f8a63"/><path d="M15 54h30l-3 22H18z" fill="#d98b66"/><path d="M15 54h30v5H15z" fill="#c4764f"/></svg>`;
    case 'lamp': return `<svg ${attrs} viewBox="0 0 54 100" style="overflow:visible" aria-hidden="true"><defs><radialGradient id="lampg"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".75"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient></defs><circle class="glow" cx="27" cy="26" r="46" fill="url(#lampg)"/><path d="M12 10h30l6 26H6z" fill="#f2c45a"/><rect x="25" y="36" width="4" height="52" rx="2" fill="#6b5e57"/><ellipse cx="27" cy="90" rx="14" ry="4" fill="#6b5e57"/></svg>`;
    case 'lights': return `<svg ${attrs} viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true"><path d="M-5 8 Q100 60 200 24 T405 14" fill="none" stroke="var(--glass-soft)" stroke-width="1.6"/>${[[36, 31, '#f5c02e'], [92, 42, '#ef7d5b'], [150, 40, '#7fd0b5'], [208, 24, '#7f9bff'], [268, 24, '#f5c02e'], [330, 17, '#ef7d5b'], [385, 14, '#7fd0b5']].map(([x, y, c]) => `<circle cx="${x}" cy="${y + 5}" r="4.500" fill="${c}"/>`).join('')}</svg>`;
  }
  return '';
}
function decorHTML() {
  const d = S.decor || {};
  return `${d.lights ? decorSVG('lights', 'class="d-lights"') : ''}${d.rug ? decorSVG('rug', 'class="d-rug"') : ''}
    ${d.plant ? decorSVG('plant', 'class="d-plant" data-act="plant"') : ''}${d.lamp ? decorSVG('lamp', `class="d-lamp ${lampLit() ? 'lit' : ''}" data-act="lamp"`) : ''}`;
}

// ---------------------------------------------------------------- coque de l'app
const TABS = [['today', 'home', 'Aujourd\'hui'], ['routines', 'repeat', 'Routines'], ['notes', 'note', 'Pense-bête'], ['pet', 'pet', null]];
let tab = 'today', animateNext = false;
function setTab(t) { tab = t; animateNext = true; render(); window.scrollTo(0, 0); }
$('#nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
function renderNav() {
  $('#nav').innerHTML = TABS.map(([id, ic, label]) => {
    const on = tab === id || (tab === 'settings' && id === 'today');
    return `<button data-tab="${id}" class="${on ? 'on' : ''}"><span class="nic">${ico(ic, 22)}</span>${esc(label || S.pet.name.slice(0, 9))}</button>`;
  }).join('');
}
function header(title, sub) {
  return `<header class="topbar"><div><div class="hello">${esc(sub)}</div><h1 class="title" style="margin:0">${esc(title)}</h1></div>
    <div class="pills"><span class="pill" id="coins">${COIN()}<b>${S.coins}</b></span><button class="icon-btn" data-act="settings" aria-label="Réglages">${ico('sliders', 20)}</button></div></header>`;
}
let lastCoins = null, lastXp = null;
function refreshHeader() {
  const cb = $('#coins b');
  if (cb) { if (lastCoins !== null && S.coins !== lastCoins) { const p = $('#coins'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); } cb.textContent = S.coins; lastCoins = S.coins; }
  const li = levelInfo(), bar = $('#xpbar');
  if (bar) {
    bar.style.width = `${Math.round(li.cur / li.need * 100)}%`;
    $('#xplbl').innerHTML = `<b>Niveau ${li.lvl}</b> · ${stageOf(li.lvl).name}`; $('#xpnum').textContent = `${li.cur} / ${li.need} XP`;
    if (lastXp !== null && S.xp !== lastXp) { const b = bar.parentNode; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
  }
  lastXp = S.xp;
}
function applyTheme() {
  const t = S.settings.theme || 'auto', r = document.documentElement;
  if (t === 'auto') delete r.dataset.theme; else r.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0e1517' : '#f1f4ee';
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {}
function render() {
  document.documentElement.dataset.night = isNight() ? '1' : '0';
  renderNav();
  const html = ({ today: viewToday, routines: viewRoutines, notes: viewNotes, pet: viewPet, settings: viewSettings })[tab]();
  $('#app').innerHTML = `<div class="${animateNext ? 'view' : ''}">${html}</div>`; animateNext = false;
  if (tab === 'today' || tab === 'pet') { drawPet(); refreshHeader(); }
}

// ---------------------------------------------------------------- scène
function sceneHTML() {
  const stars = Array.from({ length: 16 }, (_, i) => `<i class="star" style="left:${(i * 37 + 7) % 100}%;top:${(i * 23) % 52}%;animation-delay:${i * .3}s"></i>`).join('');
  const away = advActive() ? `<div class="away"><div><b>${esc(S.pet.name)} est parti explorer</b><span data-away>revient dans ${fmtLeft(S.adv.end - Date.now())}</span></div></div>` : '';
  return `<section class="scene" id="scene">${stars}<div class="sun"></div>
    <div class="cloud" style="top:54px;width:64px;animation-delay:-8s"></div><div class="cloud" style="top:104px;width:44px;animation-delay:-34s;animation-duration:80s"></div>
    <svg class="hills" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true"><path class="h2" d="M0 70 C70 25 150 30 230 62 S350 50 400 28 V150 H0Z"/><path class="h1" d="M0 95 C90 62 190 112 290 84 S370 76 400 82 V150 H0Z"/></svg>
    <div class="decor">${decorHTML()}</div>
    <div id="bubble" class="bubble"></div>
    <div id="pet" role="button" aria-label="Caresser ${esc(S.pet.name)}"></div>${away}</section>`;
}
function xpHTML() { return `<div class="xpbox"><div class="xp-top"><span id="xplbl"></span><span class="xp-num" id="xpnum"></span></div><div class="bar"><i id="xpbar" style="width:${Math.round(levelInfo().cur / levelInfo().need * 100)}%"></i></div></div>`; }

// ---------------------------------------------------------------- vues
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; }
function viewToday() {
  const k = dkey(), list = todayTasks(k), done = list.filter(t => isDoneOn(t, k)).length, d = new Date();
  const notesToday = S.notes.filter(n => !n.done && (n.pinned || (n.remind && n.remind.slice(0, 10) <= k)));
  const m = (S.mood || {})[k], qa = [
    ['checkin', 'smile', 'Humeur', !!(m && m.m), ''],
    ['breath', 'wind', 'Respirer', !!(S.breath || {})[k], ''],
    ['hug', 'heart', 'Câlin', ((S.pets || {})[k] || 0) >= 3, ''],
    ['adv', 'compass', 'Balade', advActive(), advReady() ? 'ping' : ''],
    ['win', 'star', 'Victoire', !!((S.wins || {})[k] || []).length, ''],
  ];
  return `${header(`${greeting()}`, `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`)}
  ${sceneHTML()}
  <div class="qa">${qa.map(([a, ic, l, dn, ping]) => `<button class="qa-btn ${dn ? 'done' : ''}" data-act="${a}"><span class="tile">${ico(ic, 24)}</span>${l}${ping ? '<i class="dot ping"></i>' : dn ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
  ${xpHTML()}
  <div class="section">
    ${isBadDay(k) ? `<div class="badday">${ico('cloud', 26)}<div><b>Journée tranquille</b><p class="small">Seulement l'essentiel aujourd'hui. Le reste peut attendre, vraiment.</p></div><button class="btn ghost" style="padding:9px 13px" data-act="badday">Revenir</button></div>`
      : `<button class="linkbtn" data-act="badday">${ico('cloud', 16)}Journée difficile ? Ne garder que l'essentiel</button>`}
    ${list.length && done < list.length ? `<button class="focus-row" data-act="focus" style="margin-bottom:18px"><span class="ft"><b>Juste une chose</b><span>Je t'en choisis une, tu fais 5 minutes.</span></span><span class="go">${ico('arrow', 18, 2.2)}</span></button>` : ''}
    <div class="section-head"><h2>Aujourd'hui</h2><span class="sub">${done}/${list.length} fait${done > 1 ? 's' : ''}</span></div>
    ${list.length ? `<div class="tasks">${list.map(t => taskItem(t, k)).join('')}</div>`
      : `<div class="empty">${ico('sun', 34, 1.5)}<b>Rien de prévu aujourd'hui</b><p class="small">Ajoute une routine avec le bouton +, ou profite.</p></div>`}
  </div>
  ${notesToday.length ? `<div class="section"><div class="section-head"><h2>À ne pas oublier</h2></div><div class="tasks">${notesToday.map(noteItem).join('')}</div></div>` : ''}
  <button class="fab" data-act="add-task" aria-label="Ajouter une routine">${ico('plus', 26, 2.4)}</button>`;
}
function taskItem(t, k) {
  const done = isDoneOn(t, k), sz = SIZES[t.size] || SIZES[1], late = !done ? lateDays(t, k) : 0, meta = [];
  if (t.time) meta.push(`<span class="m">${ico('clock', 13, 2.2)}${t.time}</span>`);
  if (late > 0) meta.push(`<span class="m late">en attente depuis ${late} j</span>`);
  const st = t.steps || [], sd = stepsDone(t, k);
  if (st.length && !done) meta.push(`<span class="m">${sd.length}/${st.length} étapes</span>`);
  meta.push(`<span class="m xp">+${sz.xp} XP</span>`);
  const sub = st.length && !done ? `<div class="steps-list">${st.map((x, i) => `<button class="step ${sd.includes(i) ? 'on' : ''}" data-act="step" data-id="${t.id}" data-i="${i}"><span class="sbox">${sd.includes(i) ? ico('check', 14, 3.4) : ''}</span>${esc(x)}</button>`).join('')}</div>` : '';
  return `<div class="trow"><div class="swipe-bg">${ico('check', 22, 2.6)}Fait</div>
    <div class="item ${done ? 'done' : ''}" data-act="toggle" data-id="${t.id}"><span class="check">${CHECKSVG}</span><span class="emoji">${t.emoji}</span>
    <div class="txt"><div class="name">${esc(t.name)}</div><div class="meta">${meta.join('')}</div></div></div>${sub}</div>`;
}
function noteItem(n) {
  const meta = [];
  if (n.remind) meta.push(`<span class="m ${n.remind < new Date().toISOString().slice(0, 16) && !n.done ? 'late' : ''}">${ico('clock', 13, 2.2)}${fmtRemind(n.remind)}</span>`);
  if (n.pinned) meta.push(`<span class="m pinned-ic">${ico('pin', 13, 2.2)}épinglé</span>`);
  return `<div class="trow"><div class="item note ${n.done ? 'done' : ''}">
    <span class="check" data-act="note-done" data-id="${n.id}">${CHECKSVG}</span>
    <div class="txt" data-act="edit-note" data-id="${n.id}"><div class="name">${esc(n.text)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div></div></div>`;
}
function fmtRemind(r) {
  const [k, hm] = r.split('T'), today = dkey();
  const day = k === today ? 'aujourd\'hui' : k === addDays(today, 1) ? 'demain' : k === addDays(today, -1) ? 'hier' : fmtDate(k);
  return `${day} ${hm}`;
}
function viewRoutines() {
  const groups = [['daily', 'Chaque jour'], ['interval', 'Tous les X jours'], ['weekly', 'Certains jours'], ['once', 'Une seule fois']], k = dkey();
  const body = S.tasks.length ? groups.map(([type, label]) => {
    const ts = S.tasks.filter(t => t.rec.type === type && !(type === 'once' && t.doneAt));
    if (!ts.length) return '';
    return `<div class="section"><div class="section-head"><h2>${label}</h2></div><div class="tasks">${ts.map(t => `
      <div class="trow"><div class="item edit" data-act="edit-task" data-id="${t.id}"><span class="emoji">${t.emoji}</span>
        <div class="txt"><div class="name">${esc(t.name)}</div><div class="meta"><span class="m">${recLabel(t)}</span>${t.time ? `<span class="m">${ico('clock', 13, 2.2)}${t.time}</span>` : ''}
        ${t.rec.type === 'interval' && t.last ? `<span class="m">fait ${diffDays(t.last, k) === 0 ? 'aujourd\'hui' : `il y a ${diffDays(t.last, k)} j`}</span>` : ''}
        <span class="m xp">${SIZES[t.size].label} · ${SIZES[t.size].xp} XP</span></div></div><span class="edit-btn">${ico('chev', 18)}</span></div></div>`).join('')}</div></div>`;
  }).join('') : `<div class="section"><div class="empty">${ico('repeat', 34, 1.5)}<b>Aucune routine pour l'instant</b><p class="small">Ajoute les trucs que tu oublies tout le temps.</p><button class="btn" data-act="presets">Choisir parmi des idées</button></div></div>`;
  return `${header('Routines', 'Ce qui revient souvent')}${body}
    ${S.tasks.length ? `<div class="section"><button class="btn soft block" data-act="presets">Ajouter depuis les idées</button></div>` : ''}
    <button class="fab" data-act="add-task" aria-label="Ajouter une routine">${ico('plus', 26, 2.4)}</button>`;
}
let noteFilter = 'todo';
function viewNotes() {
  const todo = S.notes.filter(n => !n.done).sort((a, b) => (b.pinned - a.pinned) || ((a.remind || '9') < (b.remind || '9') ? -1 : 1));
  const done = S.notes.filter(n => n.done).sort((a, b) => (b.doneAt || '') < (a.doneAt || '') ? -1 : 1);
  const list = noteFilter === 'todo' ? todo : done;
  return `${header('Pense-bête', 'Vide ta tête ici')}
  <div class="section">
    <div class="notes-filter"><button class="chip ${noteFilter === 'todo' ? 'on' : ''}" data-act="nf" data-v="todo">À faire (${todo.length})</button><button class="chip ${noteFilter === 'done' ? 'on' : ''}" data-act="nf" data-v="done">Faits (${done.length})</button></div>
    ${list.length ? `<div class="tasks">${list.map(noteItem).join('')}</div>`
      : `<div class="empty">${ico('note', 34, 1.5)}<b>${noteFilter === 'todo' ? 'Tête vide, esprit léger' : 'Rien ici pour l\'instant'}</b><p class="small">Note un truc dès qu'il te passe par la tête, et ajoute un rappel si besoin.</p></div>`}
    ${noteFilter === 'done' && done.length ? `<div style="margin-top:12px"><button class="btn ghost block" data-act="clear-done">Effacer les notes faites</button></div>` : ''}
  </div>
  <button class="fab" data-act="add-note" aria-label="Nouvelle note">${ico('plus', 26, 2.4)}</button>`;
}
const priceTag = n => `${COIN(14)}${n}`;
function viewPet() {
  const li = levelInfo(), st = stageOf(li.lvl), next = STAGES.find(s => s.min > li.lvl), sv = S.souv || {};
  const wear = (id, slot) => petSVG({ lvl: 12, mood: 'calm', color: S.pet.color, eq: { [slot]: id } });
  return `${header(S.pet.name, `${st.name} · niveau ${li.lvl}`)}
  ${sceneHTML()}
  ${xpHTML()}<div class="xpbox" style="margin-top:6px"><span class="hint">${next ? `Prochaine évolution : ${next.name} au niveau ${next.min}` : 'Forme finale atteinte'}</span></div>
  <div class="section"><div class="stats">
    <div class="stat"><b>${streak()}</b><span>jours d'affilée</span></div>
    <div class="stat"><b>${totalDone()}</b><span>tâches faites</span></div>
    <div class="stat"><b>${activeDays().length}</b><span>jours actifs</span></div>
  </div></div>
  <div class="section"><div class="section-head"><h2>Ta semaine</h2><span class="sub">tâches et humeur</span></div>${weekChart()}</div>
  <div class="section"><div class="section-head"><h2>Souvenirs</h2><span class="sub">${SOUV.filter(s => sv[s.id]).length}/${SOUV.length} trouvés en balade</span></div>
    <div class="grid">${SOUV.map(s => sv[s.id] ? `<div class="shop-item"><div class="ic">${souvSVG(s, 52)}</div><div class="nm">${s.name}</div><div class="pr">${sv[s.id] > 1 ? `x${sv[s.id]}` : ''}</div></div>` : `<div class="shop-item lock-q"><div class="ic">${souvSVG(s, 52)}</div><div class="nm">???</div><div class="pr"></div></div>`).join('')}</div></div>
  <div class="section"><div class="section-head"><h2>Journal</h2><span class="sub">humeurs et victoires</span></div>${journalHTML()}</div>
  <div class="section"><div class="section-head"><h2>Accessoires</h2><span class="sub">${priceTag(S.coins)}</span></div>
    <div class="grid mini">${Object.entries(ITEMS).map(([id, it]) => {
      const own = S.owned.includes(id), on = S.pet.eq[it.slot] === id;
      return `<button class="shop-item ${on ? 'on' : ''} ${!own && S.coins < it.price ? 'locked' : ''}" data-act="item" data-id="${id}"><div class="ic">${wear(id, it.slot)}</div><div class="nm">${it.name}</div><div class="pr">${on ? 'Porté' : own ? 'Mettre' : priceTag(it.price)}</div></button>`;
    }).join('')}</div></div>
  <div class="section"><div class="section-head"><h2>Couleurs</h2></div>
    <div class="grid mini">${Object.entries(COLORS).map(([id, c]) => {
      const own = S.owned.includes(id), on = S.pet.color === id;
      return `<button class="shop-item ${on ? 'on' : ''} ${!own && S.coins < c.price ? 'locked' : ''}" data-act="color" data-id="${id}"><div class="ic">${petSVG({ lvl: 12, mood: 'calm', color: id, eq: {} })}</div><div class="nm">${c.name}</div><div class="pr">${on ? 'Actuelle' : own ? 'Choisir' : priceTag(c.price)}</div></button>`;
    }).join('')}</div></div>
  <div class="section"><div class="section-head"><h2>Déco</h2><span class="sub">touche-les dans la scène</span></div>
    <div class="grid">${Object.entries(DECOR).map(([id, dc]) => {
      const own = S.owned.includes('d_' + id), on = !!(S.decor || {})[id];
      return `<button class="shop-item ${on ? 'on' : ''} ${!own && S.coins < dc.price ? 'locked' : ''}" data-act="deco" data-id="${id}"><div class="ic">${decorSVG(id, 'style="height:64px;width:auto;max-width:72px"')}</div><div class="nm">${dc.name}</div><div class="pr">${on ? 'Posé' : own ? 'Poser' : priceTag(dc.price)}</div></button>`;
    }).join('')}</div></div>
  <div class="section"><p class="small muted" style="text-align:center">${esc(S.pet.name)} ne tombe jamais malade et ne t'en veut jamais. Si tu disparais quelques jours, il dort simplement en t'attendant.</p></div>`;
}
function journalHTML() {
  const rows = [], k0 = dkey();
  for (let i = 0; i < 14 && rows.length < 7; i++) {
    const k = addDays(k0, -i), m = (S.mood || {})[k], w = (S.wins || {})[k] || [];
    if (!(m && m.m) && !w.length) continue;
    const d = parseKey(k), label = i === 0 ? 'Auj.' : i === 1 ? 'Hier' : `${DAYS[d.getDay()]} ${d.getDate()}`;
    rows.push(`<div class="j-row"><span class="jd">${label}</span><div style="flex:1;display:flex;flex-direction:column;gap:6px">
      ${m && m.m ? `<div style="display:flex;gap:9px;align-items:center"><span style="width:24px;flex:none">${faceSVG(m.m)}</span><p>${m.note ? esc(m.note) : ['Très bas', 'Bas', 'Moyen', 'Bien', 'Super'][m.m - 1]}</p></div>` : ''}
      ${w.map(x => `<div class="jw" style="display:flex;gap:9px;align-items:flex-start"><span style="width:24px;flex:none;display:grid;place-items:center">${ico('star', 18)}</span><p style="color:var(--ink)">${esc(x)}</p></div>`).join('')}</div></div>`);
  }
  return rows.length ? `<div class="journal">${rows.join('')}</div>` : `<div class="empty">${ico('book', 30, 1.5)}<b>Ton journal est vide</b><p class="small">Note ton humeur ou une petite victoire, elles s'afficheront ici.</p></div>`;
}
function weekChart() {
  const k0 = dkey(), days = Array.from({ length: 7 }, (_, i) => addDays(k0, i - 6));
  const vals = days.map(k => (S.log[k] || []).length), max = Math.max(3, ...vals);
  return `<div class="week">${days.map((k, i) => { const m = ((S.mood || {})[k] || {}).m;
    return `<div class="wcol"><div class="wnum">${vals[i] || ''}</div><div class="wbar"><i style="height:${Math.round(vals[i] / max * 100)}%" class="${k === k0 ? 'today' : ''}"></i></div><div class="wmood" style="${m ? `background:var(--m${m})` : ''}"></div><div class="wday">${DAYS[parseKey(k).getDay()].slice(0, 2)}</div></div>`; }).join('')}</div>`;
}
function viewSettings() {
  const s = S.settings, ok = s.enabled && s.topic;
  const host = s.server.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `<header class="topbar"><div><div class="hello">Réglages</div><h1 class="title" style="margin:0">Paramètres</h1></div><button class="icon-btn" data-act="back" aria-label="Fermer">${ico('x', 20)}</button></header>
  <div class="section" style="margin-top:6px">
    <div class="card"><h4>${ico('pet', 20)}Ton compagnon</h4>
      <div class="field" style="margin:0"><label for="petname">Son nom</label><input class="input" id="petname" maxlength="16" value="${esc(S.pet.name)}"></div></div>

    <div class="card"><h4>${ico('sun', 20)}Apparence</h4>
      <div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button class="chip ${(s.theme || 'auto') === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="hint">Auto suit le réglage de ton téléphone.</p></div>

    <div class="card"><h4>${ico('volume', 20)}Sons</h4>
      <div class="toggle"><span>Petits sons doux</span><button class="switch ${s.sound !== false ? 'on' : ''}" data-act="toggle-sound" aria-label="Sons"></button></div></div>

    <div class="card"><h4>${ico('bell', 20)}Notifications <span class="small muted" style="font-family:Figtree">via ntfy</span></h4>
      <p class="small"><span class="status-dot ${ok ? 'ok' : 'warn'}"></span>${ok ? `Activées · ${Object.keys(S.sched).length} rappel(s) programmé(s)` : 'Pas encore activées'}</p>
      <ol class="steps">
        <li>Installe l'appli <b>ntfy</b> : <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Play Store</a> ou <a href="https://f-droid.org/packages/io.heckel.ntfy/" target="_blank" rel="noopener">F-Droid</a>.</li>
        <li>Dans ntfy, appuie sur <b>+</b> et abonne-toi à ce sujet (c'est ton canal secret) :</li>
      </ol>
      <div class="code" id="topic">${esc(s.topic)}</div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="copy-topic">Copier</button><a class="btn ghost" href="ntfy://${esc(host)}/${esc(s.topic)}">Ouvrir ntfy</a></div>
      <ol class="steps" start="3"><li>Reviens ici et active :</li></ol>
      <div class="toggle"><span>Activer les rappels</span><button class="switch ${s.enabled ? 'on' : ''}" data-act="toggle-notif" aria-label="Rappels"></button></div>
      <div class="toggle"><span>Récap du matin</span><button class="switch ${s.recapOn ? 'on' : ''}" data-act="toggle-recap" aria-label="Récap"></button></div>
      <div class="field"><label for="recap">Heure du récap</label><input class="input" type="time" id="recap" value="${esc(s.recap)}"></div>
      <button class="btn soft block" data-act="test-notif">Envoyer une notif de test</button>
      <p class="hint">Les rappels sont programmés jusqu'à 3 jours à l'avance, y compris le retour de ${esc(S.pet.name)} quand il part en balade. Ouvre l'appli au moins une fois tous les 3 jours pour qu'ils restent à jour.<br>Garde ton sujet secret : quiconque le connaît peut lire tes rappels.</p>
      <details class="small"><summary class="muted">Avancé</summary>
        <div class="field" style="margin-top:8px"><label for="server">Serveur ntfy</label><input class="input" id="server" value="${esc(s.server)}"></div>
        <button class="btn ghost block" data-act="new-topic">Générer un nouveau sujet</button></details>
    </div>

    <div class="card"><h4>${ico('download', 20)}Sauvegarde</h4>
      <p class="small muted">Tes données restent sur ce téléphone. Exporte-les de temps en temps.</p>
      <div class="row"><button class="btn ghost" data-act="export">Exporter</button><button class="btn ghost" data-act="import">Importer</button></div>
      <input type="file" id="importfile" accept="application/json" class="hidden"></div>

    <div class="card"><h4>${ico('trash', 20)}Zone sensible</h4><button class="btn danger block" data-act="reset">Tout effacer et recommencer</button></div>
    <p class="small muted" style="text-align:center">Mochi · pour les cerveaux qui oublient</p>
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
  clearInterval(focusTimer); stopBreath();
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
    <div class="field"><label>Effort</label>${chipGroup('size', Object.entries(SIZES).map(([k, s]) => [k, `${s.label} · ${s.xp} XP`]), String(t.size))}</div>
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
  if (!avail.length) return toast('Toutes les idées sont déjà ajoutées ');
  openSheet(`<h3>Des idées pour démarrer</h3><p class="small muted">Choisis ce qui te parle. Tu pourras tout modifier ensuite.</p>
    <div class="chips" data-group="pre" data-multi="1">${avail.map((p, i) => `<button class="chip" data-v="${i}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>
    <div class="sheet-actions" style="margin-top:16px"><button class="btn" data-act="add-presets">Ajouter</button></div>`,
  sh => {
    bindChips(sh);
    $('[data-act=add-presets]', sh).onclick = () => {
      const sel = chipVal(sh, 'pre').map(i => avail[i]);
      sel.forEach(p => S.tasks.push({ id: uid(), created: dkey(), last: null, count: 0, time: p.time || '', ...JSON.parse(JSON.stringify(p)) }));
      save(); scheduleSync(); closeSheet(); render();
      if (sel.length) toast(`${sel.length} routine${sel.length > 1 ? 's' : ''} ajoutée${sel.length > 1 ? 's' : ''}`);
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
        toast(remind ? `Noté · rappel ${fmtRemind(remind)}` : 'Noté !');
        if (remind && !(S.settings.enabled && S.settings.topic)) setTimeout(() => toast('Active les notifs dans ⚙️ pour recevoir le rappel'), 2600);
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
        <button class="btn" data-act="go5">Lancer 5 minutes</button>
        <button class="btn soft" data-act="fdone">C'est fait</button>
        ${pending.length > 1 ? '<button class="btn ghost" data-act="fnext">Une autre</button>' : ''}
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
          if (!left) { clearInterval(focusTimer); vibrate([200, 100, 200]); $('#timer').textContent = '0:00'; toast('5 minutes ! Tu continues ou tu t\'arrêtes, les deux sont ok '); }
        };
        tick(); focusTimer = setInterval(tick, 500);
      }
    };
  });
}

function onboarding() {
  openSheet(`<div style="text-align:center"><div style="width:150px;height:150px;margin:0 auto">${petSVG({ lvl: 2, mood: 'happy' })}</div>
    <h3>Salut !</h3><p class="small muted">Je suis ton petit compagnon. Chaque tâche que tu fais me fait grandir. Et je ne t'en voudrai jamais si tu oublies.</p></div>
    <div class="field"><label>Comment tu veux m'appeler ?</label><input class="input" id="obname" maxlength="16" value="Mochi"></div>
    <div class="field"><label>Qu'est-ce que tu oublies souvent ? (choisis-en quelques-uns)</label>
      <div class="chips" data-group="pre" data-multi="1">${PRESETS.map((p, i) => `<button class="chip ${[0, 2, 7, 8].includes(i) ? 'on' : ''}" data-v="${i}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn block" data-act="ob-go">C'est parti</button></div>`,
  sh => {
    bindChips(sh);
    $('[data-act=ob-go]', sh).onclick = () => {
      S.pet.name = $('#obname').value.trim() || 'Mochi';
      chipVal(sh, 'pre').forEach(i => { const p = PRESETS[i]; S.tasks.push({ id: uid(), created: dkey(), last: null, count: 0, time: p.time || '', ...JSON.parse(JSON.stringify(p)) }); });
      S.onboarded = true; S.checkinSkip = dkey(); sheetLocked = false; save(); closeSheet(); render();
      setTimeout(() => say(`Je m'appelle ${S.pet.name} ! Fais une tâche pour me faire éclore`, 4000), 500);
    };
  });
  sheetLocked = true;
}

// ---------------------------------------------------------------- humeur du jour
function checkinSheet() {
  const k = dkey(), cur = (S.mood || {})[k] || {}, labels = ['Très bas', 'Bas', 'Moyen', 'Bien', 'Super'], enl = ['À plat', 'Moyenne', 'En forme'];
  let mv = cur.m || 0, ev = cur.e || 0, quiet = isBadDay(k);
  const petMoodFor = v => v <= 2 ? 'soft' : v === 3 ? 'calm' : v === 4 ? 'happy' : 'joy';
  const lvl = levelInfo().lvl;
  openSheet(`<div class="mood-pet" id="mpet">${petSVG({ lvl, mood: mv ? petMoodFor(mv) : 'calm' })}</div>
    <h3 style="text-align:center;margin-bottom:4px">Comment tu te sens ?</h3>
    <p class="small muted" style="text-align:center;margin:0 0 14px">Dix secondes, aucune mauvaise réponse.</p>
    <div class="moods">${[1, 2, 3, 4, 5].map(v => `<button class="mood-btn ${mv === v ? 'on' : ''}" data-v="${v}" aria-label="${labels[v - 1]}">${faceSVG(v)}${labels[v - 1]}</button>`).join('')}</div>
    <div class="field"><label>Ton énergie</label><div class="energy">${[1, 2, 3].map(v => `<button class="en-btn ${ev === v ? 'on' : ''}" data-e="${v}"><span class="bat">${[1, 2, 3].map(i => `<i class="${i <= v ? 'f' : ''}"></i>`).join('')}</span>${enl[v - 1]}</button>`).join('')}</div></div>
    <div class="field"><input class="input" id="cnote" maxlength="120" placeholder="Un mot sur ta journée ? (facultatif)" value="${esc(cur.note || '')}"></div>
    <div class="toggle"><span>Journée tranquille : garder l'essentiel</span><button class="switch ${quiet ? 'on' : ''}" id="quiet" aria-label="Journée tranquille"></button></div>
    <div class="sheet-actions"><button class="btn ghost" data-act="c-later">Plus tard</button><button class="btn" data-act="c-save">Enregistrer</button></div>`,
  sh => {
    sh.onclick = e => {
      const mb = e.target.closest('.mood-btn'), eb = e.target.closest('.en-btn'), a = e.target.closest('[data-act]');
      if (mb) { mv = Number(mb.dataset.v); $$('.mood-btn', sh).forEach(b => b.classList.toggle('on', b === mb)); $('#mpet').innerHTML = petSVG({ lvl, mood: petMoodFor(mv) }); sfx('step'); vibrate(8); }
      if (eb) {
        ev = Number(eb.dataset.e); $$('.en-btn', sh).forEach(b => b.classList.toggle('on', b === eb)); sfx('step'); vibrate(8);
        quiet = ev === 1; $('#quiet').classList.toggle('on', quiet);
      }
      if (e.target.closest('#quiet')) { quiet = !quiet; $('#quiet').classList.toggle('on', quiet); }
      if (!a) return;
      if (a.dataset.act === 'c-later') { S.checkinSkip = k; save(); closeSheet(); }
      if (a.dataset.act === 'c-save') {
        if (!mv) return toast('Choisis une humeur');
        const first = !(S.mood || {})[k]; S.mood = S.mood || {};
        S.mood[k] = { m: mv, e: ev, note: $('#cnote').value.trim() };
        S.badDay = quiet ? k : (S.badDay === k ? null : S.badDay);
        save(); closeSheet(); render();
        if (first) { reward(3, 1); toast('Humeur notée : +3 XP'); }
        setTimeout(() => say(mv <= 2 ? 'Merci de me le dire. On y va tout doucement.' : mv === 3 ? 'D\'accord. Un pas à la fois.' : 'Chouette ! On en profite.', 3600), 400);
      }
    };
  });
}
function maybeCheckin() {
  const k = dkey();
  if (!S.onboarded || sheetLocked || ((S.mood || {})[k] || {}).m || S.checkinSkip === k || advReady()) return;
  if ($('#sheet').classList.contains('show') || document.querySelector('.levelup')) return;
  setTimeout(() => { if (!$('#sheet').classList.contains('show') && !advReady()) checkinSheet(); }, 900);
}

// ---------------------------------------------------------------- respiration guidée
let breathRun = null;
function stopBreath() { if (breathRun) { cancelAnimationFrame(breathRun.raf); breathRun = null; } }
function breathSheet() {
  openSheet(`<div class="breath"><h3>Respirer</h3><p class="small muted" style="margin:-8px 0 0">Suis le cercle. Cinq respirations lentes.</p>
    <div class="b-stage"><div class="b-ring" id="bring"></div><div class="b-pet" id="bpet">${petSVG({ lvl: levelInfo().lvl, mood: 'calm' })}</div></div>
    <div class="b-label" id="blabel">Prêt ?</div><div class="b-sub" id="bsub">Installe-toi, épaules basses.</div>
    <div class="b-dots">${[0, 1, 2, 3, 4].map(() => '<i></i>').join('')}</div>
    <div class="sheet-actions" id="bact"><button class="btn block" data-act="b-start">Commencer</button></div></div>`,
  sh => {
    sh.onclick = e => { const a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'b-start') runBreath(sh); if (a.dataset.act === 'b-close') closeSheet(); };
  });
}
function runBreath(sh) {
  $('#bact').innerHTML = '';
  const ring = $('#bring'), bp = $('#bpet'), lab = $('#blabel'), sub = $('#bsub'), dots = $$('.b-dots i', sh);
  const phases = [['Inspire', 4000, .62, 1, 'doucement par le nez'], ['Retiens', 2000, 1, 1, 'sans forcer'], ['Expire', 6000, 1, .62, 'longuement par la bouche']];
  const cycle = 12000, total = cycle * 5, t0 = performance.now(), speed = window.__breathSpeed || 1; let last = -1;
  const st = { raf: 0 }; breathRun = st;
  const frame = now => {
    const t = (now - t0) * speed;
    if (t >= total) return finishBreath();
    const c = Math.floor(t / cycle), tc = t % cycle; let acc = 0, pi = 0;
    while (pi < 2 && tc >= acc + phases[pi][1]) { acc += phases[pi][1]; pi++; }
    const [l, d, a, b, s] = phases[pi], u = (tc - acc) / d, e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, sc = a + (b - a) * e;
    ring.style.transform = `scale(${sc.toFixed(3)})`; ring.style.opacity = (.35 + sc * .45).toFixed(2);
    bp.style.transform = `scale(${(.9 + (sc - .62) * .55).toFixed(3)})`;
    if (c * 3 + pi !== last) { last = c * 3 + pi; lab.textContent = l; sub.textContent = s; vibrate(pi === 1 ? 8 : 24); dots.forEach((x, i) => x.classList.toggle('on', i <= c)); }
    st.raf = requestAnimationFrame(frame);
  };
  st.raf = requestAnimationFrame(frame);
}
function finishBreath() {
  stopBreath(); const k = dkey(); S.breath = S.breath || {}; const first = !S.breath[k]; S.breath[k] = (S.breath[k] || 0) + 1;
  const lab = $('#blabel'); if (!lab) return;
  lab.textContent = 'Bien joué'; $('#bsub').textContent = first ? '+6 XP' : 'Autant de fois que tu veux';
  $$('.b-dots i').forEach(d => d.classList.add('on')); $('#bring').style.transform = 'scale(.8)'; $('#bpet').style.transform = 'scale(1)';
  $('#bact').innerHTML = '<button class="btn block" data-act="b-close">Terminer</button>';
  sfx('done'); save(); if (first) reward(6, 1); render();
}

// ---------------------------------------------------------------- petite victoire
function winSheet() {
  const k = dkey(), list = (S.wins || {})[k] || [];
  openSheet(`<h3>Une petite victoire</h3><p class="small muted" style="margin:-8px 0 12px">Un truc dont tu es content·e aujourd'hui, même minuscule.</p>
    ${list.length ? `<div class="journal" style="margin-bottom:12px">${list.map(w => `<div class="j-row"><span class="jw">${ico('star', 18)}</span><p>${esc(w)}</p></div>`).join('')}</div>` : ''}
    <div class="field"><input class="input" id="wtext" maxlength="140" placeholder="J'ai enfin répondu à ce message…"></div>
    <div class="sheet-actions"><button class="btn block" data-act="w-save">Ajouter</button></div>`,
  sh => {
    setTimeout(() => $('#wtext').focus(), 350);
    const save1 = () => {
      const v = $('#wtext').value.trim(); if (!v) return $('#wtext').focus();
      S.wins = S.wins || {}; const first = !(S.wins[k] || []).length; (S.wins[k] = S.wins[k] || []).push(v);
      save(); closeSheet(); render(); confetti(24); sfx('done');
      if (first) { reward(4, 1); toast('Victoire notée : +4 XP'); } else toast('Victoire notée');
      setTimeout(() => petReact('happy'), 300);
    };
    sh.onclick = e => { if (e.target.closest('[data-act=w-save]')) save1(); };
    $('#wtext').addEventListener('keydown', e => { if (e.key === 'Enter') save1(); });
  });
}

// ---------------------------------------------------------------- balades
let advBusy = false;
function advSheet() {
  if (advReady()) return advCollect();
  if (advActive()) {
    return openSheet(`<h3>${esc(S.pet.name)} est en balade</h3><p class="muted">Il revient dans <b data-away>${fmtLeft(S.adv.end - Date.now())}</b>.</p>
      <div class="sheet-actions"><button class="btn danger" data-act="a-recall">Le rappeler</button><button class="btn" data-act="a-ok">D'accord</button></div>`,
    sh => { sh.onclick = e => { const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'a-ok') closeSheet();
      if (a.dataset.act === 'a-recall') { S.adv = null; save(); scheduleSync(0); closeSheet(); render(); toast(`${S.pet.name} est rentré, sans rien rapporter`); } }; });
  }
  openSheet(`<h3>Une balade ?</h3><p class="small muted" style="margin:-8px 0 14px">${esc(S.pet.name)} part explorer et revient avec des pièces, parfois un souvenir. Pendant ce temps, tu peux continuer tes tâches.</p>
    <div class="advopts">${ADV.map(a => `<button class="adv-opt" data-adv="${a.id}">${ico('compass', 24)}<div><b>${a.label}</b><span class="s">${a.h} h</span></div><div class="gain"><span class="coinr">${COIN(14)}${a.coins}</span><span>${a.xp} XP</span></div></button>`).join('')}</div>
    <p class="hint">Si les rappels sont activés, une notification te prévient à son retour.</p>`,
  sh => { sh.onclick = e => { const b = e.target.closest('[data-adv]'); if (b) startAdv(b.dataset.adv); }; });
}
function startAdv(id) {
  const a = ADV.find(x => x.id === id); if (!a) return;
  S.adv = { id, end: Date.now() + a.h * 3600e3 }; save(); scheduleSync(0); sfx('step'); closeSheet(); render();
  const e = new Date(S.adv.end); toast(`${S.pet.name} part explorer, retour vers ${pad(e.getHours())}:${pad(e.getMinutes())}`);
}
function advCollect() {
  const a = ADV.find(x => x.id === S.adv.id) || ADV[0]; let got = null;
  if (Math.random() < a.chance) {
    const missing = SOUV.filter(s => !(S.souv || {})[s.id]); got = pick(missing.length ? missing : SOUV);
    S.souv = S.souv || {}; S.souv[got.id] = (S.souv[got.id] || 0) + 1;
  }
  const story = pick(STORIES); S.adv = null; save(); scheduleSync(0);
  openSheet(`<div style="text-align:center"><h3>${esc(S.pet.name)} est de retour</h3><p class="muted" style="margin:-8px 0 6px">Il ${story}</p>
    ${got ? `<div class="souv-hero">${souvSVG(got, 96)}</div><b class="disp" style="font-size:19px">${got.name}</b><div class="small muted">ajouté à tes souvenirs</div>` : '<div class="small muted" style="margin:14px 0">Pas de souvenir cette fois, mais une belle balade.</div>'}
    <div class="gain" style="display:flex;flex-direction:row;justify-content:center;gap:14px;margin:14px 0;align-items:center"><span class="coinr">${COIN(16)}+${a.coins}</span><span>+${a.xp} XP</span></div>
    <div class="sheet-actions"><button class="btn block" data-act="a-ok">Merci</button></div></div>`,
  sh => { sh.onclick = e => { if (e.target.closest('[data-act=a-ok]')) { closeSheet(); setTimeout(() => petReact('happy'), 350); } }; });
  sfx('level'); confetti(40); reward(a.xp, a.coins); render();
}
function checkAdv() {
  if (!S.onboarded || !advReady() || advBusy) return;
  if ($('#sheet').classList.contains('show') || document.querySelector('.levelup')) return;
  advBusy = true; advCollect(); setTimeout(() => { advBusy = false; }, 1500);
}
function updateAway() { $$('[data-away]').forEach(el => { if (advActive()) el.textContent = el.tagName === 'B' ? fmtLeft(S.adv.end - Date.now()) : `revient dans ${fmtLeft(S.adv.end - Date.now())}`; }); }

// ---------------------------------------------------------------- fx
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function floatText(txt, el) {
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float-xp'; f.textContent = txt; f.style.left = `${Math.min(r.right - 90, innerWidth - 100)}px`; f.style.top = `${r.top + r.height / 2 - 14}px`;
  document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
}
function confetti(n = 40) {
  const cols = ['#3a50d9', '#1f9d84', '#f08a62', '#f2b705', '#e8634a', '#7fb0ff'];
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
    <p><b>${evolved ? (s1.key === 'egg' ? `${esc(S.pet.name)} est né !` : `${esc(S.pet.name)} a évolué : ${s2.name}`) : `${esc(S.pet.name)} grandit`}</b></p>
    <button class="btn block">Trop bien</button></div>`;
  document.body.appendChild(el); confetti(evolved ? 90 : 50); vibrate([30, 60, 30]); sfx('level');
  el.onclick = () => { el.remove(); render(); };
}
// l'emoji de la tâche s'envole vers le compagnon
function flyToPet(el, emoji) {
  const p = $('#pet'); if (!p || !el || advActive() || !emoji) return;
  const a = el.getBoundingClientRect(), b = p.getBoundingClientRect(), f = document.createElement('span');
  f.className = 'fly'; f.textContent = emoji; f.style.left = '0'; f.style.top = '0'; document.body.appendChild(f);
  const x0 = a.left + 28, y0 = a.top + a.height / 2 - 13, x1 = b.left + b.width / 2 - 13, y1 = b.top + b.height * .45;
  f.animate([
    { transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 },
    { transform: `translate(${(x0 + x1) / 2 + 30}px,${Math.max(8, Math.min(y0, y1) - 70)}px) scale(1.35)`, opacity: 1, offset: .45 },
    { transform: `translate(${x1}px,${y1}px) scale(.3)`, opacity: .25 }],
  { duration: 700, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => { f.remove(); petReact('happy'); spawnHeart(); };
}
function toggleTask(id, el) {
  const k = dkey(), t = S.tasks.find(x => x.id === id); if (!t) return;
  if (isDoneOn(t, k)) { uncompleteTask(id, k); render(); toast('Décoché'); return; }
  el.classList.add('done'); flyToPet(el, t.emoji); completeTask(id, k, el, true);
  setTimeout(render, 820);
}

// ---------------------------------------------------------------- actions
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a || a.closest('#sheet')) return;
  const id = a.dataset.id, act = a.dataset.act;
  switch (act) {
    case 'toggle': if (Date.now() - swipedAt > 450) toggleTask(id, a); break;
    case 'checkin': checkinSheet(); break;
    case 'breath': breathSheet(); break;
    case 'hug': hug(); break;
    case 'adv': advSheet(); break;
    case 'win': winSheet(); break;
    case 'plant': { a.classList.remove('sway'); void a.getBoundingClientRect(); a.classList.add('sway'); vibrate(8); sfx('step'); break; }
    case 'lamp': S.lampOn = !lampLit(); save(); a.classList.toggle('lit', S.lampOn); sfx('undo'); vibrate(8); break;
    case 'focus': focusSheet(); break;
    case 'step': toggleStep(id, Number(a.dataset.i)); break;
    case 'badday': S.badDay = isBadDay() ? null : dkey(); save(); render(); toast(S.badDay ? 'Journée tranquille : juste l\'essentiel, c\'est déjà beaucoup' : 'Retour au programme normal'); break;
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
      save(); scheduleSync(); if (n.done) a.closest('.item').classList.add('done'); sfx(n.done ? 'step' : 'undo');
      setTimeout(render, n.done ? 450 : 0);
      break;
    }
    case 'nf': noteFilter = a.dataset.v; render(); break;
    case 'clear-done': S.notes = S.notes.filter(n => !n.done); save(); render(); break;
    case 'item': {
      const it = ITEMS[id];
      if (!S.owned.includes(id)) {
        if (S.coins < it.price) return toast(`Il te manque ${it.price - S.coins} pièces. Quelques tâches et c'est bon.`);
        if (!confirm(`Acheter « ${it.name} » pour ${it.price} pièces ?`)) return;
        S.coins -= it.price; S.owned.push(id); S.pet.eq[it.slot] = id; confetti(30);
      } else S.pet.eq[it.slot] = S.pet.eq[it.slot] === id ? undefined : id;
      save(); render(); petReact('happy'); break;
    }
    case 'color': {
      const c = COLORS[id];
      if (!S.owned.includes(id)) {
        if (S.coins < c.price) return toast(`Il te manque ${c.price - S.coins} pièces`);
        if (!confirm(`Débloquer la couleur ${c.name} pour ${c.price} pièces ?`)) return;
        S.coins -= c.price; S.owned.push(id);
      }
      S.pet.color = id; save(); render(); petReact('happy'); break;
    }
    case 'deco': {
      const dc = DECOR[id], key = 'd_' + id; S.decor = S.decor || {};
      if (!S.owned.includes(key)) {
        if (S.coins < dc.price) return toast(`Il te manque ${dc.price - S.coins} pièces`);
        if (!confirm(`Acheter « ${dc.name} » pour ${dc.price} pièces ?`)) return;
        S.coins -= dc.price; S.owned.push(key); S.decor[id] = true; confetti(24);
      } else S.decor[id] = !S.decor[id];
      save(); render(); sfx('step'); break;
    }
    case 'settings': setTab('settings'); break;
    case 'back': setTab('today'); break;
    case 'copy-topic': navigator.clipboard?.writeText(S.settings.topic).then(() => toast('Copié'), () => toast('Sélectionne et copie le texte')); break;
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
  if (id === 'petname') { S.pet.name = e.target.value.trim() || 'Mochi'; save(); toast('Nom enregistré'); render(); }
  if (id === 'recap') { S.settings.recap = e.target.value || '08:30'; save(); scheduleSync(); }
  if (id === 'server') { S.settings.server = (e.target.value.trim() || 'https://ntfy.sh').replace(/\/$/, ''); save(); }
  if (id === 'importfile') {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { const d = JSON.parse(txt); if (!d || !d.pet || !Array.isArray(d.tasks)) throw 0; S = Object.assign(defaults(), d); S.sched = {}; save(); render(); scheduleSync(0); toast('Sauvegarde importée'); })
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
  if (S.adv && S.adv.end > now) {
    const when = new Date(S.adv.end);
    if (ok(when)) want.adv = { at: when, title: `${S.pet.name} est de retour`, message: 'Il a ramené quelque chose. Viens voir !', tags: ['tent'], priority: 3, click: url };
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
    .then(() => toast('Notif envoyée ! Regarde ton téléphone '), () => toast('Échec de l\'envoi (connexion ?)'));
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
  if (dkey() !== lastDay) lastDay = dkey();
  if (!$('#sheet').classList.contains('show')) render();
  scheduleSync(300); checkAdv(); maybeCheckin();
});
setInterval(() => { if (dkey() !== lastDay) { lastDay = dkey(); render(); scheduleSync(); maybeCheckin(); } checkAdv(); updateAway(); }, 15e3);
window.addEventListener('online', () => scheduleSync(300));

applyTheme();
render();
handleLinks();
if (!S.onboarded) onboarding();
else setTimeout(() => { if (!advActive()) say(pick(stageOf(levelInfo().lvl).key === 'egg' ? MSG.egg : MSG[petMood()] || MSG.calm)); }, 700);
checkAdv(); maybeCheckin();
scheduleSync(800);
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
}
