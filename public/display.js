const socket = io();
let currentState = null;
let currentContestantIndex = 0;

// Helper to check if a file URL points to a video format
function isVideoFile(url) {
  if (!url) return false;
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop().toLowerCase();
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv', 'quicktime'];
  return videoExtensions.includes(ext);
}

socket.on('state-updated', (state) => {
  currentState = state;
  if (currentState.event && typeof currentState.event.activeContestantIndex === 'number') {
    currentContestantIndex = currentState.event.activeContestantIndex;
  }
  render(state);
});

socket.on('contestant-index-updated', (index) => {
  currentContestantIndex = index;
  if (currentState) {
    render(currentState);
  } else {
    refresh();
  }
});

socket.on('next-contestant', () => {
  if (!currentState || !currentState.contestants || currentState.contestants.length === 0) return;
  currentContestantIndex = (currentContestantIndex + 1) % currentState.contestants.length;
  socket.emit('update-contestant-index', currentContestantIndex);
  render(currentState);
});

socket.on('prev-contestant', () => {
  if (!currentState || !currentState.contestants || currentState.contestants.length === 0) return;
  currentContestantIndex = (currentContestantIndex - 1 + currentState.contestants.length) % currentState.contestants.length;
  socket.emit('update-contestant-index', currentContestantIndex);
  render(currentState);
});

async function refresh() {
  const res = await fetch('/api/state');
  currentState = await res.json();
  if (currentState.event && typeof currentState.event.activeContestantIndex === 'number') {
    currentContestantIndex = currentState.event.activeContestantIndex;
  }
  render(currentState);
}

function updateBackground(state) {
  if (state.event && state.event.backgroundUrl) {
    document.body.style.backgroundImage = `url('${state.event.backgroundUrl}')`;
  } else if (state.backgrounds && state.backgrounds.length > 0) {
    document.body.style.backgroundImage = `url('${state.backgrounds[state.backgrounds.length - 1].url}')`;
  }
}

function render(state) {
  updateBackground(state);

  const activeSegmentId = state.event && state.event.activeSegmentId;
  const segTitleEl = document.getElementById('segTitle');
  const bodyEl = document.getElementById('body');

  if (!activeSegmentId) {
    segTitleEl.textContent = state.event?.name || 'Pageant Scoring';
    bodyEl.innerHTML = `<div class="waiting pulse">Waiting for the next segment to begin...</div>`;
    return;
  }

  if (activeSegmentId === 'overall') {
    segTitleEl.textContent = '⭐ Overall Competition Leaderboard';
    bodyEl.innerHTML = `<div class="waiting">Please select an individual active segment to display single contestant breakdown.</div>`;
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

  const contestants = state.contestants || [];
  if (contestants.length === 0) {
    bodyEl.innerHTML = `<div class="waiting">No contestants registered.</div>`;
    return;
  }

  if (currentContestantIndex >= contestants.length) {
    currentContestantIndex = 0;
  }

  const contestant = contestants[currentContestantIndex];
  const judges = state.judges || [];
  const segScores = state.scores[segment.id] || {};
  
  const contestantResult = segment.results ? segment.results.find(r => r.contestantId === contestant.id) : null;
  const averageScore = contestantResult && contestantResult.average !== null ? contestantResult.average.toFixed(2) : '—';

  let avatarHtml = `<div class="contestant-avatar-placeholder">No Photo</div>`;
  if (contestant.photo) {
    avatarHtml = `<img src="${contestant.photo}" class="contestant-large-avatar" alt="${contestant.name}">`;
  }

  // --- Strict Segment-Specific Media Lookups (Photo or Video Support with Fallback Check) ---
  const segmentPhotos = state.segmentPhotos || [];
  const activeSegmentPhoto = segmentPhotos.find(
    p => p.segmentId === segment.id && p.contestantId === contestant.id
  );

  let centralPhotoHtml = `<div style="width: 300px; height: 350px; border: 3px dashed var(--border-color); border-radius: 20px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); background: rgba(0,0,0,0.2);">No Segment Media Uploaded</div>`;
  
  if (activeSegmentPhoto && activeSegmentPhoto.url) {
    console.log("Resolved segment media URL:", activeSegmentPhoto.url);
    
    // Check using helper function or flexible extension/pattern matching
    if (isVideoFile(activeSegmentPhoto.url) || /\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i.test(activeSegmentPhoto.url)) {
      centralPhotoHtml = `<video src="${activeSegmentPhoto.url}" autoplay loop muted playsinline style="max-height: 45vh; max-width: 100%; object-fit: contain; border-radius: 20px; border: 4px solid var(--gold); box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px var(--gold-glow);"></video>`;
    } else {
      centralPhotoHtml = `<img src="${activeSegmentPhoto.url}" alt="${contestant.name}" style="max-height: 45vh; max-width: 100%; object-fit: contain; border-radius: 20px; border: 4px solid var(--gold); box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px var(--gold-glow);">`;
    }
  }

  let judgesHtml = '';
  if (judges.length === 0) {
    judgesHtml = `<span style="color: var(--text-muted); font-size: 0.9rem;">No judges added yet.</span>`;
  } else {
    judges.forEach((j) => {
      const judgeScores = segScores[j.id] && segScores[j.id][contestant.id];
      let scoreDisplay = '—';
      if (judgeScores) {
        let total = 0;
        segment.criteria.forEach(cr => {
          total += Number(judgeScores[cr.id]) || 0;
        });
        scoreDisplay = total.toFixed(2);
      }

      const sampleJudgePhoto = `https://picsum.photos/seed/judge${j.id}/100/100`;

      judgesHtml += `
        <div class="judge-card">
          <img src="${sampleJudgePhoto}" class="judge-avatar" alt="${j.name}">
          <span class="judge-name">${j.name}</span>
          <span class="judge-score">${scoreDisplay}</span>
        </div>
      `;
    });
  }

  bodyEl.innerHTML = `
    <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; flex: 1; width: 100%;">
      
      <!-- Middle Screen: Segment Contestant Media Real-Time Display -->
      <div style="display: flex; justify-content: center; align-items: center; flex: 1; margin: 20px 0;">
        ${centralPhotoHtml}
      </div>

      <!-- Bottom Banner -->
      <div class="display-banner">
        <!-- Left: Contestant Profile -->
        <div class="contestant-section">
          ${avatarHtml}
          <div class="contestant-info">
            <h2 class="contestant-name">${contestant.number ? `#${contestant.number} ` : ''}${contestant.name}</h2>
            <div class="contestant-location">${contestant.barangay || 'Contestant'}</div>
          </div>
        </div>

        <!-- Center: Judges List & Scores -->
        <div class="judges-section">
          ${judgesHtml}
        </div>

        <!-- Right: Average Score -->
        <div class="average-section">
          <div class="average-label">Average Score</div>
          <div class="average-value">${averageScore}</div>
        </div>
      </div>
    </div>
  `;
}

refresh();