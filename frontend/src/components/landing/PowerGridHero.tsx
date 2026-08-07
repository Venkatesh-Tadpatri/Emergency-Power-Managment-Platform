/** Original SVG illustration — a stylized transmission grid + circuit pattern,
 * no external image dependency. Purely decorative, so it's aria-hidden.
 */
export function PowerGridHero() {
  return (
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#7dd3fc" strokeOpacity="0.08" strokeWidth="1" />
        </pattern>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1a3a" stopOpacity="0" />
          <stop offset="100%" stopColor="#0b1a3a" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <rect width="800" height="900" fill="url(#grid)" />

      {/* Transmission lines between towers */}
      <g stroke="#7dd3fc" strokeOpacity="0.35" strokeWidth="1.5" fill="none">
        <path d="M60,560 C220,500 260,540 420,480" />
        <path d="M60,600 C220,540 260,580 420,520" />
        <path d="M420,480 C560,430 620,470 760,420" />
        <path d="M420,520 C560,470 620,510 760,460" />
      </g>

      {/* Pulse dots traveling the lines */}
      <circle r="3.5" fill="#38bdf8">
        <animateMotion dur="4s" repeatCount="indefinite" path="M60,560 C220,500 260,540 420,480 C560,430 620,470 760,420" />
      </circle>
      <circle r="3" fill="#67e8f9" opacity="0.8">
        <animateMotion dur="5.5s" begin="1s" repeatCount="indefinite" path="M60,600 C220,540 260,580 420,520 C560,470 620,510 760,460" />
      </circle>

      {/* Transmission towers (simplified lattice pylons) */}
      {[
        { x: 60, y: 560, s: 0.9 },
        { x: 420, y: 480, s: 1.15 },
        { x: 760, y: 420, s: 1 },
      ].map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`} stroke="#a5c8e8" strokeOpacity="0.55" strokeWidth="2" fill="none">
          <path d="M0,-120 L-34,40 M0,-120 L34,40 M-22,-30 L22,-30 M-27,0 L27,0 M-31,20 L31,20 M-16,-70 L16,-70 M-34,40 L-46,40 M34,40 L46,40" />
          <path d="M-46,40 L-46,52 M46,40 L46,52" strokeWidth="3" />
        </g>
      ))}

      {/* Hospital / facility block silhouette, bottom-right, tying it to the domain */}
      <g transform="translate(560,620)" fill="#0e7490" fillOpacity="0.35">
        <rect x="0" y="40" width="160" height="110" rx="2" />
        <rect x="30" y="0" width="60" height="40" rx="2" />
        <rect x="16" y="60" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="48" y="60" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="80" y="60" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="112" y="60" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="16" y="94" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="48" y="94" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="80" y="94" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <rect x="112" y="94" width="18" height="18" fill="#0b1a3a" fillOpacity="0.4" />
        <path d="M52 20 h8 v8 h8 v6 h-8 v8 h-8 v-8 h-8 v-6 h8 z" fill="#eaf1fb" fillOpacity="0.7" />
      </g>

      {/* Standby generator block, foreground */}
      <g transform="translate(160,700)" fill="#0b1a3a" fillOpacity="0.5">
        <rect x="0" y="20" width="130" height="70" rx="4" />
        <rect x="10" y="0" width="30" height="24" rx="2" />
        <circle cx="30" cy="55" r="16" fill="none" stroke="#7dd3fc" strokeOpacity="0.6" strokeWidth="3" />
        <circle cx="30" cy="55" r="4" fill="#7dd3fc" fillOpacity="0.6" />
        <rect x="60" y="42" width="55" height="26" rx="2" fill="#0e2a52" />
      </g>

      <rect width="800" height="900" fill="url(#fade)" />
    </svg>
  );
}
