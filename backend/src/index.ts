import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import {
  ensureDefaultCooperative,
  ensureDefaultExchangeRate,
  ensureDemoAccounts,
} from './bootstrap.js';
import apiRoutes from './routes/api.js';
import notesRoutes from './routes/notes.js';
import assistantRoutes from './routes/assistant.js';
import settingsRoutes from './routes/settings.js';
import timelineRoutes from './routes/timeline.js';
import loansRoutes from './routes/loans.js';
import { ensureMemberTimelineView } from './services/timeline.js';
import { ensureLoanOutcomeColumns, ensureRiskScanLogTable } from './services/schemaPatches.js';
import riskScanRoutes from './routes/riskScan.js';
import transcribeRoutes from './routes/transcribe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 5000;

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

const frontendOrigin = normalizeOrigin(process.env.FRONTEND_URL || 'http://localhost:5173');

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (health checks, curl) with no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (normalizeOrigin(origin) === frontendOrigin) {
        callback(null, frontendOrigin);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  const cohereKey = process.env.COHERE_API_KEY?.trim();
  res.json({
    status: 'ok',
    service: 'kumbuka-backend',
    cohere: cohereKey
      ? { configured: true, keyPrefix: `${cohereKey.slice(0, 7)}...`, keyLength: cohereKey.length }
      : { configured: false },
  });
});

app.use('/api', apiRoutes);
app.use('/api', notesRoutes);
app.use('/api', assistantRoutes);
app.use('/api', settingsRoutes);
app.use('/api', timelineRoutes);
app.use('/api', loansRoutes);
app.use('/api', riskScanRoutes);
app.use('/api', transcribeRoutes);

function logCohereKeyStatus(): void {
  const key = process.env.COHERE_API_KEY?.trim();
  if (!key) {
    console.warn('[startup] COHERE_API_KEY is not set — Memory Assistant embeddings will fail');
    return;
  }
  console.log(
    `[startup] COHERE_API_KEY configured (${key.length} chars, starts with ${key.slice(0, 4)}...)`
  );
}

async function start() {
  await connectDB();
  await ensureLoanOutcomeColumns();
  await ensureRiskScanLogTable();
  await ensureMemberTimelineView();
  await ensureDefaultCooperative();
  await ensureDefaultExchangeRate();
  await ensureDemoAccounts();
  logCohereKeyStatus();
  app.listen(PORT, () => {
    console.log(`Kumbuka backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
