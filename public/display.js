const socket = io();

socket.on('state-updated', (state) => {
  render(state);
});

async function refresh() {
  const res = await fetch('/api/state');
  const state = await res.json();
  render(state);
}

function renderContestantAvatar(c) {
  if (c && c.photo) {
    return `<img src="${c.photo}" class="contestant-avatar">`;
  }
  return `<div class="contestant-avatar">No Img</div>`;
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

  // Handle Overall Leaderboard Active State
  if (activeSegmentId === 'overall') {
    segTitleEl.textContent = '⭐ Overall Competition Leaderboard';
    renderOverallSummary(state);
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
    renderCombinedResults(state, segment.results);
  }
}

function renderOverallSummary(state) {
  const bodyEl = document.getElementById('body');
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

  let html = `
    <div class="table-container">
      <table class="results">
        <thead>
          <tr>
            <th style="width: 100px;">Rank</th>
            <th style="width: 120px;">No.</th>
            <th>Contestant Name</th>
            <th style="text-align: right;">Segments Completed</th>
            <th style="text-align: right;">Overall Average</th>
          </tr>
        </thead>
        <tbody>
  `;

  overallList.forEach(r => {
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

    const avgDisplay = r.overallAverage !== null ? r.overallAverage.toFixed(2) : '—';
    const numDisplay = r.number ? `#${r.number}` : '';
    const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
    const avatar = renderContestantAvatar(contestantObj);

    html += `
      <tr class="${rankClass}">
        <td>${awardIcon} ${r.rank}</td>
        <td>${numDisplay}</td>
        <td>
          <div class="contestant-cell">
            ${avatar}
            <span>${r.name}</span>
          </div>
        </td>
        <td style="text-align: right; color: var(--text-muted);">${r.segmentsCompleted} / ${state.segments.length}</td>
        <td style="text-align: right; font-weight: 800; color: var(--gold);">${avgDisplay}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  bodyEl.innerHTML = html;
}

function renderCombinedResults(state, results) {
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
    const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
    const avatar = renderContestantAvatar(contestantObj);

    html += `
      <tr class="${rankClass}">
        <td>${awardIcon} ${r.rank || '—'}</td>
        <td>${numDisplay}</td>
        <td>
          <div class="contestant-cell">
            ${avatar}
            <span>${r.name}</span>
          </div>
        </td>
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
    const contestantObj = state.contestants.find(c => c.id === r.contestantId) || r;
    const avatar = renderContestantAvatar(contestantObj);

    html += `
      <tr class="${rankClass}">
        <td>${awardIcon} ${r.rank || '—'}</td>
        <td>${numDisplay}</td>
        <td>
          <div class="contestant-cell">
            ${avatar}
            <span>${r.name}</span>
          </div>
        </td>
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