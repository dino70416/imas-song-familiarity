import React, { useState, useEffect } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';

interface YoutubePlayerProps {
  videoId: string;
  showVideo: boolean;
  onReady?: YouTubeProps['onReady'];
  onEnd?: YouTubeProps['onEnd'];
  onError?: YouTubeProps['onError'];
}

export default function YoutubePlayer({
  videoId,
  showVideo,
  onReady,
  onEnd,
  onError,
}: YoutubePlayerProps) {
  const [player, setPlayer] = useState<any>(null);
  const [playerState, setPlayerState] = useState<number>(-1);
  const [showPlayButton, setShowPlayButton] = useState(false);

  useEffect(() => {
    // If the video is not playing (1) or buffering (3) for a while, show the play button.
    // This helps bypass Safari's autoplay block.
    if (player && playerState !== 1 && playerState !== 3) {
      const timer = setTimeout(() => {
        setShowPlayButton(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowPlayButton(false);
    }
  }, [player, playerState]);

  const handleReady = (event: any) => {
    setPlayer(event.target);
    setPlayerState(event.target.getPlayerState());
    if (onReady) onReady(event);
    
    // Attempt to play immediately
    event.target.playVideo();
  };

  const handleStateChange = (event: any) => {
    setPlayerState(event.data);
  };

  const handleManualPlay = () => {
    if (player) {
      player.playVideo();
    }
  };

  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: showVideo ? 1 : 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
    },
  };

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', backgroundColor: 'black' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-custom {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      ` }} />
      {/* 遮罩層：完全蓋住 YouTube 影片，避免透出任何文字或標題 */}
      {!showVideo && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.9), rgba(88, 28, 135, 0.9))', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          
          {showPlayButton ? (
            <button 
              onClick={handleManualPlay}
              className="btn btn-primary"
              style={{ 
                padding: '16px 32px', 
                fontSize: '20px', 
                borderRadius: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                boxShadow: '0 8px 24px rgba(168, 85, 247, 0.4)' 
              }}
            >
              <svg style={{ width: '28px', height: '28px' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              手動播放音樂
            </button>
          ) : (
            <div style={{ color: 'white', fontSize: '1.25rem', fontWeight: 'bold', letterSpacing: '0.1em', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg style={{ width: '64px', height: '64px', marginBottom: '16px', color: '#d8b4fe', opacity: 0.8 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
              <span style={{ animation: 'pulse-custom 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>請仔細聽...</span>
            </div>
          )}

        </div>
      )}
      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        onEnd={onEnd}
        onError={onError}
        className="youtube-container"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: !showVideo ? 'none' : 'auto' }}
        iframeClassName="w-full h-full"
      />
    </div>
  );
}
