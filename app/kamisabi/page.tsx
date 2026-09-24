import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canHostRoom } from '@/lib/kamisabiRoom/hosts';
import KamisabiClient from '@/components/kamisabi/KamisabiClient';
import GuessWrapper from '@/app/guess/GuessWrapper';

export const metadata = {
  title: 'KAMISABI 出題機 | imas song familiarity',
  description: '播放 Apple Music 30 秒試聽、不給選項，搭配 KAMISABI 歌牌一起猜歌',
};

export default async function KamisabiPage() {
  // 線上房間區塊只給 KAMISABI_ROOM_HOSTS 白名單帳號看；其他人只有出題機
  const session = await getServerSession(authOptions);
  const canHost = canHostRoom(session?.user?.username);
  return (
    <GuessWrapper>
      <KamisabiClient canHostRoom={canHost} />
    </GuessWrapper>
  );
}
