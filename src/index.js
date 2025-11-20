import express from 'express';
import generateRouter from './api/generate.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Basic CORS middleware (initially allow all; tighten later if needed)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // TODO: Restrict to extension origin in production
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // Preflight request
    return res.status(204).send();
  }
  next();
});

// Body parser
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/generate', generateRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'auto-cs-backend', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`[auto-cs-backend] Server running on http://localhost:${PORT}`);
});