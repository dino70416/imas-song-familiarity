import React from 'react';
import { getKamisabiBrandName } from '@/lib/kamisabi';

interface KamisabiCardProps {
  title: string;
  brand: string;
  /** Apple 封面（600×600）；沒有時顯示色塊 */
  artworkUrl: string | null;
  className?: string;
}

/**
 * 仿實體 KAMISABI 歌牌：淡彩全像底、專輯封面、曲名、品牌名、分隔線、播放圖示（純裝飾）。
 * 樣式在 globals.css 的 .kamisabi-card。
 */
export default function KamisabiCard({ title, brand, artworkUrl, className = '' }: KamisabiCardProps) {
  return (
    <div className={`kamisabi-card ${className}`}>
      <div className="kamisabi-card-cover">
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" width={600} height={600} />
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
  );
}
