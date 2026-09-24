'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

/**
 * 登入後要導回哪裡：只接受同網域。
 * 相對路徑直接用；絕對網址要同 origin 才取其路徑
 * （NextAuth 會把跨網域的 callbackUrl 改寫成 NEXTAUTH_URL，例如手機連區網 IP 時會變成 localhost）。
 */
export function safeCallbackPath(raw: string | undefined, origin: string): string {
  if (!raw) return '/';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw, origin);
    if (u.origin === origin) return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    /* 不是合法網址 */
  }
  return '/';
}

/** /login：帳密登入（與首頁的登入視窗同一套 credentials provider），成功後導回 callbackUrl */
export default function LoginClient({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await signIn('credentials', { redirect: false, username, password });
      if (!res || res.error) {
        setError(res?.error || '登入失敗，請再試一次。');
        return;
      }
      router.push(safeCallbackPath(callbackUrl, window.location.origin));
      router.refresh();
    } catch {
      setError('網路異常，請稍後再試。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 16px' }}>
      <form onSubmit={submit} className="card-el" style={{ width: '100%', maxWidth: '400px', padding: '28px', borderRadius: '20px', backgroundColor: 'rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0 }}>登入</h1>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 700 }}>
          帳號
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '16px' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 700 }}>
          密碼
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '16px' }} />
        </label>
        {error && <div role="alert" style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ padding: '12px', fontSize: '16px', borderRadius: '12px' }}>
          登入
        </button>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          還沒有帳號？<Link href="/">到首頁註冊</Link>
        </p>
      </form>
    </div>
  );
}
