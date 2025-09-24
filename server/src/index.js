import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { interpretMoodPrompt } from './services/gemini.js';
import { getRecommendations } from './services/spotify.js';

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Simple diagnostics (no secrets leaked): shows presence/length only
app.get('/api/diag', (_req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const spotifyId = process.env.SPOTIFY_CLIENT_ID || '';
  const spotifySecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  res.json({
    env: {
      GEMINI_API_KEY: geminiKey ? `set(len=${geminiKey.length})` : 'missing/empty',
      SPOTIFY_CLIENT_ID: spotifyId ? `set(len=${spotifyId.length})` : 'missing/empty',
      SPOTIFY_CLIENT_SECRET: spotifySecret ? `set(len=${spotifySecret.length})` : 'missing/empty',
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || null,
    }
  });
});

const generateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
});

app.post('/api/generate', async (req, res) => {
  try {
    // Validate required environment variables upfront for clear errors
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'Missing GEMINI_API_KEY in server/.env' });
    }
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in server/.env' });
    }

    const { prompt } = generateSchema.parse(req.body);

    const moodInsights = await interpretMoodPrompt(prompt);

    const tracks = await getRecommendations(moodInsights);

    res.json({ mood: moodInsights, tracks });
  } catch (error) {
    if (error?.issues) {
      return res.status(400).json({ error: 'Invalid request', details: error.issues });
    }
    console.error('Error in /api/generate:', error);
    const message = typeof error?.message === 'string' ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  const mask = (v) => (v ? `set(len=${v.length})` : 'missing/empty');
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Env check:', {
    GEMINI_API_KEY: mask(process.env.GEMINI_API_KEY),
    SPOTIFY_CLIENT_ID: mask(process.env.SPOTIFY_CLIENT_ID),
    SPOTIFY_CLIENT_SECRET: mask(process.env.SPOTIFY_CLIENT_SECRET),
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || null,
  });
});
