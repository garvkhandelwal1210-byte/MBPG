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

const generateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
});

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = generateSchema.parse(req.body);

    const moodInsights = await interpretMoodPrompt(prompt);

    const tracks = await getRecommendations(moodInsights);

    res.json({ mood: moodInsights, tracks });
  } catch (error) {
    if (error?.issues) {
      return res.status(400).json({ error: 'Invalid request', details: error.issues });
    }
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


