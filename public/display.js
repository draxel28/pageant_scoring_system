const socket = io();

socket.on('state-updated', (state) => {
  render(state);
});

async function refresh() {
  const res = await fetch('/api/state');
  const state = await res.json();
  render(state);
}

function render(state) {
  const activeSegmentId = state.event && state.event.activeSegmentId;
  const segTitleEl = document.getElementById('segTitle');
  const bodyEl = document.getElementById('body');

  if (!activeSegmentId) {
    segTitleEl.textContent = state.event?.name || 'Pageant Scoring';
    bodyEl.innerHTML = `<div class="waiting pulse">Waiting for the next segment to begin...</div>`;
    return;
  }

  const segment = state.segments.find(s => s.id === activeSegmentId);
  if (!segment) {
    segTitleEl.textContent = 'Pageant Scoring';
    bodyEl.innerHTML = `<div class="waiting">Active segment not found.</div>`;
    return;
  }

  segTitleEl.textContent = segment.name;

  if (!segment.revealed) {
    bodyEl.innerHTML = `<div class="waiting pulse">Scores for <strong>${segment.name}</strong> are currently hidden. Please stand by.</div>`;
    return;
  }

  const displayMode = state.event.displayMode || 'combined';

  if (displayMode === 'judges') {
    renderJudgesMatrix(state, segment);
  } else {
    renderCombinedResults(segment.results);
  }
}

function renderCombinedResults(results) {
  const bodyEl = document.getElementById('body');
  if (!results || results.length === 0) {
    bodyEl.innerHTML = `<div class="waiting">No scores submitted yet.</div>`;
    return;
  }

  let html = `
    <div class="table-container">
      <table class="results">
        <thead>
          <tr>
            <th style="width: 100px;">Rank</th>
            <th style="width: 120px;">No.</th>
            <th>Contestant Name</th>
            <th style="text-align: right;">Average Score</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(r => {
    let rankClass = '';
    let awardIcon = '';
    
    if (r.rank === 1) {
      rankClass = 'rank1';
      awardIcon = '<span class="award-icon">👑</span>';
    } else if (r.rank === 2) {
      rankClass = 'rank2';
      awardIcon = '<span class="award-icon">🏆</span>';
    } else if (r.rank === 3) {
      rankClass = 'rank3';
      awardIcon = '<span class="award-icon">🥉</span>';
    }

    const avgDisplay = r.average !== null ? r.average.toFixed(2) : '—';
    const numDisplay = r.number ? `#${r.number}` : '';

    html += `
      <tr class="${rankClass}">
        <td>${awardIcon} ${r.rank || '—'}</td>
        <td>${numDisplay}</td>
        <td>${r.name}</td>
        <td style="text-align: right;">${avgDisplay}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  bodyEl.innerHTML = html;
}

function renderJudgesMatrix(state, segment) {
  const bodyEl = document.getElementById('body');
  const results = segment.results;
  const judges = state.judges || [];
  const segScores = state.scores[segment.id] || {};

  if (!results || results.length === 0) {
    bodyEl.innerHTML = `<div class="waiting">No scores submitted yet.</div>`;
    return;
  }

  let html = `
    <div class="table-container">
      <table class="results">
        <thead>
          <tr>
            <th style="width: 90px;">Rank</th>
            <th style="width: 100px;">No.</th>
            <th>Contestant</th>
  `;

  // Map judges anonymously to Judge #1, Judge #2, etc.
  judges.forEach((j, index) => {
    html += `<th style="text-align: right;">Judge #${index + 1}</th>`;
  });

  html += `
            <th style="text-align: right;">Average</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(r => {
    let rankClass = '';
    let awardIcon = '';

    if (r.rank === 1) {
      rankClass = 'rank1';
      awardIcon = '<span class="award-icon">👑</span>';
    } else if (r.rank === 2) {
      rankClass = 'rank2';
      awardIcon = '<span class="award-icon">🏆</span>';
    } else if (r.rank === 3) {
      rankClass = 'rank3';
      awardIcon = '<span class="award-icon">🥉</span>';
    }

    const numDisplay = r.number ? `#${r.number}` : '';
    const avgDisplay = r.average !== null ? r.average.toFixed(2) : '—';

    html += `
      <tr class="${rankClass}">
        <td>${awardIcon} ${r.rank || '—'}</td>
        <td>${numDisplay}</td>
        <td>${r.name}</td>
    `;

    judges.forEach(j => {
      const judgeScores = segScores[j.id] && segScores[j.id][r.contestantId];
      let sum = '—';
      if (judgeScores) {
        let total = 0;
        segment.criteria.forEach(cr => {
          total += Number(judgeScores[cr.id]) || 0;
        });
        sum = total.toFixed(2);
      }
      html += `<td style="text-align: right; color: var(--text-muted);">${sum}</td>`;
    });

    html += `
        <td style="text-align: right; font-weight: 800;">${avgDisplay}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  bodyEl.innerHTML = html;
}

refresh();