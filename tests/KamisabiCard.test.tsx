import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import KamisabiCard from '../components/kamisabi/KamisabiCard';

test('預設是 div、顯示曲名與品牌日文全名', () => {
  const { container } = render(<KamisabiCard title="READY!!" brand="music_ml" artworkUrl={null} />);
  expect(container.querySelector('div.kamisabi-card')).not.toBeNull();
  expect(screen.getByText('READY!!')).toBeDefined();
  expect(screen.getByText('アイドルマスター ミリオンライブ！')).toBeDefined();
});

test('有 onClick 時是 button，disabled 時不觸發', () => {
  const onClick = vi.fn();
  const { rerender } = render(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} onClick={onClick} />);
  fireEvent.click(screen.getByRole('button', { name: /A/ }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} onClick={onClick} disabled />);
  fireEvent.click(screen.getByRole('button', { name: /A/ }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('被取走 → is-taken + 名牌；★2pt；發行日；狀態 class', () => {
  const { container } = render(
    <KamisabiCard title="A" brand="music_ml" artworkUrl={null} takenBy="未来" points={2} releaseDate="2013-04-24" status="correct" selected />,
  );
  const card = container.querySelector('.kamisabi-card')!;
  expect(card.className).toContain('is-taken');
  expect(card.className).toContain('is-correct');
  expect(card.className).toContain('is-selected');
  expect(screen.getByText('未来')).toBeDefined();
  expect(screen.getByText('★2pt')).toBeDefined();
  expect(screen.getByText('2013-04-24')).toBeDefined();
});

test('status=wrong → is-wrong', () => {
  const { container } = render(<KamisabiCard title="A" brand="music_ml" artworkUrl={null} status="wrong" />);
  expect(container.querySelector('.kamisabi-card')!.className).toContain('is-wrong');
});
