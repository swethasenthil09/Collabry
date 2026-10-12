export default function CollabryLogo({ size = 36, showText = false, textClassName = '', className = '' }) {
  return (
    <div
      className={`collabry-brand-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: showText ? '10px' : '0', textDecoration: 'none' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="collabry_grad_primary" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5865F2" />
            <stop offset="55%" stopColor="#7952F5" />
            <stop offset="100%" stopColor="#FF4500" />
          </linearGradient>
          <linearGradient id="collabry_grad_accent" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF5722" />
            <stop offset="100%" stopColor="#FF8A00" />
          </linearGradient>
          <filter id="logo_glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#5865F2" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Outer stylized interconnected 'C' & Collaboration Loop */}
        <path
          d="M34 11.5C30.2 8.5 25.4 7 20 7.5C11.8 8.3 5.3 15.2 5 23.5C4.7 32.5 12 40 21 40C27.5 40 33.1 36.1 35.5 30.5"
          stroke="url(#collabry_grad_primary)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Discord/Reddit fusion dialogue node inside */}
        <path
          d="M20 16C15.6 16 12 19.4 12 23.6C12 26.2 13.4 28.5 15.6 29.8L14.8 33.5L18.8 31.8C19.2 31.9 19.6 32 20 32C24.4 32 28 28.6 28 24.4C28 20.2 24.4 16 20 16Z"
          fill="url(#collabry_grad_primary)"
          fillOpacity="0.22"
          stroke="url(#collabry_grad_primary)"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />

        {/* Dynamic Project Spark / Collaborator Node (Top Right) */}
        <circle cx="36" cy="14" r="5.5" fill="url(#collabry_grad_accent)" filter="url(#logo_glow)" />
        <path
          d="M36 11.8V16.2M33.8 14H38.2"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Chat / Connection bridge sparks */}
        <circle cx="18" cy="23.5" r="1.8" fill="#FFFFFF" />
        <circle cx="23" cy="23.5" r="1.8" fill="#FFFFFF" />
      </svg>

      {showText && (
        <span
          className={`collabry-brand-text ${textClassName}`}
          style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontWeight: 800,
            fontSize: size * 0.58,
            letterSpacing: '-0.035em',
            color: '#F2F3F5',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Collab<span style={{ color: '#FF4500' }}>ry</span>
        </span>
      )}
    </div>
  );
}
