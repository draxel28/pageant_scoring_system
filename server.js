const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { event: { displayMode: 'combined' }, judges: [], contestants: [], segments: [], scores: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function broadcast() {
  io.emit('state-updated', publicState());
}

// Strip judge PINs before sending to display/admin broadcasts
function publicState() {
  const data = loadData();
  const segmentsWithResults = data.segments.map(seg => ({
    ...seg,
    results: computeSegmentResults(data, seg.id)
  }));
  return {
    event: data.event,
    judges: data.judges.map(j => ({ id: j.id, name: j.name })),
    contestants: data.contestants,
    segments: segmentsWithResults,
    scores: data.scores
  };
}

// ---------- Scoring math ----------
function computeSegmentResults(data, segmentId) {
  const segment = data.segments.find(s => s.id === segmentId);
  if (!segment) return null;
  const segScores = data.scores[segmentId] || {};
  const judgeIds = data.judges.map(j => j.id);

  const rows = data.contestants.map(c => {
    const perJudgeTotals = [];
    judgeIds.forEach(jid => {
      const judgeScores = segScores[jid] && segScores[jid][c.id];
      if (judgeScores) {
        let sum = 0;
        segment.criteria.forEach(cr => {
          sum += Number(judgeScores[cr.id]) || 0;
        });
        perJudgeTotals.push(sum);
      }
    });
    const submittedCount = perJudgeTotals.length;
    const average = submittedCount > 0
      ? perJudgeTotals.reduce((a, b) => a + b, 0) / submittedCount
      : null;
    return {
      contestantId: c.id,
      number: c.number,
      name: c.name,
      average,
      submittedCount,
      totalJudges: judgeIds.length
    };
  });

  rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  rows.forEach((r, i) => { r.rank = r.average !== null ? i + 1 : null; });
  return rows;
}

function computeOverallResults(data) {
  const totals = {};
  data.contestants.forEach(c => { totals[c.id] = { contestantId: c.id, number: c.number, name: c.name, total: 0, segments: 0 }; });
  data.segments.forEach(seg => {
    const rows = computeSegmentResults(data, seg.id);
    rows.forEach(r => {
      if (r.average !== null) {
        totals[r.contestantId].total += r.average;
        totals[r.contestantId].segments += 1;
      }
    });
  });
  const rows = Object.values(totals);
  rows.sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// ---------- Admin: contestants ----------
app.get('/api/state', (req, res) => res.json(loadData()));

app.post('/api/admin/contestants', (req, res) => {
  const data = loadData();
  const { number, name } = req.body;
  const c = { id: newId('c'), number: number || '', name: name || '' };
  data.contestants.push(c);
  saveData(data); 
  broadcast();
  res.json(c);
});

app.put('/api/admin/contestants/:id', (req, res) => {
  const data = loadData();
  const { number, name } = req.body;
  const c = data.contestants.find(item => item.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Contestant not found' });
  
  if (number !== undefined) c.number = number;
  if (name !== undefined) c.name = name;
  
  saveData(data); 
  broadcast();
  res.json(c);
});

app.delete('/api/admin/contestants/:id', (req, res) => {
  const data = loadData();
  data.contestants = data.contestants.filter(c => c.id !== req.params.id);
  saveData(data); 
  broadcast();
  res.json({ ok: true });
});

// ---------- Admin: judges ----------
app.post('/api/admin/judges', (req, res) => {
  const data = loadData();
  const { name } = req.body;
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  const j = { id: newId('j'), name, pin };
  data.judges.push(j);
  saveData(data); 
  broadcast();
  res.json(j);
});
app.delete('/api/admin/judges/:id', (req, res) => {
  const data = loadData();
  data.judges = data.judges.filter(j => j.id !== req.params.id);
  saveData(data); 
  broadcast();
  res.json({ ok: true });
});

// ---------- Admin: display mode setting ----------
app.post('/api/admin/display-mode', (req, res) => {
  const data = loadData();
  if (!data.event) data.event = {};
  data.event.displayMode = req.body.mode || 'combined';
  saveData(data);
  broadcast();
  res.json({ ok: true });
});

// ---------- Admin: segments & criteria ----------
app.post('/api/admin/segments', (req, res) => {
  const data = loadData();
  const { name, criteria } = req.body;
  const seg = {
    id: newId('seg'),
    name,
    criteria: (criteria || []).map(cr => ({ id: newId('cr'), name: cr.name, maxScore: Number(cr.maxScore) })),
    revealed: false
  };
  data.segments.push(seg);
  data.scores[seg.id] = {};
  saveData(data); 
  broadcast();
  res.json(seg);
});
app.delete('/api/admin/segments/:id', (req, res) => {
  const data = loadData();
  data.segments = data.segments.filter(s => s.id !== req.params.id);
  delete data.scores[req.params.id];
  if (data.event.activeSegmentId === req.params.id) data.event.activeSegmentId = null;
  saveData(data); 
  broadcast();
  res.json({ ok: true });
});
app.post('/api/admin/segments/:id/activate', (req, res) => {
  const data = loadData();
  data.event.activeSegmentId = req.params.id;
  saveData(data); 
  broadcast();
  res.json({ ok: true });
});
app.post('/api/admin/segments/:id/reveal', (req, res) => {
  const data = loadData();
  const seg = data.segments.find(s => s.id === req.params.id);
  if (seg) seg.revealed = !!req.body.revealed;
  saveData(data); 
  broadcast();
  res.json({ ok: true });
});

// ---------- Judge auth ----------
app.post('/api/judge/login', (req, res) => {
  const data = loadData();
  const { pin } = req.body;
  const judge = data.judges.find(j => j.pin === String(pin));
  if (!judge) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ id: judge.id, name: judge.name });
});

// ---------- Judge scoring ----------
app.post('/api/judge/score', (req, res) => {
  const data = loadData();
  const { judgeId, segmentId, contestantId, scores } = req.body;
  const judge = data.judges.find(j => j.id === judgeId);
  const segment = data.segments.find(s => s.id === segmentId);
  if (!judge || !segment) return res.status(400).json({ error: 'Invalid judge or segment' });

  for (const cr of segment.criteria) {
    const val = Number(scores[cr.id]);
    if (isNaN(val) || val < 0 || val > cr.maxScore) {
      return res.status(400).json({ error: `Score for "${cr.name}" must be between 0 and ${cr.maxScore}` });
    }
  }

  if (!data.scores[segmentId]) data.scores[segmentId] = {};
  if (!data.scores[segmentId][judgeId]) data.scores[segmentId][judgeId] = {};
  data.scores[segmentId][judgeId][contestantId] = scores;

  saveData(data); 
  broadcast();
  res.json({ ok: true });
});

// ---------- Results ----------
app.get('/api/results/:segmentId', (req, res) => {
  const data = loadData();
  const rows = computeSegmentResults(data, req.params.segmentId);
  if (!rows) return res.status(404).json({ error: 'Segment not found' });
  res.json(rows);
});
app.get('/api/results-overall', (req, res) => {
  const data = loadData();
  res.json(computeOverallResults(data));
});

// ---------- CSV export ----------
app.get('/api/export/csv', (req, res) => {
  const data = loadData();
  let csv = 'Segment,Contestant Number,Contestant Name,Judge,Criteria,Score\n';
  data.segments.forEach(seg => {
    const segScores = data.scores[seg.id] || {};
    Object.entries(segScores).forEach(([judgeId, byContestant]) => {
      const judge = data.judges.find(j => j.id === judgeId);
      Object.entries(byContestant).forEach(([contestantId, byCriteria]) => {
        const contestant = data.contestants.find(c => c.id === contestantId);
        seg.criteria.forEach(cr => {
          const val = byCriteria[cr.id];
          if (val !== undefined) {
            csv += `"${seg.name}","${contestant ? contestant.number : ''}","${contestant ? contestant.name : ''}","${judge ? judge.name : ''}","${cr.name}",${val}\n`;
          }
        });
      });
    });
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="scores_export.csv"');
  res.send(csv);
});

io.on('connection', (socket) => {
  socket.emit('state-updated', publicState());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  console.log('\n=== Pageant Scoring System running ===');
  console.log(`On this computer:   http://localhost:${PORT}/admin.html`);
  Object.values(nets).flat().forEach(n => {
    if (n.family === 'IPv4' && !n.internal) {
      console.log(`On the network:     http://${n.address}:${PORT}/admin.html`);
      console.log(`   Judges go to:    http://${n.address}:${PORT}/judge.html`);
      console.log(`   Display goes to: http://${n.address}:${PORT}/display.html`);
    }
  });
  console.log('=======================================\n');
});