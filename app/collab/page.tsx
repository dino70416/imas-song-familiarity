'use client';

import React, { useState } from 'react';

interface CollabSong {
  id: string;
  slug: string;
  title: string;
  brand: string;
  musicType: string;
  lyrics: string | null;
  composer: string | null;
  arranger: string | null;
  members: Array<{ name: string; cvName: string | null }>;
  ratings: Record<string, number>;
}

export default function CollaborationPlaylistPage() {
  const [shareCodesInput, setShareCodesInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    users: string[];
    songs: CollabSong[];
  } | null>(null);

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    // 依逗號、分行隔開，並去重
    const shareCodes = shareCodesInput
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (shareCodes.length < 2) {
      setError('請輸入至少兩個使用者的分享識別碼。');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareCodes }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '比對失敗。');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('與伺服器連線異常，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  const familiarityLabels: Record<number, string> = {
    1: '會唱',
    2: '常聽',
    3: '聽過',
    4: '模糊',
  };

  const familiarityStates: Record<number, string> = {
    1: 'state-1',
    2: 'state-2',
    3: 'state-3',
    4: 'state-4',
  };

  return (
    <>
      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <a href="/" className="btn btn-secondary">
            返回首頁
          </a>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '32px', marginBottom: '80px' }}>
        <div style={{ marginBottom: '32px', maxWidth: '600px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            共同歌單交集加總
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
            輸入多個使用者的<b>分享識別碼 (已雜湊保護)</b>，系統將找出所有人都「會唱、常聽、聽過或不太記得」的交集歌曲，方便在線下 Live KTV 或聚會中作為選歌參考！
          </p>

          <form onSubmit={handleCompare} className="card-el" style={{ padding: '20px' }}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                使用者分享識別碼 (以半形或全形逗號或分行隔開)
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="例如: a1b2c3d4e5f6, 9f8e7d6c5b4a"
                value={shareCodesInput}
                onChange={(e) => setShareCodesInput(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: '14px' }}
                required
              />
            </div>
            {error && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? '正在計算共同交集...' : '比對共同歌單'}
            </button>
          </form>
        </div>

        {result && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              比對結果: {result.users.map((u) => `${u}`).join(' ∩ ')}
              <span style={{ marginLeft: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>
                共計 {result.songs.length} 首共同歌曲
              </span>
            </h3>

            <section className="songs-grid">
              {result.songs.length === 0 ? (
                <div className="card-el" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  找不到所有使用者均熟悉的共同歌曲。試著減少比對的使用者數量！
                </div>
              ) : (
                result.songs.map((song) => {
                  const brandClean = song.brand.replace('music_', '').toUpperCase();

                  return (
                    <div key={song.id} className="song-card" style={{ gap: '20px' }}>
                      <div className="song-info">
                        <div className="song-title-row">
                          <span className="song-title">{song.title}</span>
                          <span className="song-badge badge-brand">{brandClean}</span>
                          {song.musicType.includes('solo') && (
                            <span className="song-badge badge-type">SOLO</span>
                          )}
                          {song.musicType.includes('unit') && (
                            <span className="song-badge badge-type">UNIT</span>
                          )}
                        </div>
                        <div className="song-meta">
                          {song.lyrics && <span>作詞: {song.lyrics} </span>}
                          {song.composer && <span>/ 作曲: {song.composer} </span>}
                          {song.arranger && <span>/ 編曲: {song.arranger}</span>}
                        </div>
                        {song.members.length > 0 && (
                          <div className="song-members">
                            演唱成員: {song.members.map((m) => `${m.name}${m.cvName ? ` (${m.cvName})` : ''}`).join(', ')}
                          </div>
                        )}
                      </div>

                      {/* 顯示各使用者的熟悉度對照 */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {result.users.map((user) => {
                          const rating = song.ratings[user];
                          return (
                            <div key={user} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user}</span>
                              <span className={`familiarity-btn ${familiarityStates[rating]} active`} style={{ padding: '4px 10px', fontSize: '11px', cursor: 'default' }}>
                                {familiarityLabels[rating]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
