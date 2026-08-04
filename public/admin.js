const socket = io();
let state = null;
let critDraft = [];

socket.on('state-updated', (s) => { state = s; render(); });

async function refresh() {
  const res = await fetch('/api/state');
  state = await res.json();
  render();
}

function addCritRow() {
  critDraft.push({ name: '', maxScore: 10 });
  renderCritRows();
}
function renderCritRows() {
  const el = document.getElementById('critRows');
  el.innerHTML = critDraft.map((c, i) => `
    <div class="row" style="margin-bottom:6px">
      <input placeholder="Criterion name" value="${c.name}" oninput="critDraft[${i}].name=this.value">
      <input type="number" placeholder="Max score" value="${c.maxScore}" style="width:100px" oninput="critDraft[${i}].maxScore=this.value">
      <button class="danger" onclick="critDraft.splice(${i},1); renderCritRows();">Remove</button>
    </div>`).join('');
}

async function addContestant() {
  const number = document.getElementById('cNumber').value.trim();
  const name = document.getElementById('cName').value.trim();
  if (!name) return alert('Enter a contestant name');
  await fetch('/api/admin/contestants', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ number, name }) });
  document.getElementById('cNumber').value = '';
  document.getElementById('cName').value = '';
}
async function removeContestant(id) {
  if (!confirm('Remove this contestant?')) return;
  await fetch('/api/admin/contestants/' + id, { method: 'DELETE' });
}

async function addJudge() {
  const name = document.getElementById('jName').value.trim();
  if (!name) return alert('Enter a judge name');
  await fetch('/api/admin/judges', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
  document.getElementById('jName').value = '';
}
async function removeJudge(id) {
  if (!confirm('Remove this judge?')) return;
  await fetch('/api/admin/judges/' + id, { method: 'DELETE' });
}

async function addSegment() {
  const name = document.getElementById('sName').value.trim();
  if (!name) return alert('Enter a segment name');
  if (critDraft.length === 0) return alert('Add at least one criterion');
  await fetch('/api/admin/segments', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, criteria: critDraft }) });
  document.getElementById('sName').value = '';
  critDraft = [];
  renderCritRows();
}
async function removeSegment(id) {
  if (!confirm('Remove this segment and its scores?')) return;
  await fetch('/api/admin/segments/' + id, { method: 'DELETE' });
}
async function activateSegment(id) {
  await fetch(`/api/admin/segments/${id}/activate`, { method: 'POST' });
}
async function toggleReveal(id, revealed) {
  await fetch(`/api/admin/segments/${id}/reveal`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ revealed }) });
}

function render() {
  if (!state) return;

  document.querySelector('#contestantTable tbody').innerHTML = state.contestants.map(c => `
    <tr><td>${c.number || ''}</td><td>${c.name}</td>
    <td><button class="danger" onclick="removeContestant('${c.id}')">Remove</button></td></tr>`).join('');

  document.querySelector('#judgeTable tbody').innerHTML = state.judges.map(j => `
    <tr><td>${j.name}</td><td class="pin">${j.pin || '(hidden)'}</td>
    <td><button class="danger" onclick="removeJudge('${j.id}')">Remove</button></td></tr>`).join('');

  document.querySelector('#segmentTable tbody').innerHTML = state.segments.map(s => {
    const active = state.event.activeSegmentId === s.id;
    return `<tr>
      <td>${s.name}</td>
      <td class="muted">${s.criteria.map(c => `${c.name} (${c.maxScore})`).join(', ')}</td>
      <td><span class="badge ${active ? 'on':'off'}">${active ? 'ACTIVE' : 'inactive'}</span></td>
      <td><label><input type="checkbox" ${s.revealed ? 'checked':''} onchange="toggleReveal('${s.id}', this.checked)"> revealed</label></td>
      <td>
        <button class="secondary" onclick="activateSegment('${s.id}')">Set Active</button>
        <button class="danger" onclick="removeSegment('${s.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');

  renderTracker();
}

function renderTracker() {
  const el = document.getElementById('tracker');
  const seg = state.segments.find(s => s.id === state.event.activeSegmentId);
  if (!seg) { el.innerHTML = '<span class="muted">No active segment.</span>'; return; }
  const segScores = state.scores[seg.id] || {};
  el.innerHTML = `<h3 style="margin-top:0">${seg.name}</h3><table><thead><tr><th>Judge</th>` +
    state.contestants.map(c => `<th>#${c.number || ''} ${c.name}</th>`).join('') + `</tr></thead><tbody>` +
    state.judges.map(j => `<tr><td>${j.name}</td>` +
      state.contestants.map(c => {
        const done = segScores[j.id] && segScores[j.id][c.id];
        return `<td>${done ? '<span class="badge on">✓</span>' : '<span class="badge off">—</span>'}</td>`;
      }).join('') + `</tr>`).join('') + `</tbody></table>`;
}

refresh();
