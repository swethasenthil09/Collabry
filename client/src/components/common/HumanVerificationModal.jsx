import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconClose } from './Icons';

// Colorful puzzle background gradients
const PUZZLE_THEMES = [
  {
    name: 'Cyber Neon',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4338ca 70%, #6366f1 100%)',
    shapes: ['✦', '◆', '▲', '●', '✦'],
    accent: '#818cf8',
  },
  {
    name: 'Aurora Borealis',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 35%, #10b981 70%, #34d399 100%)',
    shapes: ['▲', '✦', '●', '◆', '▲'],
    accent: '#34d399',
  },
  {
    name: 'Cosmic Sunset',
    gradient: 'linear-gradient(135deg, #831843 0%, #be185d 35%, #f43f5e 70%, #fb7185 100%)',
    shapes: ['●', '◆', '✦', '▲', '●'],
    accent: '#fb7185',
  },
];

const SYMBOL_CHALLENGES = [
  {
    title: 'Find the unique icon',
    prompt: 'Tap the one symbol that does NOT match the others:',
    icons: ['🚀', '🚀', '🚀', '🛸', '🚀', '🚀'],
    correctIndex: 3,
  },
  {
    title: 'Spot the odd one out',
    prompt: 'Tap the symbol that is different:',
    icons: ['⚡', '⚡', '🔥', '⚡', '⚡', '⚡'],
    correctIndex: 2,
  },
  {
    title: 'Code Dev Security Check',
    prompt: 'Tap the coffee cup to prove human energy:',
    icons: ['💻', '💻', '☕', '💻', '💻', '💻'],
    correctIndex: 2,
  },
  {
    title: 'Security Pattern Check',
    prompt: 'Tap the golden star among circles:',
    icons: ['⚪', '⚪', '⚪', '⭐', '⚪', '⚪'],
    correctIndex: 3,
  },
];

export default function HumanVerificationModal({ isOpen, onClose, onSuccess, title = 'Security Verification', subtitle = 'Solve the puzzle to prove you are human' }) {
  const [mode, setMode] = useState('slider'); // 'slider' | 'symbols'
  const [themeIndex, setThemeIndex] = useState(0);
  const [targetX, setTargetX] = useState(160);
  const [sliderVal, setSliderVal] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'fail'
  const [failCount, setFailCount] = useState(0);

  // Symbol challenge state
  const [symbolIndex, setSymbolIndex] = useState(0);
  const [symbolFeedback, setSymbolFeedback] = useState('');

  const containerRef = useRef(null);

  // Reset challenge on open
  useEffect(() => {
    if (isOpen) {
      resetChallenge();
    }
  }, [isOpen]);

  const resetChallenge = () => {
    const randomX = Math.floor(Math.random() * 140) + 100; // Between 100px and 240px
    setTargetX(randomX);
    setSliderVal(0);
    setStatus('idle');
    setThemeIndex(Math.floor(Math.random() * PUZZLE_THEMES.length));
    setSymbolIndex(Math.floor(Math.random() * SYMBOL_CHALLENGES.length));
    setSymbolFeedback('');
  };

  if (!isOpen) return null;

  const currentTheme = PUZZLE_THEMES[themeIndex];
  const currentSymbol = SYMBOL_CHALLENGES[symbolIndex];

  // Calculate tolerance (6px window)
  const handleSliderRelease = () => {
    if (status === 'success') return;

    // Piece position corresponds to slider percentage across ~250px range
    const piecePosition = (sliderVal / 100) * 230 + 10;
    const diff = Math.abs(piecePosition - targetX);

    if (diff <= 12) {
      // Success!
      setStatus('success');
      setTimeout(() => {
        onSuccess?.();
      }, 700);
    } else {
      // Fail!
      setStatus('fail');
      setFailCount(c => c + 1);
      setTimeout(() => {
        setSliderVal(0);
        setStatus('idle');
        if (failCount >= 1) {
          // Switch to fresh challenge
          resetChallenge();
        }
      }, 800);
    }
  };

  const handleSymbolClick = (idx) => {
    if (status === 'success') return;
    if (idx === currentSymbol.correctIndex) {
      setStatus('success');
      setSymbolFeedback('Correct! Human verified ✨');
      setTimeout(() => {
        onSuccess?.();
      }, 700);
    } else {
      setStatus('fail');
      setSymbolFeedback('Incorrect symbol, try again!');
      setTimeout(() => {
        setStatus('idle');
        setSymbolFeedback('');
        setSymbolIndex((symbolIndex + 1) % SYMBOL_CHALLENGES.length);
      }, 800);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 99999,
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        padding: 16,
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: 420,
          width: '92%',
          background: 'var(--bg-card, #1e1f22)',
          border: '1px solid var(--border-medium, #2b2d31)',
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-heading, #fff)' }}>
                {title}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #949ba4)' }}>
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Challenge Selection Pills */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}>
          <button
            type="button"
            onClick={() => { setMode('slider'); resetChallenge(); }}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'slider' ? 'var(--discord-blurple, #5865F2)' : 'transparent',
              color: mode === 'slider' ? '#fff' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            🧩 Jigsaw Slide
          </button>
          <button
            type="button"
            onClick={() => { setMode('symbols'); resetChallenge(); }}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: mode === 'symbols' ? 'var(--discord-blurple, #5865F2)' : 'transparent',
              color: mode === 'symbols' ? '#fff' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            🔍 Spot Difference
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {mode === 'slider' ? (
            <div>
              {/* Puzzle Stage Area */}
              <div
                ref={containerRef}
                style={{
                  position: 'relative',
                  height: 160,
                  borderRadius: 12,
                  background: currentTheme.gradient,
                  overflow: 'hidden',
                  border: status === 'success' ? '2px solid #22c55e' : status === 'fail' ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.4)',
                  transition: 'border-color 0.3s ease',
                  userSelect: 'none',
                }}
              >
                {/* Background Grid Pattern & Shapes */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.15, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                
                <div style={{ position: 'absolute', top: 18, left: 24, fontSize: 32, opacity: 0.35, color: '#fff' }}>
                  {currentTheme.shapes[0]}
                </div>
                <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 38, opacity: 0.3, color: '#fff' }}>
                  {currentTheme.shapes[1]}
                </div>
                <div style={{ position: 'absolute', top: 30, right: 60, fontSize: 24, opacity: 0.25, color: '#fff' }}>
                  {currentTheme.shapes[2]}
                </div>

                {/* Target Slot (Missing Notch) */}
                <div
                  style={{
                    position: 'absolute',
                    top: 55,
                    left: targetX,
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.65)',
                    border: '2px dashed rgba(255, 255, 255, 0.6)',
                    boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 16, opacity: 0.4 }}>🧩</span>
                </div>

                {/* Movable Puzzle Piece */}
                <div
                  style={{
                    position: 'absolute',
                    top: 55,
                    left: (sliderVal / 100) * 230 + 10,
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: currentTheme.accent,
                    boxShadow: status === 'success'
                      ? '0 0 20px #22c55e, 0 4px 12px rgba(0,0,0,0.5)'
                      : '0 4px 14px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.4)',
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 20,
                    transform: status === 'fail' ? 'rotate(-6deg)' : status === 'success' ? 'scale(1.05)' : 'none',
                    transition: isDragging ? 'none' : 'transform 0.2s, box-shadow 0.2s',
                  }}
                >
                  {status === 'success' ? <IconCheck size={22} /> : '🧩'}
                </div>

                {/* Status Overlay */}
                {status === 'success' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(34, 197, 94, 0.25)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 15,
                      gap: 8,
                    }}
                  >
                    <span>Verification Complete!</span>
                  </div>
                )}
              </div>

              {/* Slider Track */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  <span>{status === 'fail' ? '❌ Missed target! Try again' : status === 'success' ? '✅ Verified!' : 'Slide piece into target slot'}</span>
                  <button
                    type="button"
                    onClick={resetChallenge}
                    style={{ background: 'none', border: 'none', color: 'var(--discord-blurple, #5865F2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                <div
                  style={{
                    position: 'relative',
                    height: 42,
                    background: 'var(--bg-subtle, rgba(255,255,255,0.06))',
                    borderRadius: 24,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    border: '1px solid var(--border-medium, rgba(255,255,255,0.1))',
                  }}
                >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderVal}
                    disabled={status === 'success'}
                    onMouseDown={() => setIsDragging(true)}
                    onTouchStart={() => setIsDragging(true)}
                    onMouseUp={() => { setIsDragging(false); handleSliderRelease(); }}
                    onTouchEnd={() => { setIsDragging(false); handleSliderRelease(); }}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    style={{
                      width: '100%',
                      cursor: status === 'success' ? 'default' : 'grab',
                      accentColor: status === 'success' ? '#22c55e' : 'var(--discord-blurple, #5865F2)',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Symbol Difference Game */}
              <div
                style={{
                  background: 'var(--bg-subtle, rgba(255,255,255,0.04))',
                  borderRadius: 12,
                  padding: 18,
                  border: '1px solid var(--border-medium, rgba(255,255,255,0.08))',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading, #fff)', marginBottom: 6 }}>
                  {currentSymbol.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #949ba4)', marginBottom: 16 }}>
                  {currentSymbol.prompt}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    maxWidth: 240,
                    margin: '0 auto',
                  }}
                >
                  {currentSymbol.icons.map((icon, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSymbolClick(idx)}
                      disabled={status === 'success'}
                      style={{
                        height: 56,
                        fontSize: 26,
                        background: 'var(--bg-primary, rgba(255,255,255,0.06))',
                        border: '1px solid var(--border-medium, rgba(255,255,255,0.12))',
                        borderRadius: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.1s, background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {icon}
                    </button>
                  ))}
                </div>

                {symbolFeedback && (
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 12,
                      fontWeight: 700,
                      color: status === 'success' ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {symbolFeedback}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--text-muted, #949ba4)',
            }}
          >
            <span>🔒 Anti-Bot Protection</span>
            <span>Collabry Guard</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
