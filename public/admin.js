// admin.js
const socket = io({ query: { role: 'admin' } });
let state = null;
let critDraft = [];
let revealedPins = new Set();
let editingContestantId = null;
let activeScoreTabId = null;
let activeContestantIndex = 0;

socket.on('state-updated', (s) => { 
  state = s; 
  if (state.event && typeof state.event.activeContestantIndex === 'number') {
    activeContestantIndex = state.event.activeContestantIndex;
  }
  render(); 
});

socket.on('contestant-index-updated', (index) => {
  activeContestantIndex = index;
  updateSteppersUI();
});

async function refresh() {
  const res = await fetch('/api/state');
  state = await res.json();
  if (state.event && typeof state.event.activeContestantIndex === 'number') {
    activeContestantIndex = state.event.activeContestantIndex;
  }
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

// Helper to check if an uploaded asset URL points to a video file
function isVideoFile(url) {
  if (!url) return false;
  const ext = url.split('.').pop().toLowerCase();
  return ['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(ext);
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
  const barangay = document.getElementById('cBarangay').value.trim();
  const photoInput = document.getElementById('cPhoto');
  
  if (!name) return showNotice('Enter a contestant name');

  const formData = new FormData();
  formData.append('number', number);
  formData.append('name', name);
  formData.append('barangay', barangay);
  if (photoInput && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  }

  const response = await fetch('/api/admin/contestants', { 
    method: 'POST', 
    body: formData 
  });

  if (response.ok) {
    document.getElementById('cNumber').value = '';
    document.getElementById('cName').value = '';
    document.getElementById('cBarangay').value = '';
    if (photoInput) photoInput.value = '';
  }
}

async function saveEditContestant(id) {
  const number = document.getElementById(`editNum_${id}`).value.trim();
  const name = document.getElementById(`editName_${id}`).value.trim();
  const barangay = document.getElementById(`editBarangay_${id}`).value.trim();
  const photoInput = document.getElementById(`editPhoto_${id}`);

  if (!name) return showNotice('Contestant name cannot be empty.');

  const formData = new FormData();
  formData.append('number', number);
  formData.append('name', name);
  formData.append('barangay', barangay);
  if (photoInput && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  }

  await fetch(`/api/admin/contestants/${id}`, {
    method: 'PUT',
    body: formData
  });

  editingContestantId = null;
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

// Populate dropdowns and render segment photo / video list
function renderSegmentPhotosUI(state) {
  const segSelect = document.getElementById('segPhotoSegmentSelect');
  const conSelect = document.getElementById('segPhotoContestantSelect');
  const listEl = document.getElementById('segmentPhotosList');

  if (!segSelect || !conSelect || !listEl) return;

  segSelect.innerHTML = '<option value="">Select Segment...</option>';
  (state.segments || []).forEach(seg => {
    segSelect.innerHTML += `<option value="${seg.id}">${seg.name}</option>`;
  });

  conSelect.innerHTML = '<option value="">Select Contestant...</option>';
  (state.contestants || []).forEach(c => {
    conSelect.innerHTML += `<option value="${c.id}">#${c.number} - ${c.name}</option>`;
  });

  listEl.innerHTML = '';
  (state.segmentPhotos || []).forEach(p => {
    const seg = state.segments.find(s => s.id === p.segmentId);
    const con = state.contestants.find(c => c.id === p.contestantId);
    
    // Dynamically render either a video player or an image thumbnail
    const mediaPreviewHtml = isVideoFile(p.url)
      ? `<video src="${p.url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px;" muted preload="metadata"></video>`
      : `<img src="${p.url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px;">`;

    listEl.innerHTML += `
      <div style="border: 1px solid rgba(255,255,255,0.2); padding: 8px; border-radius: 8px; text-align: center; width: 120px;">
        <a href="${p.url}" target="_blank" title="View full size">${mediaPreviewHtml}</a>
        <div style="font-size: 0.75rem; margin-top: 4px;">${seg?.name || ''}</div>
        <div style="font-size: 0.75rem; font-weight: bold;">#${con?.number || ''}</div>
        <button onclick="deleteSegmentPhoto('${p.id}')" style="background: #e74c3c; color: white; border: none; padding: 2px 6px; border-radius: 4px; margin-top: 4px; cursor: pointer; font-size: 0.7rem;">Delete</button>
      </div>
    `;
  });
}

document.getElementById('segmentPhotoForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const segmentId = document.getElementById('segPhotoSegmentSelect').value;
  const contestantId = document.getElementById('segPhotoContestantSelect').value;
  const fileInput = document.getElementById('segPhotoFileInput').files[0];

  const formData = new FormData();
  formData.append('segmentId', segmentId);
  formData.append('contestantId', contestantId);
  formData.append('segmentPhoto', fileInput);

  const res = await fetch('/api/admin/segment-photos', {
    method: 'POST',
    body: formData
  });

  if (res.ok) {
    document.getElementById('segPhotoFileInput').value = '';
  } else {
    alert('Failed to upload segment media');
  }
});

async function deleteSegmentPhoto(id) {
  if (confirm('Delete this segment media file?')) {
    await fetch(`/api/admin/segment-photos/${id}`, { method: 'DELETE' });
  }
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

function renderContestantAvatar(c) {
  if (c && c.photo) {
    return `<img src="${c.photo}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 50%; border: 1px solid var(--gold); vertical-align: middle; margin-right: 8px;">`;
  }
  return `<div style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6rem; color: var(--text-muted); vertical-align: middle; margin-right: 8px;">No Img</div>`;
}

function nextContestant() {
  if (!state || !state.contestants || state.contestants.length === 0) return;
  if (activeContestantIndex < state.contestants.length - 1) {
    activeContestantIndex++;
    syncActiveContestant();
  }
}

function prevContestant() {
  if (!state || !state.contestants || state.contestants.length === 0) return;
  if (activeContestantIndex > 0) {
    activeContestantIndex--;
    syncActiveContestant();
  }
}

function jumpToContestant(index) {
  if (!state || !state.contestants || index < 0 || index >= state.contestants.length) return;
  activeContestantIndex = index;
  syncActiveContestant();
}

function syncActiveContestant() {
  updateSteppersUI();
  socket.emit('update-contestant-index', activeContestantIndex);
  fetch('/api/admin/active-contestant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: activeContestantIndex })
  }).catch(() => {});
}

function renderContestantsStepper(contestants) {
  const container = document.getElementById('contestantSteppers');
  if (!container) return;

  if (!contestants || contestants.length === 0) {
    container.innerHTML = `<span class="muted" style="padding: 10px; width: 100%; text-align: center;">No contestants loaded</span>`;
    return;
  }

  let html = '';
  contestants.forEach((c, idx) => {
    let statusClass = '';
    if (idx < activeContestantIndex) {
      statusClass = 'completed';
    } else if (idx === activeContestantIndex) {
      statusClass = 'active';
    }

    html += `
      <div class="step-item ${statusClass}" onclick="jumpToContestant(${idx})" style="cursor: pointer;">
        <div class="step-circle">${c.number || (idx + 1)}</div>
        <div class="step-label" title="${c.name}">${c.name}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function updateSteppersUI() {
  const items = document.querySelectorAll('.step-item');
  items.forEach((item, idx) => {
    item.classList.remove('completed', 'active');
    if (idx < activeContestantIndex) {
      item.classList.add('completed');
    } else if (idx === activeContestantIndex) {
      item.classList.add('active');
    }
  });
}

function render() {
  if (!state) return;

  renderSegmentPhotosUI(state);

  const cTable = document.querySelector('#contestantTable tbody');
  if (cTable) {
    cTable.innerHTML = state.contestants.map(c => {
      const isEditing = editingContestantId === c.id;
      const photoHtml = c.photo 
        ? `<img src="${c.photo}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 50%; border: 1px solid var(--gold);">` 
        : `<div style="width: 40px; height: 40px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-muted);">No Img</div>`;

      if (isEditing) {
        return `
          <tr>
            <td>
              ${photoHtml}
              <input type="file" id="editPhoto_${c.id}" accept="image/*" style="font-size: 0.7rem; width: 100px; margin-top: 4px;">
            </td>
            <td><input id="editNum_${c.id}" value="${c.number || ''}" style="width: 60px; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--gold); border-radius: 8px; color: #fff;"></td>
            <td><input id="editName_${c.id}" value="${c.name}" placeholder="Name" style="padding: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--gold); border-radius: 6px; color: #fff; width: 100%;"></td>
            <td><input id="editBarangay_${c.id}" value="${c.barangay || ''}" placeholder="Barangay" style="padding: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--gold); border-radius: 6px; color: #fff; width: 100%;"></td>
            <td style="white-space: nowrap; text-align: right;">
              <button type="button" onclick="saveEditContestant('${c.id}')" style="padding: 8px 14px; font-size: 0.85rem;">Save</button>
              <button type="button" class="secondary" onclick="cancelEditContestant()" style="padding: 8px 14px; font-size: 0.85rem; margin-left: 6px;">Cancel</button>
            </td>
          </tr>
        `;
      }
      return `
        <tr>
          <td>${photoHtml}</td>
          <td>${c.number || ''}</td>
          <td><strong>${c.name}</strong></td>
          <td><strong>${c.barangay || '—'}</strong></td>
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
  renderBackgroundGallery(state.backgrounds || []);
  renderContestantsStepper(state.contestants);
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
    state.contestants.map(c => {
      const avatar = renderContestantAvatar(c);
      return `<th>${avatar}#${c.number || ''} ${c.name}</th>`;
    }).join('') + `</tr></thead><tbody>` +
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
      photo: c.photo,
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
        ${overallList.map(r => {
          const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
          const avatar = renderContestantAvatar(contestantObj);
          return `
          <tr ${r.rank === 1 && r.overallAverage !== null ? 'style="background: rgba(243, 156, 18, 0.05);"' : ''}>
            <td><strong>${r.rank === 1 && r.overallAverage !== null ? '👑 ' : ''}${r.rank}</strong></td>
            <td>${r.number ? `#${r.number}` : ''}</td>
            <td>
              <div style="display: flex; align-items: center;">
                ${avatar}
                <strong>${r.name}</strong>
              </div>
            </td>
            <td style="text-align: right;" class="muted">${r.segmentsCompleted} / ${state.segments.length}</td>
            <td style="text-align: right; font-weight: 700; color: var(--gold);">${r.overallAverage !== null ? r.overallAverage.toFixed(2) : '—'}</td>
          </tr>
        `;
        }).join('')}
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
        ${currentSegment.results.map(r => {
          const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
          const avatar = renderContestantAvatar(contestantObj);
          return `
          <tr>
            <td><strong>${r.rank || '—'}</strong></td>
            <td>${r.number ? `#${r.number}` : ''}</td>
            <td>
              <div style="display: flex; align-items: center;">
                ${avatar}
                <strong>${r.name}</strong>
              </div>
            </td>
            <td style="text-align: right;" class="muted">${r.submittedCount} / ${r.totalJudges}</td>
            <td style="text-align: right; font-weight: 700; color: var(--gold);">${r.average !== null ? r.average.toFixed(2) : '—'}</td>
          </tr>
        `;
        }).join('')}
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
          const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
          const avatar = renderContestantAvatar(contestantObj);
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
                <td style="${!isFirst ? 'color: transparent;' : ''}">${isFirst ? `<div style="display: flex; align-items: center;">${avatar}<strong>${r.name}</strong></div>` : ''}</td>
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

async function downloadSelectedPDF() {
  const select = document.getElementById('pdfExportSelect');
  if (!select) return;
  
  const val = select.value;
  if (!val) {
    showNotice('Please select a report type to export.');
    return;
  }

  try {
    if (val === 'overall') {
      window.open('/api/admin/export/overall-pdf', '_blank');
    } else if (val.startsWith('seg_')) {
      const segmentId = val.replace('seg_', '');
      window.open(`/api/admin/export/segment-pdf/${segmentId}`, '_blank');
    }
  } catch (err) {
    showNotice('Failed to generate PDF report.');
  }
}

// ---------- Background Customization & Gallery ----------

async function uploadBackground() {
  const fileInput = document.getElementById('bgImageInput');
  if (!fileInput.files || fileInput.files.length === 0) {
    showNotice('Please select an image or video file first.');
    return;
  }

  const formData = new FormData();
  formData.append('background', fileInput.files[0]);

  try {
    const res = await fetch('/api/admin/backgrounds', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload background asset.');
    }
    fileInput.value = '';
  } catch (err) {
    showNotice(err.message);
  }
}

async function deleteBackground(id) {
  const ok = await showConfirm('Are you sure you want to delete this background item?');
  if (!ok) return;
  try {
    const res = await fetch(`/api/admin/backgrounds/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error('Failed to delete background.');
    }
  } catch (err) {
    showNotice(err.message);
  }
}

function renderBackgroundGallery(backgrounds) {
  const gallery = document.getElementById('bgGallery');
  if (!gallery) return;

  if (!backgrounds || backgrounds.length === 0) {
    gallery.innerHTML = '<span class="muted" style="font-size: 0.9rem;">No background assets uploaded yet.</span>';
    return;
  }

  gallery.innerHTML = backgrounds.map(bg => {
    // Dynamically render either a video player or an image thumbnail for backgrounds
    const bgPreviewHtml = isVideoFile(bg.url)
      ? `<video src="${bg.url}" style="width: 120px; height: 80px; object-fit: cover; display: block;" muted preload="metadata"></video>`
      : `<img src="${bg.url}" style="width: 120px; height: 80px; object-fit: cover; display: block;" alt="Background">`;

    return `
      <div style="position: relative; display: inline-block; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.2);">
        <a href="${bg.url}" target="_blank" title="View full size">
          ${bgPreviewHtml}
        </a>
        <button type="button" onclick="deleteBackground('${bg.id}')" class="danger" style="position: absolute; top: 4px; right: 4px; padding: 2px 6px; font-size: 0.75rem; border-radius: 4px;" title="Delete">×</button>
      </div>
    `;
  }).join('');
}

refresh();