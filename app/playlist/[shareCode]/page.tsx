import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { buildThemeVars, getBrandColor, getBrandDisplayName, getAccentTextColor } from '@/lib/themeUtils';
import MemberToggle from '@/components/MemberToggle';

interface PageProps {
  params: Promise<{ shareCode: string }>;
}

export default async function PublicPlaylistPage({ params }: PageProps) {
  const { shareCode } = await params;
  
  // 查詢使用者（以 Hashed 分享碼進行查詢，隱藏帳號名稱）
  const dbUser = await prisma.user.findUnique({
    where: { shareCode },
  });

  if (!dbUser) {
    return notFound();
  }

  // 查詢該使用者的所有非 0 熟悉度選擇，並加載歌曲資訊
  const selections = await prisma.userSelection.findMany({
    where: {
      userId: dbUser.id,
      familiarity: { in: [1, 2, 3, 4] },
    },
    include: {
      song: {
        include: {
          members: {
            include: {
              member: true,
            },
          },
        },
      },
    },
    orderBy: {
      familiarity: 'asc',
    },
  });

  const familiarityLabels: Record<number, string> = {
    1: '會唱',
    2: '常聽/只聽',
    3: '有聽過',
    4: '不太記得',
  };

  const familiarityStates: Record<number, string> = {
    1: 'state-1',
    2: 'state-2',
    3: 'state-3',
    4: 'state-4',
  };

  // 動態設定主題色（含所有衍生色）
  const themeColor = dbUser.themeColor || '#92cfbb';

  return (
    <div style={{
      ...(buildThemeVars(themeColor) as any),
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh'
    }}>
      <header>
        <div className="container header-content">
          <h1>IMAS Song Familiarity Hub</h1>
          <a href="/" className="btn btn-secondary">
            返回首頁
          </a>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600' }}>
            {dbUser.nickname} 的公開歌單
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
            共評估了 {selections.length} 首熟悉歌曲。
          </p>
        </div>

        <section className="songs-grid">
          {selections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              該使用者目前沒有標記任何熟悉的歌曲。
            </div>
          ) : (
            selections.map((sel) => {
              const song = sel.song;
              const brandClean = song.brand.replace('music_', '').toUpperCase();

              return (
                <div key={song.id} className="song-card">
                  <div className="song-info">
                    <div className="song-title-row">
                      <span className="song-title">{song.title}</span>
                      <span 
                        className="song-badge badge-brand"
                        style={{ 
                          backgroundColor: getBrandColor(song.brand),
                          color: getAccentTextColor(getBrandColor(song.brand))
                        }}
                      >
                        {getBrandDisplayName(song.brand)}
                      </span>
                      {song.musicType.includes('solo') && (
                        <span className="song-badge badge-type">SOLO</span>
                      )}
                      {song.musicType.includes('unit') && (
                        <span className="song-badge badge-type">UNIT</span>
                      )}
                      {(song.lowestPitch || song.highestPitch) && (
                        <span className="song-badge badge-pitch">
                          音域: {song.lowestPitch || '--'} ~ {song.highestPitch || '--'}
                        </span>
                      )}
                    </div>
                    <div className="song-meta">
                      {song.lyrics && <span>作詞: {song.lyrics} </span>}
                      {song.composer && <span>/ 作曲: {song.composer} </span>}
                      {song.arranger && <span>/ 編曲: {song.arranger}</span>}
                    </div>
                    <MemberToggle members={song.members.map((m) => ({ name: m.member.name, cvName: m.member.cvName }))} />
                  </div>

                  <div>
                    <span className={`familiarity-btn ${familiarityStates[sel.familiarity]} active`} style={{ cursor: 'default' }}>
                      {familiarityLabels[sel.familiarity]}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
