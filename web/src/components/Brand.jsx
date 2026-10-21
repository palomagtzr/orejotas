// Mascota y wordmark de Orejotas. Las formas vienen del SVG 04_isotipo_mascota.svg
// del kit de marca; solo se parametriza el tamaño.

export function Mascot({ size = 96, className = '', title = 'Orejotas' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 0.78}
      viewBox="-200 -150 400 310"
      role="img"
      aria-label={title}
    >
      <ellipse cx="-118" cy="-58" rx="78" ry="96" fill="#FFD600" transform="rotate(-18 -118 -58)" />
      <ellipse cx="118" cy="-58" rx="78" ry="96" fill="#FFD600" transform="rotate(18 118 -58)" />
      <path d="M-153 -100 Q-112 -77 -98 -25" fill="none" stroke="#1A1A2E" strokeWidth="13" strokeLinecap="round" />
      <path d="M153 -100 Q112 -77 98 -25" fill="none" stroke="#1A1A2E" strokeWidth="13" strokeLinecap="round" />
      <ellipse cx="0" cy="20" rx="115" ry="100" fill="#FFD600" />
      <ellipse cx="-38" cy="0" rx="38" ry="48" fill="#FFF4E5" stroke="#E6007E" strokeWidth="5" transform="rotate(10 -38 0)" />
      <ellipse cx="36" cy="8" rx="36" ry="46" fill="#FFF4E5" stroke="#E6007E" strokeWidth="5" transform="rotate(-7 36 8)" />
      <ellipse cx="-29" cy="7" rx="15" ry="25" fill="#1A1A2E" />
      <ellipse cx="43" cy="13" rx="14" ry="24" fill="#1A1A2E" />
      <path d="M-7 57 Q8 73 22 55" fill="none" stroke="#1A1A2E" strokeWidth="9" strokeLinecap="round" />
      <path d="M-18 -104 l-8 -23 M8 -111 l5 -22 M30 -101 l14 -18" stroke="#E6007E" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return <span className={`wordmark ${className}`}>orejotas</span>;
}
