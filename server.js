const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global navigation index tracker for the display
let globalContestantIndex = 0;

// ---------- Multer Configuration for Uploads (Supports Images & Videos) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let prefix = 'contestant';
    if (file.fieldname === 'background') prefix = 'background';
    if (file.fieldname === 'segmentPhoto') prefix = 'segment-media';
    cb(null, prefix + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to allow both images and common video formats
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and standard video files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // Set limit to 100MB to accommodate video uploads safely
});

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { event: { displayMode: 'combined', activeContestantIndex: 0 }, judges: [], contestants: [], segments: [], backgrounds: [], segmentPhotos: [], scores: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!data.backgrounds) data.backgrounds = [];
  if (!data.segmentPhotos) data.segmentPhotos = [];
  if (!data.event) data.event = {};
  if (typeof data.event.activeContestantIndex !== 'number') {
    data.event.activeContestantIndex = globalContestantIndex;
  } else {
    globalContestantIndex = data.event.activeContestantIndex;
  }
  return data;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Build the state object sent to clients.
// includePins=true is used ONLY for the admin room, so judge/display
// clients never receive PIN values over the socket.
function publicState(includePins = false) {
  const data = loadData();
  const segmentsWithResults = data.segments.map(seg => ({
    ...seg,
    results: computeSegmentResults(data, seg.id)
  }));
  return {
    event: { ...data.event, activeContestantIndex: globalContestantIndex },
    judges: data.judges.map(j =>
      includePins ? { id: j.id, name: j.name, pin: j.pin } : { id: j.id, name: j.name }
    ),
    contestants: data.contestants,
    segments: segmentsWithResults,
    backgrounds: data.backgrounds || [],
    segmentPhotos: data.segmentPhotos || [],
    segmentDisplayBackgrounds: data.segmentDisplayBackgrounds || [], // <-- Added this line!
    scores: data.scores
  };
}
function broadcast() {
  const state = publicState();
  state.contestantIndex = globalContestantIndex;
  if (state.event) state.event.activeContestantIndex = globalContestantIndex;
  io.to('public').emit('state-updated', state);

  const adminState = publicState(true);
  adminState.contestantIndex = globalContestantIndex;
  if (adminState.event) adminState.event.activeContestantIndex = globalContestantIndex;
  io.to('admin').emit('state-updated', adminState);
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
      barangay: c.barangay || '',
      photo: c.photo || null,
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
  data.contestants.forEach(c => { totals[c.id] = { contestantId: c.id, number: c.number, name: c.name, barangay: c.barangay || '', photo: c.photo || null, total: 0, segments: 0 }; });
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
app.get('/api/state', (req, res) => {
  const state = publicState();
  state.contestantIndex = globalContestantIndex;
  res.json(state);
});

app.post('/api/admin/contestants', upload.single('photo'), (req, res) => {
  const data = loadData();
  const { number, name, barangay } = req.body;
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const c = { id: newId('c'), number: number || '', name: name || '', barangay: barangay || '', photo: photoUrl };
  data.contestants.push(c);
  saveData(data);
  broadcast();
  res.json(c);
});

app.put('/api/admin/contestants/:id', upload.single('photo'), (req, res) => {
  const data = loadData();
  const { number, name, barangay } = req.body;
  const c = data.contestants.find(item => item.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Contestant not found' });

  if (number !== undefined) c.number = number;
  if (name !== undefined) c.name = name;
  if (barangay !== undefined) c.barangay = barangay;
  if (req.file) {
    if (c.photo && fs.existsSync(path.join(__dirname, 'public', c.photo))) {
      try { fs.unlinkSync(path.join(__dirname, 'public', c.photo)); } catch(e) {}
    }
    c.photo = `/uploads/${req.file.filename}`;
  }

  saveData(data);
  broadcast();
  res.json(c);
});

app.delete('/api/admin/contestants/:id', (req, res) => {
  const data = loadData();
  const c = data.contestants.find(item => item.id === req.params.id);
  if (c && c.photo && fs.existsSync(path.join(__dirname, 'public', c.photo))) {
    try { fs.unlinkSync(path.join(__dirname, 'public', c.photo)); } catch(e) {}
  }
  data.contestants = data.contestants.filter(item => item.id !== req.params.id);

  if (data.segmentPhotos) {
    data.segmentPhotos.forEach(p => {
      if (p.contestantId === req.params.id && p.url && fs.existsSync(path.join(__dirname, 'public', p.url))) {
        try { fs.unlinkSync(path.join(__dirname, 'public', p.url)); } catch(e) {}
      }
    });
    data.segmentPhotos = data.segmentPhotos.filter(p => p.contestantId !== req.params.id);
  }
  saveData(data);
  broadcast();
  res.json({ ok: true });
});

// ---------- Admin: Segment-Specific Media (Photos & Videos) ----------
app.post('/api/admin/segment-photos', upload.single('segmentPhoto'), (req, res) => {
  const data = loadData();
  const { segmentId, contestantId } = req.body;
  if (!req.file || !segmentId || !contestantId) {
    return res.status(400).json({ error: 'Missing file, segmentId, or contestantId' });
  }

  if (!data.segmentPhotos) data.segmentPhotos = [];

  const existingIndex = data.segmentPhotos.findIndex(
    p => p.segmentId === segmentId && p.contestantId === contestantId
  );

  if (existingIndex !== -1) {
    const oldPhoto = data.segmentPhotos[existingIndex];
    if (oldPhoto.url && fs.existsSync(path.join(__dirname, 'public', oldPhoto.url))) {
      try { fs.unlinkSync(path.join(__dirname, 'public', oldPhoto.url)); } catch (e) {}
    }
    data.segmentPhotos.splice(existingIndex, 1);
  }

  const newSegmentPhoto = {
    id: newId('sp'),
    segmentId,
    contestantId,
    url: `/uploads/${req.file.filename}`
  };

  data.segmentPhotos.push(newSegmentPhoto);
  saveData(data);
  broadcast();
  res.json(newSegmentPhoto);
});

app.delete('/api/admin/segment-photos/:id', (req, res) => {
  const data = loadData();
  if (!data.segmentPhotos) data.segmentPhotos = [];

  const photoIndex = data.segmentPhotos.findIndex(p => p.id === req.params.id);
  if (photoIndex !== -1) {
    const photo = data.segmentPhotos[photoIndex];
    const filePath = path.join(__dirname, 'public', photo.url);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    data.segmentPhotos.splice(photoIndex, 1);
    saveData(data);
    broadcast();
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Segment media not found' });
});

// ---------- Admin: Background Uploads (Images & Videos) ----------
app.post('/api/admin/backgrounds', upload.single('background'), (req, res) => {
  const data = loadData();
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const newBg = {
    id: newId('bg'),
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname
  };

  if (!data.backgrounds) data.backgrounds = [];
  data.backgrounds.push(newBg);
  saveData(data);
  broadcast();
  res.json(newBg);
});

app.delete('/api/admin/backgrounds/:id', (req, res) => {
  const data = loadData();
  if (!data.backgrounds) data.backgrounds = [];

  const bgIndex = data.backgrounds.findIndex(b => b.id === req.params.id);
  if (bgIndex !== -1) {
    const bg = data.backgrounds[bgIndex];
    const filePath = path.join(__dirname, 'public', bg.url);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    data.backgrounds.splice(bgIndex, 1);
    saveData(data);
    broadcast();
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Background not found' });
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

// ---------- Admin: active contestant index route ----------
app.post('/api/admin/active-contestant', (req, res) => {
  const { index } = req.body;
  if (typeof index === 'number') {
    globalContestantIndex = index;
    const data = loadData();
    if (!data.event) data.event = {};
    data.event.activeContestantIndex = index;
    saveData(data);
    io.emit('contestant-index-updated', index);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'Invalid index' });
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

  if (data.segmentPhotos) {
    data.segmentPhotos.forEach(p => {
      if (p.segmentId === req.params.id && p.url && fs.existsSync(path.join(__dirname, 'public', p.url))) {
        try { fs.unlinkSync(path.join(__dirname, 'public', p.url)); } catch(e) {}
      }
    });
    data.segmentPhotos = data.segmentPhotos.filter(p => p.segmentId !== req.params.id);
  }
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

// Per-judge score breakdown for whoever is currently on stage (for the OBS overlay).
// Follows the same "current contestant" your next/prev navigation already tracks
// via globalContestantIndex, so no separate spotlight control is needed.
app.get('/api/spotlight', (req, res) => {
  const data = loadData();
  const contestant = data.contestants[globalContestantIndex];
  const segment = data.segments.find(s => s.id === data.event.activeSegmentId);
  if (!contestant || !segment) return res.json(null);

  const segScores = data.scores[segment.id] || {};
  const perJudge = data.judges.map(j => {
    const judgeScores = segScores[j.id] && segScores[j.id][contestant.id];
    let total = null;
    if (judgeScores) {
      total = 0;
      segment.criteria.forEach(cr => { total += Number(judgeScores[cr.id]) || 0; });
    }
    return { judgeId: j.id, judgeName: j.name, score: total };
  });

  const submitted = perJudge.filter(j => j.score !== null);
  const average = submitted.length > 0
    ? submitted.reduce((a, j) => a + j.score, 0) / submitted.length
    : null;

  res.json({
    contestant: { id: contestant.id, number: contestant.number, name: contestant.name, hometown: contestant.barangay, photo: contestant.photo },
    segment: { id: segment.id, name: segment.name },
    perJudge,
    average
  });
});

// ---------- CSV export ----------
app.get('/api/export/csv', (req, res) => {
  const data = loadData();
  let csv = 'Segment,Contestant Number,Contestant Name,Barangay,Judge,Criteria,Score\n';
  data.segments.forEach(seg => {
    const segScores = data.scores[seg.id] || {};
    Object.entries(segScores).forEach(([judgeId, byContestant]) => {
      const judge = data.judges.find(j => j.id === judgeId);
      Object.entries(byContestant).forEach(([contestantId, byCriteria]) => {
        const contestant = data.contestants.find(c => c.id === contestantId);
        seg.criteria.forEach(cr => {
          const val = byCriteria[cr.id];
          if (val !== undefined) {
            csv += `"${seg.name}","${contestant ? contestant.number : ''}","${contestant ? contestant.name : ''}","${contestant ? contestant.barangay : ''}","${judge ? judge.name : ''}","${cr.name}",${val}\n`;
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
  // The admin page connects with io({ query: { role: 'admin' } }).
  // Judge/display pages connect with plain io() and land in 'public',
  // so they never receive judge PIN values.
  const isAdmin = socket.handshake.query.role === 'admin';
  socket.join(isAdmin ? 'admin' : 'public');

  const initialState = publicState(isAdmin);
  initialState.contestantIndex = globalContestantIndex;
  socket.emit('state-updated', initialState);

  socket.on('update-contestant-index', (index) => {
    if (typeof index === 'number') {
      globalContestantIndex = index;
      const data = loadData();
      if (!data.event) data.event = {};
      data.event.activeContestantIndex = index;
      saveData(data);
      io.emit('contestant-index-updated', index);
    }
  });

  socket.on('next-contestant', () => {
    const data = loadData();
    if (data.contestants && data.contestants.length > 0) {
      globalContestantIndex = (globalContestantIndex + 1) % data.contestants.length;
      if (!data.event) data.event = {};
      data.event.activeContestantIndex = globalContestantIndex;
      saveData(data);
      io.emit('contestant-index-updated', globalContestantIndex);
    }
    broadcast();
  });

  socket.on('prev-contestant', () => {
    const data = loadData();
    if (data.contestants && data.contestants.length > 0) {
      globalContestantIndex = (globalContestantIndex - 1 + data.contestants.length) % data.contestants.length;
      if (!data.event) data.event = {};
      data.event.activeContestantIndex = globalContestantIndex;
      saveData(data);
      io.emit('contestant-index-updated', globalContestantIndex);
    }
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  console.log('\n=== Pageant Scoring System running ===');
  console.log(`On this computer:    http://localhost:${PORT}/admin.html`);
  Object.values(nets).flat().forEach(n => {
    if (n.family === 'IPv4' && !n.internal) {
      console.log(`On the network:    http://${n.address}:${PORT}/admin.html`);
      console.log(`   Judges go to:    http://${n.address}:${PORT}/judge.html`);
      console.log(`   Display goes to: http://${n.address}:${PORT}/display.html`);
      console.log(`   OBS overlay:     http://${n.address}:${PORT}/overlay.html`);
      console.log(`   Segment Display: http://${n.address}:${PORT}/segment-display.html`);
      console.log(`   Sponsors Display:http://${n.address}:${PORT}/sponsors-display.html`);
    }
  });
  console.log('=======================================\n');
});


// ---------- Admin: Segment Display Background Upload ----------
app.post('/api/admin/segment-display-backgrounds', upload.single('segmentDisplayBg'), (req, res) => {
  const data = loadData();
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const newBg = {
    id: newId('sdbg'),
    url: `/uploads/${req.file.filename}`, // Saved in public/uploads folder
    originalName: req.file.originalname
  };

  if (!data.segmentDisplayBackgrounds) data.segmentDisplayBackgrounds = [];
  data.segmentDisplayBackgrounds.push(newBg);
  saveData(data);
  broadcast();
  res.json(newBg);
});

// ---------- Admin: Overlay Segment & Background Selection ----------
app.post('/api/admin/overlay-segment', (req, res) => {
  try {
    const data = loadData();
    const { segmentId, backgroundId } = req.body;
    
    if (!data.event) {
      data.event = { displayMode: 'combined', activeContestantIndex: 0 };
    }
    
    data.event.selectedSegmentOverlayId = segmentId || null;
    if (backgroundId !== undefined) {
      data.event.segmentDisplayBgId = backgroundId || null;
    }
    
    saveData(data);
    broadcast();
    
    res.json({ 
      success: true, 
      selectedSegmentOverlayId: data.event.selectedSegmentOverlayId,
      segmentDisplayBgId: data.event.segmentDisplayBgId 
    });
  } catch (err) {
    console.error('Error in overlay-segment route:', err);
    res.status(500).json({ error: 'Failed to update display: ' + err.message });
  }
});