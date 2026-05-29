import React from 'react';
import { Song } from '@/types/game';
import { getBrandDisplayName, getBrandColor } from '@/lib/themeUtils';

interface SongOptionCardProps {
  option: Song;
  isEliminated: boolean;
  isAnswered: boolean;
  isSelected: boolean;
  isCorrectAnswer: boolean;
  onClick: (id: string) => void;
  currentFamiliarity?: number;
  onSelectFamiliarity?: (familiarity: number) => void;
  showFamiliaritySelector?: boolean;
  onToggleFamiliaritySelector?: () => void;
}

const RATING_OPTIONS = [
  { v: 1, label: '會唱' },
  { v: 2, label: '常聽' },
  { v: 3, label: '有聽過' },
  { v: 4, label: '不太記得' },
  { v: 0, label: '不記得' },
];

const FAM_TEXTS: Record<number, string> = {
  1: '會唱',
  2: '常聽',
  3: '有聽過',
  4: '不太記得',
  0: '不記得',
};

export default function SongOptionCard({
  option,
  isEliminated,
  isAnswered,
  isSelected,
  isCorrectAnswer,
  onClick,
  currentFamiliarity,
  onSelectFamiliarity,
  showFamiliaritySelector,
  onToggleFamiliaritySelector,
}: SongOptionCardProps) {
  const getSingerText = (song: Song) => {
    if (song.units && song.units.length > 0) {
      return song.units.map((u) => u.name).join('、');
    }
    if (song.members && song.members.length > 0) {
      return song.members.map((m) => m.name).join('、');
    }
    return '群星 / 其他';
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If the click is inside a familiarity button, don't trigger the card's main toggle
    if ((e.target as HTMLElement).closest('.familiarity-btn')) {
      return;
    }
    if (isEliminated) return;

    if (isAnswered) {
      onToggleFamiliaritySelector?.();
    } else {
      onClick(option.id);
    }
  };

  const getFamBadge = (fam: number | undefined) => {
    if (fam === undefined) {
      return (
        <span style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '20px',
          border: '1px dashed #9ca3af',
          color: '#6b7280',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: '500'
        }}>
          💡 點我標記熟悉度
        </span>
      );
    }
    return (
      <span className={`familiarity-btn state-${fam} active`} style={{
        fontSize: '11px',
        padding: '2px 10px',
        borderRadius: '20px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 'bold'
      }}>
        {FAM_TEXTS[fam]}
      </span>
    );
  };

  const brandColor = getBrandColor(option.brand);
  let cardClasses = 'card-el';
  let cardStyles: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    textAlign: 'left',
    overflow: 'hidden',
    transition: 'all 0.3s ease-out'
  };

  if (isEliminated) {
    cardStyles = {
      ...cardStyles,
      opacity: 0.3,
      cursor: 'not-allowed',
      transform: 'scale(0.95)',
      backgroundColor: '#f3f4f6',
      borderColor: '#e5e7eb'
    };
  } else if (isAnswered) {
    if (isCorrectAnswer) {
      cardStyles = {
        ...cardStyles,
        borderColor: '#22c55e',
        backgroundColor: '#f0fdf4',
        boxShadow: '0 0 20px rgba(34,197,94,0.2)',
        zIndex: 10,
        transform: 'scale(1.02)'
      };
    } else if (isSelected) {
      cardStyles = {
        ...cardStyles,
        borderColor: '#ef4444',
        backgroundColor: '#fef2f2',
        boxShadow: '0 0 20px rgba(239,68,68,0.2)',
        opacity: 0.8
      };
    } else {
      cardStyles = {
        ...cardStyles,
        opacity: 0.5,
        transform: 'scale(0.95)',
        borderColor: '#e5e7eb'
      };
    }
  } else {
    cardStyles = {
      ...cardStyles,
      cursor: 'pointer',
      '--border-color-hover': brandColor
    } as React.CSSProperties;
  }

  return (
    <div
      onClick={handleCardClick}
      className={cardClasses}
      style={{
        ...cardStyles,
        cursor: isEliminated ? 'not-allowed' : 'pointer'
      }}
      role="button"
      tabIndex={isEliminated ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as any);
        }
      }}
    >
      {!isEliminated && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '6px',
            height: '100%',
            opacity: 0.7,
            backgroundColor: brandColor
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '12px', paddingLeft: '8px' }}>
        <span style={{
          fontSize: '10px',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '2px 8px',
          borderRadius: '4px',
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
          border: '1px solid #e5e7eb'
        }}>
          {isEliminated ? 'ELIMINATED' : getBrandDisplayName(option.brand)}
        </span>
        {isAnswered && isCorrectAnswer && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '12px', fontWeight: 'bold' }}>
            <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            CORRECT
          </span>
        )}
        {isAnswered && isSelected && !isCorrectAnswer && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontSize: '12px', fontWeight: 'bold' }}>
            <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            WRONG
          </span>
        )}
      </div>

      <div style={{ paddingLeft: '8px', width: '100%' }}>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '4px',
            lineHeight: 1.2,
            textDecoration: isEliminated ? 'line-through' : 'none',
            color: isEliminated ? '#9ca3af' : 'var(--text-primary)'
          }}
        >
          {isEliminated ? '---' : option.title}
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500', display: 'flex', alignItems: 'center' }}>
          <span style={{ opacity: 0.6, marginRight: '6px' }}>BY</span>
          {isEliminated ? '---' : getSingerText(option)}
        </p>
      </div>

      {isAnswered && !isEliminated && (
        <div style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(0, 0, 0, 0.08)',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {showFamiliaritySelector ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>設定熟悉度：</span>
                <span style={{ fontSize: '11px', color: '#6b7280', cursor: 'pointer', opacity: 0.8 }} onClick={onToggleFamiliaritySelector}>收合 ×</span>
              </div>
              <div className="familiarity-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', width: '100%' }}>
                {RATING_OPTIONS.map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    className={`familiarity-btn state-${v} ${currentFamiliarity === v ? 'active' : ''}`}
                    style={{
                      padding: '6px 2px',
                      fontSize: '11px',
                      textAlign: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      minWidth: '0'
                    }}
                    onClick={() => onSelectFamiliarity?.(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>我的熟悉度：</span>
              {getFamBadge(currentFamiliarity)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
