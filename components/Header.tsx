'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

/**
 * 簡單的 Header 元件，提供導航功能與登入狀態顯示。
 * 樣式與 app/page.tsx 保持一致。
 */
export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header style={{ 
      backgroundColor: 'rgba(255, 255, 255, 0.85)', 
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '16px 0'
    }}>
      <div className="container header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="header-title-row" style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <a href="/">
            <h1 style={{ 
              fontSize: '22px', 
              fontWeight: 700, 
              letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, var(--accent-text-dark), var(--accent-color))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0
            }}>
              IMAS Song Familiarity
            </h1>
          </a>
          {status === 'authenticated' && session?.user && (
            <span className="header-greeting" style={{ fontSize: '14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Hi, <strong>{session.user.nickname || session.user.username}</strong>
            </span>
          )}
        </div>
        
        <div className="auth-nav" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a href="/" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
            🏠 首頁
          </a>
          <a href="/guess" className="btn" style={{ 
            padding: '6px 12px', 
            fontSize: '12px', 
            backgroundColor: '#8b5cf6', 
            color: 'white', 
            fontWeight: 'bold' 
          }}>
            🎵 猜歌遊戲
          </a>
          <a href="/kamisabi" className="btn" style={{ 
            padding: '6px 12px', 
            fontSize: '12px', 
            backgroundColor: '#db2777', 
            color: 'white', 
            fontWeight: 'bold' 
          }}>
            🎤 KAMISABI
          </a>
          
          {status === 'authenticated' && session?.user ? (
            <>
              <a href={`/playlist/${session.user.shareCode}`} target="_blank" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                📄 公開歌單
              </a>
              <a href="/collab" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                👥 共同歌單
              </a>
              <button 
                onClick={() => signOut({ callbackUrl: window.location.origin })} 
                className="btn btn-danger" 
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                登出
              </button>
            </>
          ) : (
            <button 
              onClick={() => signIn()} 
              className="btn btn-primary" 
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              登入
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
