const socket = typeof io === 'function' ? io() : null;

// Add ?demo to the overlay URL to preview the layout with sample data.
const DEMO_MODE = new URLSearchParams(location.search).has('demo');

const slots = {
  female: document.getElementById('slot-female'),
  male: document.getElementById('slot-male'),
};

// Remembers what each side last showed, so we only redraw on real changes
// and can flash a score the moment it comes in.
const memory = {
  female: { sig: '', who: '', scores: {} },
  male: { sig: '', who: '', scores: {} },
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

function panelHtml(item, prevScores) {
  const c = item.contestant;
  const segmentName = item.segment && item.segment.name;

  const judges = (item.perJudge || []).map(j => {
    const pending = j.score === null || j.score === undefined;
    const changed = prevScores && !pending && prevScores[j.judgeName] !== j.score;
    return `
      <div class="judge">
        <span class="judge-name">${esc(j.judgeName)}</span>
        <span class="judge-score${pending ? ' pending' : ''}${changed ? ' flash' : ''}">${pending ? '—' : esc(j.score)}</span>
      </div>`;
  }).join('');

  const avg = item.average === null || item.average === undefined
    ? '—'
    : Number(item.average).toFixed(2);

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
      <div class="judges">${judges}</div>
      <div class="avg">
        <div class="avg-label">Average</div>
        <div class="avg-score">${avg}</div>
      </div>
    </article>`;
}

function paint(side, item) {
  const slot = slots[side];
  const mem = memory[side];

  if (!item) {
    // Hide but keep the old content so it can slide out smoothly.
    slot.classList.remove('show');
    return;
  }

  const sig = JSON.stringify(item);
  if (sig !== mem.sig) {
    const who = [item.contestant.number, item.contestant.name, item.segment && item.segment.name].join('|');
    const prevScores = mem.who === who ? mem.scores : null;
    slot.innerHTML = panelHtml(item, prevScores);
    mem.sig = sig;
    mem.who = who;
    mem.scores = scoreMap(item);
  }

  if (!slot.classList.contains('show')) {
    void slot.offsetWidth; // flush styles so the slide-in animates
    slot.classList.add('show');
  }
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