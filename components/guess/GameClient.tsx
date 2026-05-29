'use client';

import React from 'react';
import YoutubePlayer from './YoutubePlayer';
import GameOverModal from './GameOverModal';
import GameStatusHeader from './GameStatusHeader';
import SongOptionCard from './SongOptionCard';
import { useGameLogic } from './useGameLogic';
import { buildThemeVars, getBrandColor, getBrandDisplayName } from '@/lib/themeUtils';
import { BRAND_VALUES } from '@/lib/brandMap';
import { BrandIcon } from '@/components/BrandIcon';

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
    selections,
    selectedBrands,
    setSelectedBrands,
    matchingSongsCount,
    startGame,
    handleOptionClick,
    handleNext,
    handleGameOver,
    handleVideoError,
    useElimination,
    useSameBrand,
    updateFamiliarity,
  } = useGameLogic();

  const [activeFamiliaritySongId, setActiveFamiliaritySongId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (gameState === 'playing') {
      setActiveFamiliaritySongId(null);
    }
  }, [gameState]);

  const toggleBrand = (b: string) => {
    setSelectedBrands((prev) => {
      if (prev.includes(b)) {
        return prev.filter((x) => x !== b);
      } else {
        return [...prev, b];
      }
    });
  };

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
          maxWidth: '640px',
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

          <div style={{ marginBottom: '32px', textAlign: 'left', width: '100%' }}>
            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
              🎯 選擇挑戰的品牌（可複選，不選代表全部）：
            </label>
            <div className="brand-picker-grid" style={{
              display: 'grid',
              gap: '8px',
              width: '100%'
            }}>
              {BRAND_VALUES.map((b) => {
                const checked = selectedBrands.includes(b);
                const color = getBrandColor(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBrand(b)}
                    aria-pressed={checked}
                    className={`brand-card ${checked ? 'is-checked' : ''}`}
                    style={
                      checked
                        ? {
                          borderColor: color,
                          backgroundColor: `${color}10`,
                          boxShadow: `0 0 0 1px ${color}33 inset`,
                          cursor: 'pointer'
                        }
                        : { cursor: 'pointer' }
                    }
                  >
                    <span className="brand-card-icon">
                      <BrandIcon brand={b} className="brand-card-svg" />
                    </span>
                    <span className="brand-card-name" style={{ fontSize: '12px' }}>{getBrandDisplayName(b)}</span>
                    {checked && (
                      <span
                        className="brand-card-check"
                        style={{ background: color }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p style={{
              fontSize: '13px',
              color: matchingSongsCount >= 4 ? 'var(--accent-text-dark, #4f46e5)' : '#dc2626',
              fontWeight: '600',
              marginTop: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>📊</span>
              {matchingSongsCount >= 4
                ? `已選品牌共有 ${matchingSongsCount} 首歌曲可供挑戰`
                : `可挑戰歌曲數為 ${matchingSongsCount} 首 (至少需 4 首)`}
            </p>
          </div>

          <button
            onClick={startGame}
            disabled={matchingSongsCount < 4}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '20px',
              borderRadius: '16px',
              opacity: matchingSongsCount < 4 ? 0.6 : 1,
              cursor: matchingSongsCount < 4 ? 'not-allowed' : 'pointer'
            }}
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
            currentFamiliarity={selections[option.id]}
            onSelectFamiliarity={(familiarity) => updateFamiliarity(option.id, familiarity)}
            showFamiliaritySelector={activeFamiliaritySongId === option.id}
            onToggleFamiliaritySelector={() => {
              setActiveFamiliaritySongId(activeFamiliaritySongId === option.id ? null : option.id);
            }}
          />
        ))}
      </div>

      {isAnswered && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '32px', paddingBottom: '48px' }}>
          {selectedOptionId === currentQuestion.answer.id ? (
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
          ) : (
            <button
              onClick={handleGameOver}
              className="btn btn-danger"
              style={{
                padding: '16px 40px',
                borderRadius: '16px',
                fontSize: '20px',
                fontWeight: '900',
                boxShadow: '0 8px 30px rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              結束遊戲
              <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
