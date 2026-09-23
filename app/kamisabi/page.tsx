import React from 'react';
import KamisabiClient from '@/components/kamisabi/KamisabiClient';
import GuessWrapper from '@/app/guess/GuessWrapper';

export const metadata = {
  title: 'KAMISABI 出題機 | imas song familiarity',
  description: '播放 Apple Music 30 秒試聽、不給選項，搭配 KAMISABI 歌牌一起猜歌',
};

export default function KamisabiPage() {
  return (
    <GuessWrapper>
      <KamisabiClient />
    </GuessWrapper>
  );
}
