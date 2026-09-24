import React from 'react';
import { getKamisabiBrandName } from '@/lib/kamisabi';

interface KamisabiCardProps {
  title: string;
  brand: string;
  /** Apple 封面（600×600）；沒有時顯示色塊 */
  artworkUrl: string | null;
  className?: string;
  /** シングル 2 分 → 右上角 ★2pt */
  points?: 1 | 2;
  /** 被誰取走 → 灰化並蓋上名牌 */
  takenBy?: string | null;
  /** 得卡綠框 / 點錯紅框抖動 */
  status?: 'correct' | 'wrong' | null;
  /** 時間軸翻開後顯示發行日 */
  releaseDate?: string | null;
  selected?: boolean;
  /** 有給就變成可點的 <button> */
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * 仿實體 KAMISABI 歌牌：淡彩全像底、專輯封面、曲名、品牌名、分隔線、播放圖示（純裝飾）。
 * 樣式在 globals.css 的 .kamisabi-card。單機出題機與線上房間共用。
 */
export default function KamisabiCard({
  title, brand, artworkUrl, className = '', points = 1, takenBy = null, status = null, releaseDate = null, selected = false, onClick, disabled = false,
}: KamisabiCardProps) {
  const classes = [
    'kamisabi-card',
    className,
    takenBy ? 'is-taken' : '',
    status === 'correct' ? 'is-correct' : '',
    status === 'wrong' ? 'is-wrong' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      {/* 內距放在 body 用 cqw（相對卡片自身寬度）；卡片本身不用百分比 padding，
          否則在寬的 flex 容器（時間軸、手牌）裡百分比會相對父容器，把內容壓成 0 */}
      <div className="kamisabi-card-body">
        <div className="kamisabi-card-cover">
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkUrl} alt="" width={600} height={600} loading="lazy" />
          ) : (
            <span aria-hidden="true">♪</span>
          )}
        </div>
        <div className="kamisabi-card-title">{title}</div>
        <div className="kamisabi-card-brand">{getKamisabiBrandName(brand)}</div>
        <div className="kamisabi-card-rule" />
        <div className="kamisabi-card-controls" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M11 6v12L2 12zM22 6v12l-9-6z" /></svg>
          <svg viewBox="0 0 24 24" className="is-play"><path d="M6 4v16l14-8z" /></svg>
          <svg viewBox="0 0 24 24"><path d="M13 6v12l9-6zM2 6v12l9-6z" /></svg>
        </div>
      </div>
      {points === 2 && <span className="kamisabi-card-points">★2pt</span>}
      {takenBy && <span className="kamisabi-card-taken-tag">{takenBy}</span>}
      {releaseDate && <span className="kamisabi-card-date">{releaseDate}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-pressed={selected || undefined}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
