const socket = typeof io === 'function' ? io() : null;

// Add ?demo to the overlay URL to preview the layout with sample data.
const DEMO_MODE = new URLSearchParams(location.search).has('demo');

// How long the old contestant takes to fade out before the next one starts
// their (delayed) entrance. Matches the 0.8s fade in overlay.html.
const SWAP_MS = 900;

const slots = {
  female: document.getElementById('slot-female'),
  male: document.getElementById('slot-male'),
};

// Remembers what each side last showed, so we only redraw on real changes
// and can flash a score the moment it comes in.
const memory = {
  female: { sig: '', who: '', scores: {}, timer: null, next: null },
  male: { sig: '', who: '', scores: {}, timer: null, next: null },
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function initials(name) {
  return String(name || '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// Women on the left, men on the right. Uses contestant.gender when present,
// otherwise falls back to order (first = left, second = right).
function preferredSide(item, index) {
  const g = String(item.contestant.gender || '').trim().toLowerCase();
  if (g.startsWith('f') || g.startsWith('w')) return 'female';
  if (g.startsWith('m')) return 'male';
  return index === 0 ? 'female' : 'male';
}

// Accepts one spotlight object (old format) or an array of them.
function assignSides(data) {
  const list = (Array.isArray(data) ? data : [data]).filter(item => item && item.contestant);
  const result = { female: null, male: null };
  list.forEach((item, i) => {
    let side = preferredSide(item, i);
    if (result[side]) side = side === 'female' ? 'male' : 'female';
    if (!result[side]) result[side] = item;
  });
  return result;
}

function scoreMap(item) {
  return Object.fromEntries((item.perJudge || []).map(j => [j.judgeName, j.score]));
}

// Identifies "who is on this side right now" (a score change keeps the same id).
function whoOf(item) {
  return [item.contestant.number, item.contestant.name, item.segment && item.segment.name].join('|');
}

function judgesHtml(item, prevScores) {
  return (item.perJudge || []).map(j => {
    const pending = j.score === null || j.score === undefined;
    const changed = prevScores && !pending && prevScores[j.judgeName] !== j.score;
    return `
      <div class="judge">
        <span class="judge-name">${esc(j.judgeName)}</span>
        <span class="judge-score${pending ? ' pending' : ''}${changed ? ' flash' : ''}">${pending ? '—' : esc(j.score)}</span>
      </div>`;
  }).join('');
}

function avgText(item) {
  return item.average === null || item.average === undefined
    ? '—'
    : Number(item.average).toFixed(2);
}

function panelHtml(item, prevScores) {
  const c = item.contestant;
  const segmentName = item.segment && item.segment.name;

  const meta = (c.hometown || segmentName) ? `
      <div class="meta">
        ${c.hometown ? `<div class="hometown">${esc(c.hometown)}</div>` : ''}
        ${segmentName ? `<div class="segment">${esc(segmentName)}</div>` : ''}
      </div>` : '';

  const portrait = c.photo
    ? `<img src="${esc(c.photo)}" alt="" onerror="this.parentElement.innerHTML='<div class=&quot;portrait-mark&quot;>${esc(initials(c.name))}</div>'">`
    : `<div class="portrait-mark">${esc(initials(c.name))}</div>`;

  return `
    <article class="panel">
      <div class="portrait">${portrait}</div>
      ${c.number ? `<div class="id-mark">${esc(c.number)}</div>` : ''}
      <div class="name">${esc(c.name)}</div>
      ${meta}
      <div class="divider"></div>
      <div class="judges">${judgesHtml(item, prevScores)}</div>
      <div class="avg">
        <div class="avg-label">Average</div>
        <div class="avg-score">${avgText(item)}</div>
      </div>
    </article>`;
}

function showSlot(slot) {
  if (!slot.classList.contains('show')) {
    void slot.offsetWidth; // flush styles so the slide-in animates
    slot.classList.add('show');
  }
}

// Draws a brand-new panel (the entrance animations play when the slot gets .show).
function build(side, item) {
  const mem = memory[side];
  const who = whoOf(item);
  const prevScores = mem.who === who ? mem.scores : null;
  slots[side].innerHTML = panelHtml(item, prevScores);
  mem.sig = JSON.stringify(item);
  mem.who = who;
  mem.scores = scoreMap(item);
}

// Same contestant, new scores: update only the judge rows and the average.
// The photo, name and entrance animations are left alone, so nothing replays
// and the judges never pop in ahead of their delay.
function updateInPlace(side, item) {
  const slot = slots[side];
  const mem = memory[side];
  const judgesEl = slot.querySelector('.judges');
  const avgEl = slot.querySelector('.avg-score');
  if (!judgesEl || !avgEl) return build(side, item);
  judgesEl.innerHTML = judgesHtml(item, mem.scores);
  avgEl.textContent = avgText(item);
  mem.sig = JSON.stringify(item);
  mem.scores = scoreMap(item);
}

function paint(side, item) {
  const slot = slots[side];
  const mem = memory[side];

  if (!item) {
    // Hide but keep the old content so it can slide out smoothly.
    clearTimeout(mem.timer);
    mem.timer = null;
    mem.next = null;
    slot.classList.remove('show');
    return;
  }

  // A contestant swap is already in progress: just remember the latest data.
  if (mem.timer) { mem.next = item; return; }

  const sig = JSON.stringify(item);
  if (sig === mem.sig) { showSlot(slot); return; }

  const who = whoOf(item);
  const shown = slot.classList.contains('show');

  if (shown && mem.who && mem.who !== who) {
    // A different contestant while the old one is on screen: fade the old one out,
    // then bring the new one in from scratch so EVERYTHING (judges included)
    // follows the same delayed entrance.
    slot.classList.remove('show');
    mem.next = item;
    mem.timer = setTimeout(() => {
      mem.timer = null;
      const next = mem.next;
      mem.next = null;
      if (!next) return;
      build(side, next);
      showSlot(slot);
    }, SWAP_MS);
    return;
  }

  if (shown && mem.who === who) { updateInPlace(side, item); return; }

  // Slot was hidden: draw the panel, then reveal it.
  build(side, item);
  showSlot(slot);
}

function render(data) {
  const bySide = assignSides(data);
  paint('female', bySide.female);
  paint('male', bySide.male);
}

const DEMO = [
  {
    contestant: { number: 7, name: 'Maria Santos', hometown: 'Batangas City', gender: 'female' },
    segment: { name: 'Evening Gown' },
    perJudge: [
      { judgeName: 'Judge 1', score: 9.2 }, { judgeName: 'Judge 2', score: 8.8 },
      { judgeName: 'Judge 3', score: 9.5 }, { judgeName: 'Judge 4', score: 9.0 },
      { judgeName: 'Judge 5', score: 9.1 }, { judgeName: 'Judge 6', score: null },
    ],
    average: 9.12,
  },
  {
    contestant: { number: 7, name: 'Juan dela Cruz', hometown: 'Lipa City', gender: 'male' },
    segment: { name: 'Evening Gown' },
    perJudge: [
      { judgeName: 'Judge 1', score: 8.9 }, { judgeName: 'Judge 2', score: 9.3 },
      { judgeName: 'Judge 3', score: 9.0 }, { judgeName: 'Judge 4', score: null },
      { judgeName: 'Judge 5', score: null }, { judgeName: 'Judge 6', score: null },
    ],
    average: 9.07,
  },
];

async function refresh() {
  if (DEMO_MODE) { render(DEMO); return; }
  try {
    const res = await fetch('/api/spotlight');
    const data = await res.json();
    render(data);
  } catch (e) { /* keep last shown state on transient errors */ }
}

if (socket) socket.on('state-updated', refresh);
refresh();
setInterval(refresh, 2000);