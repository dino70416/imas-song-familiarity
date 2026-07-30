import React from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import { buildThemeVars } from '@/lib/themeUtils';
import UserProfileClient from './UserProfileClient';

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  const session = await getServerSession(authOptions);

  // 查詢該製作人的基本資料與選取內容
  const dbUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      nickname: true,
      themeColor: true,
      isPublic: true,
      shareCode: true,
      producerIdols: {
        select: {
          member: {
            select: {
              id: true,
              name: true,
              cvName: true,
              production: true,
              imagePath: true,
            },
          },
        },
      },
      representativeSongs: {
        select: {
          song: {
            select: {
              id: true,
              slug: true,
              title: true,
              brand: true,
              musicType: true,
              lyrics: true,
              composer: true,
              arranger: true,
              lowestPitch: true,
              highestPitch: true,
              youtubeIds: true,
              members: {
                select: {
                  member: {
                    select: {
                      id: true,
                      name: true,
                      cvName: true,
                    },
                  },
                },
              },
              units: {
                select: {
                  unit: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      collabSongs: {
        select: {
          song: {
            select: {
              id: true,
              slug: true,
              title: true,
              brand: true,
              musicType: true,
              lyrics: true,
              composer: true,
              arranger: true,
              lowestPitch: true,
              highestPitch: true,
              youtubeIds: true,
              members: {
                select: {
                  member: {
                    select: {
                      id: true,
                      name: true,
                      cvName: true,
                    },
                  },
                },
              },
              units: {
                select: {
                  unit: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      receivedWishes: {
        select: {
          id: true,
          createdAt: true,
          isCompleted: true,
          comment: true,
          song: {
            select: {
              id: true,
              title: true,
              brand: true,
              musicType: true,
            },
          },
          senderUser: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!dbUser) {
    return notFound();
  }

  // 取得目前登入者
  const currentUser = session?.user
    ? {
      id: session.user.id,
      username: session.user.username,
      nickname: session.user.nickname,
    }
    : null;

  // 隱私設定（isPublic）外洩防護
  const isOwner = currentUser?.id === dbUser.id;
  if (!dbUser.isPublic && !isOwner) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '40px 32px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Lock Icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              color: '#ef4444',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              style={{ width: '32px', height: '32px' }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 00-2.25 2.25z"
              />
            </svg>
          </div>

          <h2
            style={{
              fontSize: '22px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#f1f5f9',
            }}
          >
            製作人檔案未公開
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#94a3b8',
              lineHeight: '1.6',
              marginBottom: '32px',
            }}
          >
            很抱歉，製作人 <strong>{dbUser.nickname}</strong> 尚未公開其個人首頁與歌單。
          </p>

          <Link
            href="/"
            style={{
              display: 'inline-block',
              width: '100%',
              padding: '12px 24px',
              backgroundColor: '#92cfbb',
              color: '#0f172a',
              fontWeight: '600',
              fontSize: '14px',
              borderRadius: '8px',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            返回首頁
          </Link>
        </div>
      </div>
    );
  }

  // 扁平化關聯欄位以傳給 Client Component
  const initialProducerIdols = dbUser.producerIdols.map((pi) => ({
    id: pi.member.id,
    name: pi.member.name,
    cvName: pi.member.cvName,
    production: pi.member.production,
    imagePath: pi.member.imagePath,
  }));

  const initialRepresentativeSongs = dbUser.representativeSongs.map((rs) => ({
    id: rs.song.id,
    title: rs.song.title,
    brand: rs.song.brand,
    musicType: rs.song.musicType,
    lyrics: rs.song.lyrics,
    composer: rs.song.composer,
    arranger: rs.song.arranger,
    lowestPitch: rs.song.lowestPitch,
    highestPitch: rs.song.highestPitch,
    youtubeIds: rs.song.youtubeIds,
    members: rs.song.members.map((m) => ({
      id: m.member.id,
      name: m.member.name,
      cvName: m.member.cvName,
    })),
    units: rs.song.units.map((su) => ({
      id: su.unit.id,
      name: su.unit.name,
    })),
  }));

  const initialCollabSongs = dbUser.collabSongs.map((cs) => ({
    id: cs.song.id,
    title: cs.song.title,
    brand: cs.song.brand,
    musicType: cs.song.musicType,
    lyrics: cs.song.lyrics,
    composer: cs.song.composer,
    arranger: cs.song.arranger,
    lowestPitch: cs.song.lowestPitch,
    highestPitch: cs.song.highestPitch,
    youtubeIds: cs.song.youtubeIds,
    members: cs.song.members.map((m) => ({
      id: m.member.id,
      name: m.member.name,
      cvName: m.member.cvName,
    })),
    units: cs.song.units.map((su) => ({
      id: su.unit.id,
      name: su.unit.name,
    })),
  }));

  const initialWishes = dbUser.receivedWishes.map((w) => ({
    id: w.id,
    createdAt: w.createdAt.toISOString(),
    isCompleted: w.isCompleted,
    comment: w.comment,
    song: {
      id: w.song.id,
      title: w.song.title,
      brand: w.song.brand,
      musicType: w.song.musicType,
    },
    sender: {
      id: w.senderUser.id,
      username: w.senderUser.username,
      nickname: w.senderUser.nickname,
    },
  }));

  return (
    <div
      style={{
        ...(buildThemeVars(dbUser.themeColor || '#92cfbb') as React.CSSProperties),
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <UserProfileClient
        profileUser={{
          id: dbUser.id,
          username: dbUser.username,
          nickname: dbUser.nickname,
          themeColor: dbUser.themeColor,
          isPublic: dbUser.isPublic,
          shareCode: dbUser.shareCode,
        }}
        currentUser={currentUser}
        initialProducerIdols={initialProducerIdols}
        initialRepresentativeSongs={initialRepresentativeSongs}
        initialCollabSongs={initialCollabSongs}
        initialWishes={initialWishes}
      />
    </div>
  );
}
