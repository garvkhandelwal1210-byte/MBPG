import React, { useMemo, useState } from 'react'

type Track = {
  id: string
  name: string
  artists: string
  album: string
  albumArt: string
  previewUrl?: string | null
  externalUrl?: string
  uri?: string
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

export function App() {
  const [prompt, setPrompt] = useState('Chill sunny afternoon, lofi beats to relax and focus')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [mood, setMood] = useState<any>(null)

  const canSubmit = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      setTracks(data.tracks || [])
      setMood(data.mood || null)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
      padding: 16,
      maxWidth: 960,
      margin: '0 auto'
    }}>
      <h1 style={{ marginBottom: 8 }}>Moodify</h1>
      <p style={{ marginTop: 0, color: '#555' }}>Type a mood/vibe and get a playlist.</p>

      <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your vibe..."
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #222', background: '#111', color: '#fff' }}
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {mood && (
        <div style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
          <strong>Mood attributes</strong>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(mood, null, 2)}</pre>
        </div>
      )}

      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {tracks.map((t) => (
          <div key={t.id} style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            {t.albumArt && (
              <img src={t.albumArt} alt={t.album} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
            )}
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ color: '#666', fontSize: 14 }}>{t.artists}</div>
              <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{t.album}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {t.previewUrl && (
                  <audio controls src={t.previewUrl} style={{ width: '100%' }} />
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                {t.externalUrl && (
                  <a href={t.externalUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Open in Spotify</a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


