'use client';

import React from 'react';
import YoutubePlayer from './YoutubePlayer';
import GameOverModal from './GameOverModal';
import GameStatusHeader from './GameStatusHeader';
import SongOptionCard from './SongOptionCard';
import { useGameLogic } from './useGameLogic';
import { buildThemeVars } from '@/lib/themeUtils';

export default function GameClient() {
  const {
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
    startGame,
    handleOptionClick,
    handleNext,
    handleVideoError,
    useElimination,
    useSameBrand,
  } = useGameLogic();

  if (gameState === 'loading') {
    return (
      <div style={{ display: 'flex', height: '70vh', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          borderTop: '4px solid var(--accent-color)',
          borderBottom: '4px solid var(--accent-color)',
          opacity: 0.8
        }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '70vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          padding: '16px 24px',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid #fecaca'
        }}>
          <p style={{ fontWeight: 'bold', fontSize: '18px' }}>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  if (gameState === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '0 16px' }}>
        <div className="card-el" style={{
          padding: '40px',
          borderRadius: '32px',
          maxWidth: '512px',
          width: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(16px)',
          transition: 'all 0.3s ease'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(to top right, #a855f7, #6366f1)',
            borderRadius: '16px',
            margin: '0 auto 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(168, 85, 247, 0.3)'
          }}>
            <span style={{ fontSize: '40px' }}>🎵</span>
          </div>
          <h2 style={{
            fontSize: '36px',
            fontWeight: '900',
            marginBottom: '16px',
            background: 'linear-gradient(to right, #9333ea, #4f46e5)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            超級猜歌挑戰
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '18px', marginBottom: '32px', lineHeight: 1.6 }}>
            官方試聽 MV 大挑戰！仔細聆聽歌曲片段，從四個選項中找出正確的歌名與演唱者。
          </p>
          <button
            onClick={startGame}
            className="btn btn-primary"
            style={{ width: '100%', padding: '16px', fontSize: '20px', borderRadius: '16px' }}
          >
            立即開始遊戲
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const videoId = currentQuestion.answer.youtubeIds?.split(',')[0].trim() || '';
  const isAnswered = gameState === 'answered';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <GameStatusHeader
        score={score}
        bestRecord={bestRecord}
        eliminationCount={eliminationCount}
        sameBrandCount={sameBrandCount}
        gameState={gameState}
        eliminatedOptionsLength={eliminatedOptions.length}
        sameBrandUsedOnCurrent={sameBrandUsedOnCurrent}
        onUseElimination={useElimination}
        onUseSameBrand={useSameBrand}
      />

      <div style={{ width: '100%', maxWidth: '672px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.05)', padding: '8px', borderRadius: '32px', border: '1px solid var(--border-color)', backdropFilter: 'blur(4px)' }}>
          <YoutubePlayer videoId={videoId} showVideo={isAnswered} onError={handleVideoError} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {currentQuestion.options.map((option) => (
          <SongOptionCard
            key={option.id}
            option={option}
            isEliminated={eliminatedOptions.includes(option.id)}
            isAnswered={isAnswered}
            isSelected={option.id === selectedOptionId}
            isCorrectAnswer={option.id === currentQuestion.answer.id}
            onClick={handleOptionClick}
          />
        ))}
      </div>

      {isAnswered && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '32px', paddingBottom: '48px' }}>
          <button
            onClick={handleNext}
            className="btn btn-primary"
            style={{
              padding: '16px 40px',
              borderRadius: '16px',
              fontSize: '20px',
              fontWeight: '900',
              boxShadow: '0 8px 30px rgba(79, 70, 229, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            繼續下一題
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}

      {gameState === 'gameover' && (
        <GameOverModal 
          score={score} 
          correctAnswer={currentQuestion.answer}
          onRestart={startGame} 
        />
      )}
    </div>
  );
}
