import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { buildThemeVars } from '@/lib/themeUtils';
import PlaylistList, {
  PlaylistSong,
  PlaylistIdol,
  PlaylistUnit,
} from './PlaylistList';
import BackToTop from '@/components/BackToTop';

interface PageProps {
  params: Promise<{ shareCode: string }>;
}

export default async function PublicPlaylistPage({ params }: PageProps) {
  const { shareCode } = await params;

  const dbUser = await prisma.user.findUnique({
    where: { shareCode },
  });

  if (!dbUser) {
    return notFound();
  }

  const selections = await prisma.userSelection.findMany({
    where: {
      userId: dbUser.id,
      familiarity: { in: [1, 2, 3, 4] },
    },
    include: {
      song: {
        include: {
          members: { include: { member: true } },
          units: {
            include: {
              // 用 _count 直接帶 memberCount 進來，省掉另一次 UnitMember.findMany round-trip
              unit: { include: { _count: { select: { members: true } } } },
            },
          },
        },
      },
    },
    orderBy: { familiarity: 'asc' },
  });

  // 攤平成 client component 用的 shape
  // youtubeIds 是 song 上的欄位(Prisma include 已含 song),不需要改 select 範圍
  const songs: PlaylistSong[] = selections.map((sel) => ({
    id: sel.song.id,
    title: sel.song.title,
    brand: sel.song.brand,
    musicType: sel.song.musicType,
    lyrics: sel.song.lyrics,
    composer: sel.song.composer,
    arranger: sel.song.arranger,
    lowestPitch: sel.song.lowestPitch,
    highestPitch: sel.song.highestPitch,
    youtubeIds: sel.song.youtubeIds,
    members: sel.song.members.map((m) => ({
      id: m.member.id,
      name: m.member.name,
      cvName: m.member.cvName,
    })),
    units: sel.song.units.map((su) => ({
      id: su.unit.id,
      name: su.unit.name,
    })),
    familiarity: sel.familiarity,
  }));

  // 下拉只列「實際出現在這份歌單裡」的偶像 / 組合，比抓全部 263+301 更聚焦
  // memberCount 直接吃 Prisma _count.members，不再多打一次 UnitMember.findMany
  const idolMap = new Map<string, PlaylistIdol>();
  const unitMap = new Map<string, PlaylistUnit>();
  for (const sel of selections) {
    for (const m of sel.song.members) {
      if (!m.member.production) continue; // 跳過沒掛 production 的雜項
      if (!idolMap.has(m.member.id)) {
        idolMap.set(m.member.id, {
          id: m.member.id,
          name: m.member.name,
          kana: m.member.kana,
          cvName: m.member.cvName,
          production: m.member.production,
        });
      }
    }
    for (const su of sel.song.units) {
      if (!unitMap.has(su.unit.id)) {
        unitMap.set(su.unit.id, {
          id: su.unit.id,
          name: su.unit.name,
          kana: su.unit.kana,
          production: su.unit.production,
          memberCount: su.unit._count.members,
        });
      }
    }
  }
  const idols: PlaylistIdol[] = Array.from(idolMap.values()).sort((a, b) =>
    (a.kana ?? a.name).localeCompare(b.kana ?? b.name, 'ja'),
  );
  const units: PlaylistUnit[] = Array.from(unitMap.values()).sort((a, b) =>
    (a.kana ?? a.name).localeCompare(b.kana ?? b.name, 'ja'),
  );

  const themeColor = dbUser.themeColor || '#92cfbb';

  return (
    <div
      style={{
        ...(buildThemeVars(themeColor) as any),
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
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
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '14px',
              marginTop: '6px',
            }}
          >
            共評估了 {songs.length} 首熟悉歌曲。
          </p>
        </div>

        <PlaylistList songs={songs} idols={idols} units={units} />
      </main>

      <BackToTop />
    </div>
  );
}
