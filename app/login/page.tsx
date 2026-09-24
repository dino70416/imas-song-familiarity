import React from 'react';
import GuessWrapper from '@/app/guess/GuessWrapper';
import LoginClient from '@/components/LoginClient';

export const metadata = {
  title: '登入 | imas song familiarity',
};

/** NextAuth pages.signIn 指到這裡；?callbackUrl= 登入後導回 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const sp = await searchParams;
  const callbackUrl = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl;
  return (
    <GuessWrapper>
      <LoginClient callbackUrl={callbackUrl} />
    </GuessWrapper>
  );
}
