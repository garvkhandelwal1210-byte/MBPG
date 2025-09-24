import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `
You convert a user's natural-language mood/vibe prompt into a structured JSON with music attributes.
Return ONLY JSON with keys: mood_tags (string[]), energy (0-1), danceability (0-1), valence (0-1), tempo_range (string, one of: slow, medium, fast), genres (string[]).
`;

export async function interpretMoodPrompt(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const input = `${SYSTEM_PROMPT}\nPrompt: ${prompt}`;

  const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError;
  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent(input);
      const text = response?.response?.text?.() || '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Fallback: try to extract JSON block
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error(`Gemini output not JSON: ${text.slice(0, 200)}...`);
        parsed = JSON.parse(match[0]);
      }
      return normalizeAttributes(parsed);
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, 400 + i * 400));
    }
  }
  const msg = lastError?.response?.data || lastError?.message || lastError;
  throw new Error(`Gemini request error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
}

function normalizeAttributes(raw) {
  const clamp = (n) => Math.max(0, Math.min(1, Number(n)));
  return {
    mood_tags: Array.isArray(raw?.mood_tags) ? raw.mood_tags.slice(0, 10) : [],
    energy: clamp(raw?.energy ?? 0.6),
    danceability: clamp(raw?.danceability ?? 0.6),
    valence: clamp(raw?.valence ?? 0.6),
    tempo_range: ['slow', 'medium', 'fast'].includes(raw?.tempo_range) ? raw.tempo_range : 'medium',
    genres: Array.isArray(raw?.genres) ? raw.genres.slice(0, 5) : [],
  };
}


