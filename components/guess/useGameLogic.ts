'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Song, Question, GameState } from '@/types/game';
import { shuffle } from '@/lib/shuffle';
import { useSession } from 'next-auth/react';

export function useGameLogic() {
  const { data: session, status } = useSession();
  const [gameState, setGameState] = useState<GameState>('loading');
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [playableSongs, setPlayableSongs] = useState<Song[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [bestRecord, setBestRecord] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});

  const nextQuestionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tools state
  const [eliminationCount, setEliminationCount] = useState(3);
  const [sameBrandCount, setSameBrandCount] = useState(3);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [sameBrandUsedOnCurrent, setSameBrandUsedOnCurrent] = useState(false);

  // Load high score
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('imas-guess-highscore');
      if (saved) setBestRecord(parseInt(saved, 10));
    }
  }, []);

  // Load familiarity selections
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/selections')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data === 'object') {
            setSelections(data);
          }
        })
        .catch((err) => console.error('Failed to load cloud selections:', err));
    } else if (status === 'unauthenticated') {
      const localStored = localStorage.getItem('guest_selections');
      if (localStored) {
        try {
          setSelections(JSON.parse(localStored));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [status]);

  useEffect(() => {
    fetch('/api/songs/guess')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch songs');
        return res.json();
      })
      .then((data: Song[]) => {
        setAllSongs(data);
        setPlayableSongs(data.filter((s) => s.youtubeIds));
        setGameState('idle');
      })
      .catch((err) => {
        console.error(err);
        setError('載入題庫失敗，請稍後再試。');
        setGameState('idle');
      });
  }, []);

  const clearTimer = useCallback(() => {
    if (nextQuestionTimerRef.current) {
      clearTimeout(nextQuestionTimerRef.current);
      nextQuestionTimerRef.current = null;
    }
  }, []);

  const generateQuestion = useCallback(() => {
    clearTimer();
    if (playableSongs.length === 0 || allSongs.length < 4) {
      return;
    }

    const answerIndex = Math.floor(Math.random() * playableSongs.length);
    const answer = playableSongs[answerIndex];

    const distractors = shuffle(allSongs.filter(s => s.id !== answer.id)).slice(0, 3);
    const options = shuffle([answer, ...distractors]);

    setCurrentQuestion({ answer, options });
    setSelectedOptionId(null);
    setEliminatedOptions([]);
    setSameBrandUsedOnCurrent(false);
    setGameState('playing');
  }, [playableSongs, allSongs, clearTimer]);

  const startGame = () => {
    setScore(0);
    setEliminationCount(3);
    setSameBrandCount(3);
    generateQuestion();
  };

  // YouTube 影片無法播放時（版權限制、下架等），自動靜默跳下一題
  const handleVideoError = useCallback(() => {
    if (gameState === 'playing') {
      generateQuestion();
    }
  }, [gameState, generateQuestion]);

  const handleOptionClick = (optionId: string) => {
    if (gameState !== 'playing' || eliminatedOptions.includes(optionId)) return;

    setSelectedOptionId(optionId);

    const isCorrect = optionId === currentQuestion?.answer.id;
    if (isCorrect) {
      setGameState('answered');
      setScore((prev) => {
        const newScore = prev + 1;
        if (newScore > bestRecord) {
          setBestRecord(newScore);
          localStorage.setItem('imas-guess-highscore', newScore.toString());
        }
        return newScore;
      });
    } else {
      setGameState('answered');
    }
  };

  const handleGameOver = () => {
    setGameState('gameover');
  };

  const updateFamiliarity = useCallback(async (songId: string, familiarity: number) => {
    setSelections((prev) => ({ ...prev, [songId]: familiarity }));
    if (status === 'authenticated') {
      try {
        await fetch('/api/selections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ songId, familiarity }]),
        });
      } catch (err) {
        console.error('Failed to update cloud selection:', err);
      }
    } else {
      const localStored = localStorage.getItem('guest_selections');
      const selectionsObj = localStored ? JSON.parse(localStored) : {};
      selectionsObj[songId] = familiarity;
      localStorage.setItem('guest_selections', JSON.stringify(selectionsObj));
    }
  }, [status]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const useElimination = () => {
    if (eliminationCount <= 0 || !currentQuestion || gameState !== 'playing') return;

    const wrongOptions = currentQuestion.options.filter(
      (o) => o.id !== currentQuestion.answer.id && !eliminatedOptions.includes(o.id)
    );

    const shuffledWrong = shuffle(wrongOptions);
    const toEliminate = shuffledWrong.slice(0, 2).map((o) => o.id);

    setEliminatedOptions((prev) => [...prev, ...toEliminate]);
    setEliminationCount((prev) => prev - 1);
  };

  const useSameBrand = () => {
    if (sameBrandCount <= 0 || !currentQuestion || gameState !== 'playing' || sameBrandUsedOnCurrent) return;

    const { answer } = currentQuestion;
    const sameBrandSongs = shuffle(allSongs.filter(
      (s) => s.brand === answer.brand && s.id !== answer.id
    ));
    const differentBrandSongs = shuffle(allSongs.filter(
      (s) => s.brand !== answer.brand && s.id !== answer.id
    ));

    const newDistractors = sameBrandSongs.slice(0, 3);
    if (newDistractors.length < 3) {
      newDistractors.push(...differentBrandSongs.slice(0, 3 - newDistractors.length));
    }

    setCurrentQuestion({ answer, options: shuffle([answer, ...newDistractors]) });
    setSameBrandCount((prev) => prev - 1);
    setSameBrandUsedOnCurrent(true);
    setEliminatedOptions([]);
  };

  return {
    gameState,
    score,
    bestRecord,
    error,
    currentQuestion,
    selectedOptionId,
    eliminationCount,
    sameBrandCount,
    eliminatedOptions,
    sameBrandUsedOnCurrent,
    selections,
    startGame,
    handleOptionClick,
    handleNext: generateQuestion,
    handleGameOver,
    handleVideoError,
    useElimination,
    useSameBrand,
    updateFamiliarity
  };
}
