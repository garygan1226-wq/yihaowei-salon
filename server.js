const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load topic definitions
function loadTopics() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'topics.json'), 'utf-8'));
}

// State file path
const STATE_FILE = path.join(__dirname, 'state.json');

// Load or initialize state
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

// Save state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Initialize state for all topics
function ensureState() {
  const topics = loadTopics();
  const state = loadState();
  let changed = false;
  for (const t of topics) {
    if (!state[t.id]) {
      state[t.id] = {
        confirmed: false,
        notes: '',
        updatedAt: Date.now(),
        updatedBy: ''
      };
      changed = true;
    }
  }
  if (changed) saveState(state);
  return state;
}

// GET /api/topics - return all topics with state
app.get('/api/topics', (req, res) => {
  const topics = loadTopics();
  const state = ensureState();
  const result = topics.map(t => ({
    ...t,
    confirmed: state[t.id]?.confirmed ?? false,
    notes: state[t.id]?.notes ?? '',
    updatedAt: state[t.id]?.updatedAt ?? 0
  }));
  res.json({ topics: result, serverTime: Date.now() });
});

// POST /api/topics/:id - update topic state
app.post('/api/topics/:id', (req, res) => {
  const { id } = req.params;
  const { confirmed, notes } = req.body;
  const topics = loadTopics();
  const topic = topics.find(t => t.id === id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const state = loadState();
  if (!state[id]) state[id] = { confirmed: false, notes: '', updatedAt: 0, updatedBy: '' };

  if (confirmed !== undefined) state[id].confirmed = confirmed;
  if (notes !== undefined) state[id].notes = notes;
  state[id].updatedAt = Date.now();
  state[id].updatedBy = req.ip;

  saveState(state);
  res.json({ success: true, topic: { ...topic, ...state[id] } });
});

// GET /api/state - return only state (lightweight polling)
app.get('/api/state', (req, res) => {
  const state = ensureState();
  res.json({ state, serverTime: Date.now() });
});

// POST /api/topics - add a new topic (for automation)
app.post('/api/topics', (req, res) => {
  const { category, tag, title, desc, questions, source, date } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'Missing required fields' });

  const topics = loadTopics();
  const maxId = topics.reduce((max, t) => {
    const num = parseInt(t.id);
    return num > max ? num : max;
  }, 0);
  const newId = String(maxId + 1).padStart(3, '0');

  const newTopic = {
    id: newId,
    category,
    tag: tag || 'AI热点',
    title,
    desc: desc || '',
    questions: questions || [],
    source: source || 'auto',
    date: date || new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '/')
  };

  topics.push(newTopic);
  fs.writeFileSync(path.join(__dirname, 'topics.json'), JSON.stringify(topics, null, 2));

  // Initialize state for new topic
  const state = loadState();
  state[newId] = { confirmed: false, notes: '', updatedAt: Date.now(), updatedBy: 'automation' };
  saveState(state);

  res.json({ success: true, topic: newTopic });
});

// Catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`一号位沙龙 server running at http://localhost:${PORT}`);
});
