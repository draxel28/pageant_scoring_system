const socket = io();

function initials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function refresh() {
  try {
    const res = await fetch('/api/spotlight');
    const data = await res.json();
    render(data);
  } catch (e) { /* keep last shown state on transient errors */ }
}

function render(data) {
  const bar = document.getElementById('bar');
  if (!data) {
    bar.classList.remove('show');
    return;
  }
  bar.classList.add('show');

  document.getElementById('name').textContent =
    (data.contestant.number ? '#' + data.contestant.number + ' ' : '') + data.contestant.name;
  document.getElementById('meta').textContent =
    [data.contestant.hometown, data.segment.name].filter(Boolean).join(' · ');

  const img = document.getElementById('photoImg');
  const fallback = document.getElementById('photoFallback');
  if (data.contestant.photo) {
    img.src = data.contestant.photo;
    img.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    fallback.textContent = initials(data.contestant.name);
    fallback.style.display = 'flex';
    img.style.display = 'none';
  }

  document.getElementById('judges').innerHTML = data.perJudge.map(j => `
    <div class="judge-cell">
      <div class="judge-name">${j.judgeName}</div>
      <div class="judge-score ${j.score === null ? 'pending' : ''}">${j.score === null ? '—' : j.score}</div>
    </div>
  `).join('');

  document.getElementById('avgScore').textContent = data.average !== null ? data.average.toFixed(2) : '—';
}

socket.on('state-updated', refresh);
refresh();
setInterval(refresh, 2000);
