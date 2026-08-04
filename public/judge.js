const socket = io();
let state = null;
let judge = JSON.parse(localStorage.getItem('judge') || 'null');
let draft = {}; // contestantId -> {criteriaId: value}

socket.on('state-updated', (s) => { state = s; if (judge) render(); });

async function refresh() {
  const res = await fetch('/api/state');
  state = await res.json();
  if (judge) {
    document.getElementById('loginCard').style.display = 'none';
    document.getElementById('scoringArea').style.display = 'block';
    document.getElementById('judgeName').textContent = judge.name;
    render();
  }
}

async function login() {
  const pin = document.getElementById('pinInput').value.trim();
  const res = await fetch('/api/judge/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pin }) });
  if (!res.ok) {
    document.getElementById('loginError').textContent = 'Invalid PIN, try again.';
    return;
  }
  judge = await res.json();
  localStorage.setItem('judge', JSON.stringify(judge));
  refresh();
}

function render() {
  const seg = state.segments.find(s => s.id === state.event.activeSegmentId);
  document.getElementById('segmentName').textContent = seg ? 'Segment: ' + seg.name : 'No active segment yet';
  const container = document.getElementById('contestantCards');
  if (!seg) { container.innerHTML = '<div class="card muted">Waiting for the organizer to start a segment...</div>'; return; }

  const segScores = (state.scores[seg.id] && state.scores[seg.id][judge.id]) || {};

  container.innerHTML = state.contestants.map(c => {
    const existing = segScores[c.id] || {};
    const key = seg.id + '_' + c.id;
    if (!draft[key]) draft[key] = { ...existing };
    const submitted = !!segScores[c.id];
    return `<div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">#${c.number || ''} ${c.name}</h3>
        <span class="badge ${submitted ? 'on':'off'}">${submitted ? 'Submitted' : 'Not submitted'}</span>
      </div>
      ${seg.criteria.map(cr => `
        <div class="row" style="margin-top:8px">
          <label style="flex:1">${cr.name} <span class="muted">(0–${cr.maxScore})</span></label>
          <input type="number" min="0" max="${cr.maxScore}" step="0.1"
            value="${draft[key][cr.id] ?? ''}"
            style="width:100px"
            oninput="draft['${key}']['${cr.id}']=this.value">
        </div>`).join('')}
      <div class="row" style="margin-top:12px">
        <button onclick="submitScore('${seg.id}','${c.id}','${key}')">${submitted ? 'Update Score' : 'Submit Score'}</button>
      </div>
    </div>`;
  }).join('');
}

async function submitScore(segmentId, contestantId, key) {
  const scores = draft[key];
  const res = await fetch('/api/judge/score', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ judgeId: judge.id, segmentId, contestantId, scores })
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Could not submit score');
  }
}

refresh();
