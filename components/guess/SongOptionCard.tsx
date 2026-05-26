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
}

export default function SongOptionCard({
  option,
  isEliminated,
  isAnswered,
  isSelected,
  isCorrectAnswer,
  onClick,
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

  const brandColor = getBrandColor(option.brand);
  let cardClasses =
    'card-el relative flex flex-col p-6 text-left overflow-hidden transition-all duration-300 ease-out';

  if (isEliminated) {
    cardClasses +=
      ' opacity-30 cursor-not-allowed scale-95 bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800';
  } else if (isAnswered) {
    if (isCorrectAnswer) {
      cardClasses +=
        ' border-green-500 bg-green-50 dark:bg-green-900/20 shadow-[0_0_20px_rgba(34,197,94,0.2)] z-10 scale-[1.02]';
    } else if (isSelected) {
      cardClasses +=
        ' border-red-500 bg-red-50 dark:bg-red-900/20 shadow-[0_0_20px_rgba(239,68,68,0.2)] opacity-80';
    } else {
      cardClasses += ' opacity-50 scale-95 border-gray-200 dark:border-gray-800';
    }
  } else {
    cardClasses += ' cursor-pointer hover:scale-[1.02] hover:border-accent-color hover:shadow-lg';
  }

  return (
    <button
      onClick={() => onClick(option.id)}
      disabled={isAnswered || isEliminated}
      className={cardClasses}
      style={(!isEliminated ? { '--border-color-hover': brandColor } : {}) as React.CSSProperties}
    >
      {!isEliminated && (
        <div
          className="absolute top-0 left-0 w-1.5 h-full opacity-70"
          style={{ backgroundColor: brandColor }}
        />
      )}

      <div className="flex items-center justify-between w-full mb-3 pl-2">
        <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          {isEliminated ? 'ELIMINATED' : getBrandDisplayName(option.brand)}
        </span>
        {isAnswered && isCorrectAnswer && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold animate-pulse">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
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
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-bold">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
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

      <div className="pl-2">
        <h3
          className={`text-lg font-bold mb-1 leading-tight ${isEliminated ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}
        >
          {isEliminated ? '---' : option.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center">
          <span className="opacity-60 mr-1.5">BY</span>
          {isEliminated ? '---' : getSingerText(option)}
        </p>
      </div>
    </button>
  );
}
