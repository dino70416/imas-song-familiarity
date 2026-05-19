import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SongFamiliarityHub from '../app/page';

// 模擬 NextAuth hooks
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

test('Home page renders title and filters correctly', () => {
  render(<SongFamiliarityHub />);
  expect(screen.getByText('IMAS Song Familiarity Hub')).toBeDefined();
  expect(screen.getByPlaceholderText('搜尋歌名、參與成員、聲優姓名...')).toBeDefined();
});
