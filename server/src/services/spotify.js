import axios from 'axios';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

async function getAppAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Spotify credentials');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(SPOTIFY_TOKEN_URL, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
  });
  return response.data.access_token;
}

function tempoToBpmRange(tempoRange) {
  switch (tempoRange) {
    case 'slow':
      return { min: 60, max: 90 };
    case 'fast':
      return { min: 130, max: 180 };
    default:
      return { min: 90, max: 130 };
  }
}

export async function getRecommendations(mood) {
  const token = await getAppAccessToken();

  const { min, max } = tempoToBpmRange(mood.tempo_range);

  // Build seeds: prefer genres from Gemini; fallback to popular genres
  const seed_genres = (mood.genres && mood.genres.length > 0)
    ? mood.genres.slice(0, 5).join(',')
    : 'pop,indie,rock,edm,hip-hop';

  const params = new URLSearchParams({
    seed_genres,
    limit: '25',
    target_energy: String(mood.energy),
    target_danceability: String(mood.danceability),
    target_valence: String(mood.valence),
    min_tempo: String(min),
    max_tempo: String(max),
  });

  const rec = await axios.get(`${SPOTIFY_API_BASE}/recommendations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const tracks = rec.data.tracks?.map((t) => ({
    id: t.id,
    name: t.name,
    artists: t.artists?.map((a) => a.name).join(', '),
    album: t.album?.name,
    albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
    previewUrl: t.preview_url,
    externalUrl: t.external_urls?.spotify,
    uri: t.uri,
  })) || [];

  return tracks;
}


