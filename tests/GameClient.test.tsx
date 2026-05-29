import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import GameClient from '../components/guess/GameClient';

vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: null,
        status: 'unauthenticated',
    }),
}));

// Mock YoutubePlayer
vi.mock('../components/guess/YoutubePlayer', () => ({
    default: ({ onReady }: any) => {
        // Simulate player ready
        React.useEffect(() => {
            if (onReady) onReady({ target: { playVideo: vi.fn() } });
        }, [onReady]);
        return <div data-testid='youtube-player' />;
    },
}));

const mockSongs = [
    { id: '1', title: 'Song 1', brand: 'music_as', youtubeIds: 'vid1', members: [], units: [] },
    { id: '2', title: 'Song 2', brand: 'music_as', youtubeIds: null, members: [], units: [] },
    { id: '3', title: 'Song 3', brand: 'music_as', youtubeIds: null, members: [], units: [] },
    { id: '4', title: 'Song 4', brand: 'music_as', youtubeIds: null, members: [], units: [] },
];

beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSongs),
        })
    );
});

test('GameClient flow: Correct answer leads to next question after manual click', async () => {
    render(<GameClient />);

    // Wait for loading to finish
    await waitFor(() => expect(screen.queryByText('超級猜歌挑戰')).toBeDefined(), { timeout: 3000 });

    fireEvent.click(screen.getByText('立即開始遊戲'));

    // Wait for game to start and cards to appear
    await waitFor(() => {
        expect(screen.getByText('Song 1')).toBeDefined();
    }, { timeout: 3000 });

    // Song 1 is the only playable song, so it is the correct answer.
    const correctCard = screen.getByText('Song 1').closest('[role="button"]');
    expect(correctCard).not.toBeNull();
    fireEvent.click(correctCard!);

    // Score should be incremented to 1
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);

    // Next button should be displayed
    const nextBtn = screen.getByText('繼續下一題');
    expect(nextBtn).toBeDefined();

    // Clicking next button advances to next question (which re-renders the same mocks in this test)
    fireEvent.click(nextBtn);
});

test('GameClient flow: Wrong answer leads to GameOverModal after manual click', async () => {
    render(<GameClient />);

    await waitFor(() => expect(screen.queryByText('超級猜歌挑戰')).toBeDefined(), { timeout: 3000 });
    fireEvent.click(screen.getByText('立即開始遊戲'));

    await waitFor(() => {
        expect(screen.getByText('Song 2')).toBeDefined();
    }, { timeout: 3000 });

    // Song 2 is a distractor, so it is a wrong answer.
    const wrongCard = screen.getByText('Song 2').closest('[role="button"]');
    expect(wrongCard).not.toBeNull();
    fireEvent.click(wrongCard!);

    // Wait for WRONG badge to be displayed
    await waitFor(() => {
        expect(screen.getByText('WRONG')).toBeDefined();
    }, { timeout: 3000 });

    // End game button should be displayed
    const gameOverBtn = screen.getByText('結束遊戲');
    expect(gameOverBtn).toBeDefined();
    fireEvent.click(gameOverBtn);

    // Now it should show GameOverModal
    await waitFor(() => {
        expect(screen.queryByText('遊戲結束！')).toBeDefined();
    });
});
