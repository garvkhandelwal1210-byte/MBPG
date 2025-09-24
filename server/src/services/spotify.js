import axios from 'axios';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export async function getAccessTokenWithCredentials(clientId, clientSecret) {
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

async function getAppAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  return getAccessTokenWithCredentials(clientId, clientSecret);
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

function normalizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((g) => String(g).trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean)
    .slice(0, 5);
}

async function searchOneTrack(token, query, marketOrder = ['IN', 'US']) {
  for (const market of marketOrder) {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '1', market });
    try {
      const res = await axios.get(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const t = res.data?.tracks?.items?.[0];
      if (t) {
        return [{
          id: t.id,
          name: t.name,
          artists: t.artists?.map((a) => a.name).join(', '),
          album: t.album?.name,
          albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
          previewUrl: t.preview_url,
          externalUrl: t.external_urls?.spotify,
          uri: t.uri,
        }];
      }
    } catch (_e) {
      // try next market
    }
  }
  return [];
}

async function searchTracks(token, query, desired = 10, marketOrder = ['IN', 'US']) {
  const collected = [];
  const seen = new Set();
  for (const market of marketOrder) {
    const remaining = Math.max(0, desired - collected.length);
    if (remaining === 0) break;
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(Math.min(remaining, 10)), market });
    try {
      const res = await axios.get(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items = res.data?.tracks?.items || [];
      for (const t of items) {
        if (!t?.id || seen.has(t.id)) continue;
        seen.add(t.id);
        collected.push({
          id: t.id,
          name: t.name,
          artists: t.artists?.map((a) => a.name).join(', '),
          album: t.album?.name,
          albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
          previewUrl: t.preview_url,
          externalUrl: t.external_urls?.spotify,
          uri: t.uri,
        });
        if (collected.length >= desired) break;
      }
    } catch (_e) {
      // try next market
    }
  }
  return collected.slice(0, desired);
}

export async function getRecommendations(mood) {
  let token;
  try {
    token = await getAppAccessToken();
  } catch (err) {
    const msg = err?.response?.data || err?.message || err;
    throw new Error(`Spotify token error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }

  const { min, max } = tempoToBpmRange(mood.tempo_range);

  // Build seeds: normalize; fallback to popular genres
  const normalized = normalizeGenres(mood.genres || []);
  const seed_genres = (normalized.length > 0)
    ? normalized.join(',')
    : 'pop,edm,indie,hip-hop,rock';

  const paramsIN = new URLSearchParams({
    seed_genres,
    limit: '25',
    market: 'IN',
    target_energy: String(mood.energy),
    target_danceability: String(mood.danceability),
    target_valence: String(mood.valence),
    min_tempo: String(min),
    max_tempo: String(max),
  });

  let rec;
  try {
    rec = await axios.get(`${SPOTIFY_API_BASE}/recommendations?${paramsIN.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (err?.response?.status === 404) {
      rec = { data: { tracks: [] } };
    }
    const msg = err?.response?.data || err?.message || err;
    // if other error, try US market once before failing
    const paramsUS = new URLSearchParams(paramsIN);
    paramsUS.set('market', 'US');
    try {
      rec = await axios.get(`${SPOTIFY_API_BASE}/recommendations?${paramsUS.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (_err2) {
      // As a last resort, return searched tracks (up to 10) instead of throwing
      const tags = Array.isArray(mood.mood_tags) ? mood.mood_tags.join(' ') : '';
      const query = `${tags} ${normalized.join(' ')}`.trim() || 'popular pop';
      const fallback = await searchTracks(token, query, 10, ['IN', 'US']);
      return fallback;
    }
  }

  let tracks = rec.data.tracks?.map((t) => ({
    id: t.id,
    name: t.name,
    artists: t.artists?.map((a) => a.name).join(', '),
    album: t.album?.name,
    albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
    previewUrl: t.preview_url,
    externalUrl: t.external_urls?.spotify,
    uri: t.uri,
  })) || [];

  // Ensure up to 10 tracks
  const desired = 10;
  if (tracks.length < desired) {
    const tags = Array.isArray(mood.mood_tags) ? mood.mood_tags.join(' ') : '';
    const query = `${tags} ${normalized.join(' ')}`.trim() || 'popular pop';
    const topUp = await searchTracks(token, query, desired, ['IN', 'US']);
    const existing = new Set(tracks.map((t) => t.id));
    for (const t of topUp) {
      if (!existing.has(t.id)) tracks.push(t);
      if (tracks.length >= desired) break;
    }
  }

  return tracks.slice(0, desired);
}


export async function getTracksForGenres(genres, { limit = 5, market = 'IN' } = {}) {
  if (!Array.isArray(genres) || genres.length === 0) return {};
  let token;
  try {
    token = await getAppAccessToken();
  } catch (err) {
    const msg = err?.response?.data || err?.message || err;
    throw new Error(`Spotify token error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }

  const results = {};
  for (const genre of genres) {
    const params = new URLSearchParams({
      seed_genres: String(genre),
      limit: String(limit),
      market,
    });
    try {
      const rec = await axios.get(`${SPOTIFY_API_BASE}/recommendations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results[genre] = (rec.data.tracks || []).map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists?.map((a) => a.name).join(', '),
        album: t.album?.name,
        albumArt: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
        previewUrl: t.preview_url,
        externalUrl: t.external_urls?.spotify,
        uri: t.uri,
      }));
    } catch (err) {
      if (err?.response?.status === 404) {
        results[genre] = [];
      } else {
        const msg = err?.response?.data || err?.message || err;
        throw new Error(`Spotify recommendations error (${genre}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      }
    }
  }

  return results;
}


