import React from 'react';
import RoomClient from '@/components/kamisabi/room/RoomClient';
import GuessWrapper from '@/app/guess/GuessWrapper';

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  const { code } = await params;
  return {
    title: `KAMISABI 房間 ${code.toUpperCase()} | imas song familiarity`,
    description: '線上一起玩 KAMISABI 歌牌：イントロ、かるた、リリースタイムライン',
  };
}

export default async function KamisabiRoomPage({ params }: Params) {
  const { code } = await params;
  return (
    <GuessWrapper>
      <RoomClient code={code.toUpperCase()} />
    </GuessWrapper>
  );
}
