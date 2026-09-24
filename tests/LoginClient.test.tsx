import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const signIn = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args), useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import LoginClient from '../components/LoginClient';

beforeEach(() => {
  signIn.mockReset();
  push.mockReset();
});

async function submit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('帳號'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '登入' }));
}

test('帳密登入成功 → 導回 callbackUrl（相對路徑）', async () => {
  signIn.mockResolvedValue({ ok: true, error: null });
  render(<LoginClient callbackUrl="/kamisabi?x=1" />);
  await submit('dino', 'pw');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi?x=1'));
  expect(signIn).toHaveBeenCalledWith('credentials', { redirect: false, username: 'dino', password: 'pw' });
});

test('登入失敗顯示錯誤、不導頁', async () => {
  signIn.mockResolvedValue({ ok: false, error: '帳號或密碼錯誤' });
  render(<LoginClient callbackUrl="/kamisabi" />);
  await submit('dino', 'bad');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('帳號或密碼錯誤'));
  expect(push).not.toHaveBeenCalled();
});

test('callbackUrl 是別的網域（NextAuth 改寫成 localhost）或缺少時 → 回首頁；同網域的絕對網址取路徑', async () => {
  signIn.mockResolvedValue({ ok: true, error: null });
  const { unmount } = render(<LoginClient callbackUrl="http://localhost:3000/kamisabi" />);
  await submit('dino', 'pw');
  // jsdom 的 origin 是 http://localhost:3000 → 同網域 → 取路徑
  await waitFor(() => expect(push).toHaveBeenCalledWith('/kamisabi'));
  unmount();
  push.mockReset();

  const { unmount: u2 } = render(<LoginClient callbackUrl="http://evil.example/steal" />);
  await submit('dino', 'pw');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  u2();
  push.mockReset();

  render(<LoginClient callbackUrl={undefined} />);
  await submit('dino', 'pw');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
});
