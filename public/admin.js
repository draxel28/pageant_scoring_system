// admin.js
const socket = io();
let state = null;
let critDraft = [];
let revealedPins = new Set();
let editingContestantId = null;
let activeScoreTabId = null;

socket.on('state-updated', (s) => { state = s; render(); });

async function refresh() {
  const res = await fetch('/api/state');
  state = await res.json();
  render();
}

function showNotice(message, title = "Notice") {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    
    const actions = document.getElementById('modalActions');
    actions.innerHTML = `<button onclick="closeCustomModal(true)">OK</button>`;
    modal.style.display = 'flex';
    window._modalResolve = resolve;
  });
}

function showConfirm(message, title = "Confirm Action") {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    
    const actions = document.getElementById('modalActions');
    actions.innerHTML = `
      <button class="secondary" onclick="closeCustomModal(false)">Cancel</button>
      <button class="danger" onclick="closeCustomModal(true)">Confirm</button>
    `;
    modal.style.display = 'flex';
    window._modalResolve = resolve;
  });
}

function closeCustomModal(val) {
  document.getElementById('customModal').style.display = 'none';
  if (window._modalResolve) {
    window._modalResolve(val);
    window._modalResolve = null;
  }
}

function addCritRow() {
  critDraft.push({ name: '', maxScore: 10 });
  renderCritRows();
}

function renderCritRows() {
  const el = document.getElementById('critRows');
  if (!el) return;
  el.innerHTML = critDraft.map((c, i) => `
    <div class="row" style="margin-bottom:6px">
      <input placeholder="Criterion name" value="${c.name}" oninput="critDraft[${i}].name=this.value">
      <input type="number" placeholder="Max score" value="${c.maxScore}" style="width:100px" oninput="critDraft[${i}].maxScore=this.value">
      <button type="button" class="danger" onclick="critDraft.splice(${i},1); renderCritRows();">Remove</button>
    </div>`).join('');
}

async function addContestant() {
  const number = document.getElementById('cNumber').value.trim();
  const name = document.getElementById('cName').value.trim();
  if (!name) return showNotice('Enter a contestant name');
  await fetch('/api/admin/contestants', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ number, name }) });
  document.getElementById('cNumber').value = '';
  document.getElementById('cName').value = '';
}

async function removeContestant(id) {
  const ok = await showConfirm('Remove this contestant?');
  if (!ok) return;
  await fetch('/api/admin/contestants/' + id, { method: 'DELETE' });
}

function startEditContestant(id) {
  editingContestantId = id;
  render();
}

function cancelEditContestant() {
  editingContestantId = null;
  render();
}

async function saveEditContestant(id) {
  const number = document.getElementById(`editNum_${id}`).value.trim();
  const name = document.getElementById(`editName_${id}`).value.trim();
  if (!name) return showNotice('Contestant name cannot be empty.');
  
  await fetch(`/api/admin/contestants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, name })
  });
  editingContestantId = null;
}

async function addJudge() {
  const name = document.getElementById('jName').value.trim();
  if (!name) return showNotice('Enter a judge name');
  await fetch('/api/admin/judges', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
  document.getElementById('jName').value = '';
}

async function removeJudge(id) {
  const ok = await showConfirm('Remove this judge?');
  if (!ok) return;
  await fetch('/api/admin/judges/' + id, { method: 'DELETE' });
}

function togglePinVisibility(id) {
  if (revealedPins.has(id)) {
    revealedPins.delete(id);
  } else {
    revealedPins.add(id);
  }
  render();
}

async function updateDisplayMode(mode) {
  await fetch('/api/admin/display-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });
}

async function addSegment() {
  const name = document.getElementById('sName').value.trim();
  if (!name) return showNotice('Enter a segment name');
  if (critDraft.length === 0) return showNotice('Add at least one criterion');
  await fetch('/api/admin/segments', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, criteria: critDraft }) });
  document.getElementById('sName').value = '';
  critDraft = [];
  renderCritRows();
}

async function removeSegment(id) {
  const ok = await showConfirm('Remove this segment and its scores?');
  if (!ok) return;
  await fetch('/api/admin/segments/' + id, { method: 'DELETE' });
}

async function activateSegment(id) {
  await fetch(`/api/admin/segments/${id}/activate`, { method: 'POST' });
}

async function setOverallActive() {
  await fetch('/api/admin/segments/overall/activate', { method: 'POST' });
}

async function toggleReveal(id, revealed) {
  await fetch(`/api/admin/segments/${id}/reveal`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ revealed }) });
}

function render() {
  if (!state) return;

  const cTable = document.querySelector('#contestantTable tbody');
  if (cTable) {
    cTable.innerHTML = state.contestants.map(c => {
      const isEditing = editingContestantId === c.id;
      if (isEditing) {
        return `
          <tr>
            <td><input id="editNum_${c.id}" value="${c.number || ''}" style="width: 70px; padding: 8px 12px; background: rgba(0,0,0,0.5); border: 1px solid var(--gold); border-radius: 8px; color: #fff;"></td>
            <td><input id="editName_${c.id}" value="${c.name}" style="padding: 8px 12px; background: rgba(0,0,0,0.5); border: 1px solid var(--gold); border-radius: 8px; color: #fff; width: 100%;"></td>
            <td style="white-space: nowrap; text-align: right;">
              <button type="button" onclick="saveEditContestant('${c.id}')" style="padding: 8px 14px; font-size: 0.85rem;">Save</button>
              <button type="button" class="secondary" onclick="cancelEditContestant()" style="padding: 8px 14px; font-size: 0.85rem; margin-left: 6px;">Cancel</button>
            </td>
          </tr>
        `;
      }
      return `
        <tr>
          <td>${c.number || ''}</td>
          <td>${c.name}</td>
          <td style="white-space: nowrap; text-align: right;">
            <button type="button" class="secondary" onclick="startEditContestant('${c.id}')" style="padding: 8px 14px; font-size: 0.85rem;">Edit</button>
            <button type="button" class="danger" onclick="removeContestant('${c.id}')" style="padding: 8px 14px; font-size: 0.85rem; margin-left: 6px;">Remove</button>
          </td>
        </tr>`;
    }).join('');
  }
  
  const jTable = document.querySelector('#judgeTable tbody');
  if (jTable) {
    jTable.innerHTML = state.judges.map(j => {
      const isShown = revealedPins.has(j.id);
      const pinDisplay = isShown ? (j.pin || '(none)') : '(hidden)';
      const btnText = isShown ? 'Hide PIN' : 'Show PIN';
      return `
        <tr>
          <td>${j.name}</td>
          <td class="pin">${pinDisplay} <button type="button" class="secondary" style="margin-left:10px; padding:2px 6px; font-size:12px;" onclick="togglePinVisibility('${j.id}')">${btnText}</button></td>
          <td style="text-align: right;"><button type="button" class="danger" onclick="removeJudge('${j.id}')" style="padding: 8px 14px; font-size: 0.85rem;">Remove</button></td>
        </tr>`;
    }).join('');
  }

  const sTable = document.querySelector('#segmentTable tbody');
  if (sTable) {
    sTable.innerHTML = state.segments.map(s => {
      const active = state.event.activeSegmentId === s.id;
      return `
        <tr>
          <td>${s.name}</td>
          <td class="muted">${s.criteria.map(c => `${c.name} (${c.maxScore})`).join(', ')}</td>
          <td><span class="badge ${active ? 'on':'off'}">${active ? 'ACTIVE' : 'inactive'}</span></td>
          <td><label><input type="checkbox" ${s.revealed ? 'checked':''} onchange="toggleReveal('${s.id}', this.checked)"> revealed</label></td>
          <td style="white-space: nowrap; text-align: right;">
            <button type="button" class="secondary" onclick="activateSegment('${s.id}')" style="padding: 8px 14px; font-size: 0.85rem;">Set Active</button>
            <button type="button" class="danger" onclick="removeSegment('${s.id}')" style="padding: 8px 14px; font-size: 0.85rem; margin-left: 6px;">Delete</button>
          </td>
        </tr>`;
    }).join('');
  }

  const modeSelect = document.getElementById('displayModeSelect');
  if (modeSelect && state.event && state.event.displayMode) {
    modeSelect.value = state.event.displayMode;
  }

  updatePdfDropdownOptions();
  renderTracker();
  renderSegmentScoreTabs();
}

function updatePdfDropdownOptions() {
  const select = document.getElementById('pdfExportSelect');
  if (!select) return;
  
  const currentVal = select.value;
  let optionsHtml = `<option value="overall">⭐ Overall Summary Report (PDF)</option>`;
  if (state.segments) {
    state.segments.forEach(s => {
      optionsHtml += `<option value="seg_${s.id}">📊 Segment: ${s.name} & Detailed Breakdown (PDF)</option>`;
    });
  }
  select.innerHTML = optionsHtml;
  if ([...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function renderTracker() {
  const el = document.getElementById('tracker');
  if (!el) return;
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

function renderSegmentScoreTabs() {
  const tabsContainer = document.getElementById('segmentTabs');
  const contentContainer = document.getElementById('segmentScoreContent');
  if (!tabsContainer || !contentContainer) return;

  if (!state.segments || state.segments.length === 0) {
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '<span class="muted">No segments created yet.</span>';
    return;
  }

  const segmentIds = state.segments.map(s => s.id);
  const allTabIds = [...segmentIds, 'overall'];

  if (!activeScoreTabId || !allTabIds.includes(activeScoreTabId)) {
    activeScoreTabId = segmentIds[0];
  }

  const isOverallActive = state.event && state.event.activeSegmentId === 'overall';

  tabsContainer.innerHTML = state.segments.map(s => `
    <button type="button" class="tab-btn ${s.id === activeScoreTabId ? 'active' : ''}" onclick="switchSegmentTab('${s.id}')">${s.name}</button>
  `).join('') + `
    <button type="button" class="tab-btn ${activeScoreTabId === 'overall' ? 'active' : ''}" onclick="switchSegmentTab('overall')" style="border-color: var(--gold);">⭐ Overall Summary</button>
  `;

  if (activeScoreTabId === 'overall') {
    contentContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <p class="muted" style="margin: 0;">Activate the overall leaderboard to bypass segment screens and display cumulative scores.</p>
        <button type="button" class="${isOverallActive ? 'secondary' : 'primary'}" onclick="setOverallActive()" style="padding: 10px 20px; font-weight: bold;">
          ${isOverallActive ? '✓ Overall Leaderboard Active' : '⭐ Set Overall Active'}
        </button>
      </div>
    ` + getOverallSummaryHtml();
    return;
  }

  const currentSegment = state.segments.find(s => s.id === activeScoreTabId);

  let segmentActionHtml = '';
  if (currentSegment) {
    segmentActionHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <p class="muted" style="margin: 0;">Manage display status for this specific segment.</p>
      </div>
    `;
  }

  if (!currentSegment || !currentSegment.results || currentSegment.results.length === 0) {
    contentContainer.innerHTML = segmentActionHtml + '<span class="muted">No scores recorded for this segment yet.</span>';
    return;
  }

  contentContainer.innerHTML = segmentActionHtml + getSegmentReportHtml(currentSegment);
}

function getOverallSummaryHtml() {
  const overallMap = {};
  state.contestants.forEach(c => {
    overallMap[c.id] = {
      contestantId: c.id,
      number: c.number,
      name: c.name,
      totalScoreSum: 0,
      segmentsCompleted: 0
    };
  });

  state.segments.forEach(s => {
    if (s.results && s.results.length > 0) {
      s.results.forEach(r => {
        if (r.average !== null && overallMap[r.contestantId]) {
          overallMap[r.contestantId].totalScoreSum += r.average;
          overallMap[r.contestantId].segmentsCompleted += 1;
        }
      });
    }
  });

  const overallList = Object.values(overallMap).map(item => ({
    ...item,
    overallAverage: item.segmentsCompleted > 0 ? (item.totalScoreSum / item.segmentsCompleted) : null
  }));

  overallList.sort((a, b) => {
    if (a.overallAverage === null && b.overallAverage === null) return 0;
    if (a.overallAverage === null) return 1;
    if (b.overallAverage === null) return -1;
    return b.overallAverage - a.overallAverage;
  });

  let currentRank = 0;
  let lastScore = null;
  let skipped = 1;
  overallList.forEach((item) => {
    if (item.overallAverage === null) {
      item.rank = '—';
    } else {
      if (item.overallAverage === lastScore) {
        skipped++;
      } else {
        currentRank += skipped;
        skipped = 1;
        lastScore = item.overallAverage;
      }
      item.rank = currentRank;
    }
  });

  return `
    <h3 style="margin-top: 0; color: var(--gold);">Overall Competition Leaderboard &amp; Ranks</h3>
    <p class="muted" style="margin-bottom: 20px;">Cumulative summary of average scores across all segments.</p>
    <table>
      <thead>
        <tr>
          <th style="width: 80px;">Overall Rank</th>
          <th style="width: 90px;">No.</th>
          <th>Contestant Name</th>
          <th style="text-align: right;">Segments Completed</th>
          <th style="text-align: right;">Overall Average Score</th>
        </tr>
      </thead>
      <tbody>
        ${overallList.map(r => `
          <tr ${r.rank === 1 && r.overallAverage !== null ? 'style="background: rgba(243, 156, 18, 0.05);"' : ''}>
            <td><strong>${r.rank === 1 && r.overallAverage !== null ? '👑 ' : ''}${r.rank}</strong></td>
            <td>${r.number ? `#${r.number}` : ''}</td>
            <td><strong>${r.name}</strong></td>
            <td style="text-align: right;" class="muted">${r.segmentsCompleted} / ${state.segments.length}</td>
            <td style="text-align: right; font-weight: 700; color: var(--gold);">${r.overallAverage !== null ? r.overallAverage.toFixed(2) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function getSegmentReportHtml(currentSegment) {
  const segScores = state.scores[currentSegment.id] || {};
  const criteria = currentSegment.criteria || [];
  const judges = state.judges || [];

  return `
    <h3 style="margin-top: 0; color: var(--gold);">${currentSegment.name} - Leaderboard &amp; Ranks</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 80px;">Rank</th>
          <th style="width: 90px;">No.</th>
          <th>Contestant Name</th>
          <th style="text-align: right;">Submissions</th>
          <th style="text-align: right;">Average Score</th>
        </tr>
      </thead>
      <tbody>
        ${currentSegment.results.map(r => `
          <tr>
            <td><strong>${r.rank || '—'}</strong></td>
            <td>${r.number ? `#${r.number}` : ''}</td>
            <td>${r.name}</td>
            <td style="text-align: right;" class="muted">${r.submittedCount} / ${r.totalJudges}</td>
            <td style="text-align: right; font-weight: 700; color: var(--gold);">${r.average !== null ? r.average.toFixed(2) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3 style="margin-top: 35px; border-top: 1px solid var(--border-color); padding-top: 20px; color: var(--gold);">Per-Judge Breakdown Matrix (Detailed Scores)</h3>
    <table style="font-size: 0.90rem; width: 100%;">
      <thead>
        <tr>
          <th style="width: 50px;">No.</th>
          <th>Contestant Name</th>
          <th>Judge Name</th>
          ${criteria.map(c => `<th style="text-align: right;">${c.name} (${c.maxScore})</th>`).join('')}
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${currentSegment.results.map(r => {
          let rowsForContestant = '';
          judges.forEach((j, jIndex) => {
            const jScores = segScores[j.id] && segScores[j.id][r.contestantId];
            let judgeTotal = 0;
            let hasSubmitted = jScores !== undefined;

            let critCols = criteria.map(crit => {
              const val = hasSubmitted ? (jScores[crit.id] !== undefined ? jScores[crit.id] : '—') : '—';
              if (hasSubmitted && jScores[crit.id] !== undefined) {
                judgeTotal += Number(jScores[crit.id]) || 0;
              }
              return `<td style="text-align: right;">${val}</td>`;
            }).join('');

            const isFirst = jIndex === 0;
            const isLast = jIndex === judges.length - 1;
            const borderStyle = isLast ? 'border-bottom: 2px solid #cbd5e1;' : 'border-bottom: 1px solid #f1f5f9;';

            rowsForContestant += `
              <tr style="${borderStyle}">
                <td style="${!isFirst ? 'color: transparent;' : ''}">${r.number ? `#${r.number}` : ''}</td>
                <td style="${!isFirst ? 'color: transparent;' : 'font-weight: 600;'}">${r.name}</td>
                <td style="color: #64748b;">${j.name}</td>
                ${critCols}
                <td style="text-align: right; font-weight: 700;">${hasSubmitted ? judgeTotal.toFixed(2) : '—'}</td>
              </tr>
            `;
          });
          return rowsForContestant;
        }).join('')}
      </tbody>
    </table>
  `;
}

function switchSegmentTab(segmentId) {
  activeScoreTabId = segmentId;
  renderSegmentScoreTabs();
}

function downloadSelectedPDF() {
  showNotice('Export PDF is under maintenance.');
}

refresh();