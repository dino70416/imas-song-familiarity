import React from 'react';
import { GameState } from '@/types/game';

interface GameStatusHeaderProps {
  score: number;
  bestRecord: number;
  eliminationCount: number;
  sameBrandCount: number;
  gameState: GameState;
  eliminatedOptionsLength: number;
  sameBrandUsedOnCurrent: boolean;
  onUseElimination: () => void;
  onUseSameBrand: () => void;
}

export default function GameStatusHeader({
  score,
  bestRecord,
  eliminationCount,
  sameBrandCount,
  gameState,
  eliminatedOptionsLength,
  sameBrandUsedOnCurrent,
  onUseElimination,
  onUseSameBrand,
}: GameStatusHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(12px)',
      padding: '16px',
      borderRadius: '16px',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
          SCORE: <span style={{ fontSize: '32px', fontWeight: '900', color: 'var(--accent-color)', marginLeft: '4px' }}>{score}</span>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
          BEST: <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginLeft: '4px' }}>{bestRecord}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={onUseElimination}
          disabled={gameState !== 'playing' || eliminationCount <= 0 || eliminatedOptionsLength >= 2}
          className="btn btn-secondary"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <span>50/50 刪去法</span>
          <span style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            backgroundColor: '#dc2626',
            color: 'white',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '9999px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            border: '2px solid #f97316',
            zIndex: 20
          }}>
            {eliminationCount}
          </span>
        </button>

        <button
          onClick={onUseSameBrand}
          disabled={gameState !== 'playing' || sameBrandCount <= 0 || sameBrandUsedOnCurrent}
          className="btn btn-secondary"
          style={{ position: 'relative', overflow: 'visible' }}
        >
          <span>同品牌提示</span>
          <span style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            backgroundColor: '#dc2626',
            color: 'white',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '9999px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            border: '2px solid #ec4899',
            zIndex: 20
          }}>
            {sameBrandCount}
          </span>
        </button>
      </div>
    </div>
  );
}
