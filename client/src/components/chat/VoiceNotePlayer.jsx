import { useState, useRef, useEffect } from 'react';
import { IconPlay, IconPause } from '../common/Icons';
import { resolveMediaUrl } from '../../services/api';

// Pre-generated static bar patterns for waveform visualization
const BAR_HEIGHTS = [
  35, 60, 45, 80, 55, 90, 70, 40, 65, 85, 100, 75,
  50, 95, 60, 40, 80, 65, 90, 45, 70, 55, 35, 60
];

export default function VoiceNotePlayer({ mediaUrl, duration = 0, isSender = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef(null);

  const fullAudioUrl = resolveMediaUrl(mediaUrl);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Audio play error:', err);
      });
    }
  };

  const handleSeek = (index) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const seekRatio = index / BAR_HEIGHTS.length;
    const targetTime = seekRatio * totalDuration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const cycleSpeed = () => {
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressRatio = totalDuration > 0 ? currentTime / totalDuration : 0;
  const activeBarIndex = Math.floor(progressRatio * BAR_HEIGHTS.length);

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      background: isSender ? 'rgba(88, 101, 242, 0.15)' : 'var(--bg-subtle)',
      border: '1px solid',
      borderColor: isSender ? 'rgba(88, 101, 242, 0.35)' : 'var(--border-medium)',
      padding: '8px 14px',
      borderRadius: 16,
      minWidth: 260,
      maxWidth: 340,
      userSelect: 'none',
    }}>
      <audio ref={audioRef} src={fullAudioUrl} preload="metadata" />

      {/* Play / Pause Circular Button */}
      <button
        onClick={togglePlay}
        className="btn btn-circle"
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          background: isSender ? 'var(--discord-blurple)' : 'var(--border-strong)',
          color: '#ffffff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          transition: 'transform 0.15s ease',
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <IconPause size={15} /> : <IconPlay size={15} />}
      </button>

      {/* Waveform Visualization Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: 24,
          cursor: 'pointer',
        }}>
          {BAR_HEIGHTS.map((heightPercent, idx) => {
            const isPlayed = idx <= activeBarIndex;
            return (
              <div
                key={idx}
                onClick={() => handleSeek(idx)}
                style={{
                  flex: 1,
                  height: `${heightPercent}%`,
                  background: isPlayed
                    ? (isSender ? 'var(--discord-blurple)' : 'var(--discord-green)')
                    : 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 2,
                  transition: 'background 0.1s ease',
                }}
              />
            );
          })}
        </div>

        {/* Timers & Playback Speed */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{formatSeconds(isPlaying ? currentTime : totalDuration)}</span>
          <button
            onClick={cycleSpeed}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: 8,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-normal)',
              cursor: 'pointer',
            }}
            title="Playback Speed"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
