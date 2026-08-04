const socket = io();
let state = null;

socket.on('state-updated', (s) => { state = s; render(); });

async function refresh() {
  const res = await fetch('/api/state');
  state = await res.json();
  render();
}

async function render() {
  if (!state) return;
  const seg = state.segments.find(s => s.id === state.event.activeSegmentId);
  const title = document.getElementById('segTitle');
  const body = document.getElementById('body');

  if (!seg) {
    title.textContent = state.event.name || 'Pageant Night';
    body.innerHTML = '<div class="waiting">Awaiting the first segment...</div>';
    return;
  }

  title.textContent = seg.name;

  if (!seg.revealed) {
    const segScores = state.scores[seg.id] || {};
    const submitted = new Set();
    Object.values(segScores).forEach(byC => Object.keys(byC).forEach(cid => submitted.add(cid)));
    body.innerHTML = `<div class="waiting pulse">Judges are scoring... &#9998;</div>
      <div class="muted" style="font-size:1.3rem;margin-top:20px">${state.contestants.length} contestants &middot; ${state.judges.length} judges</div>`;
    return;
  }

  const res = await fetch('/api/results/' + seg.id);
  const rows = await res.json();
  body.innerHTML = `<table class="results">
    <thead><tr><th>Rank</th><th>#</th><th>Contestant</th><th>Score</th></tr></thead>
    <tbody>${rows.map(r => `
      <tr class="${r.rank===1?'rank1':r.rank===2?'rank2':r.rank===3?'rank3':''}">
        <td>${r.rank ?? '-'}</td>
        <td>${r.number || ''}</td>
        <td>${r.name}</td>
        <td>${r.average !== null ? r.average.toFixed(2) : 'pending'}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

refresh();
setInterval(refresh, 4000);
