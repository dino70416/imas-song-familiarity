import React from 'react';
import IntroQuizClient from '@/components/intro-quiz/IntroQuizClient';
import GuessWrapper from '@/app/guess/GuessWrapper';

export const metadata = {
  title: '副歌猜歌 出題機 | imas song familiarity',
  description: '播放 Apple Music 試聽片段、不給選項，搭配 KAMISABI 等歌牌一起猜歌',
};

export default function IntroQuizPage() {
  return (
    <GuessWrapper>
      <IntroQuizClient />
    </GuessWrapper>
  );
}
