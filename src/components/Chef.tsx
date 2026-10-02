import { useId } from 'react'

/** Radixo's friendly chef: flat vector, holding a covered dish with steam. Sized by its container. */
export function Chef({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 376 380" className={className} role="img" aria-label="Radixo chef presenting a hot dish">
      <defs>
        <linearGradient id={`${id}-coat`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fbf8f2" />
          <stop offset="0.62" stopColor="#f3eee5" />
          <stop offset="1" stopColor="#d9d2c6" />
        </linearGradient>
        <linearGradient id={`${id}-dome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f7f9" />
          <stop offset="0.55" stopColor="#c9d2d9" />
          <stop offset="1" stopColor="#8f9aa4" />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6cba4" />
          <stop offset="1" stopColor="#e8ab7f" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor="#c9341c" stopOpacity="0.38" />
          <stop offset="1" stopColor="#c9341c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="170" cy="210" r="170" fill={`url(#${id}-glow)`} />

      {/* body */}
      <path d="M52 380 V318 C52 268 78 240 124 232 H216 C262 240 288 268 288 318 V380 Z" fill={`url(#${id}-coat)`} />
      <path d="M170 246 V380" stroke="#d3ccbf" strokeWidth="2" />
      <circle cx="152" cy="296" r="5" fill="#cfc7b8" />
      <circle cx="152" cy="330" r="5" fill="#cfc7b8" />
      <circle cx="188" cy="296" r="5" fill="#cfc7b8" />
      <circle cx="188" cy="330" r="5" fill="#cfc7b8" />
      {/* neckerchief */}
      <path d="M134 230 L170 276 L206 230 C190 242 150 242 134 230 Z" fill="#d63a2b" />
      <path d="M152 236 L170 276 L188 236 Z" fill="#b82c1c" />

      {/* neck + head */}
      <rect x="152" y="206" width="36" height="34" rx="14" fill="#dfa176" />
      <ellipse cx="110" cy="170" rx="11" ry="14" fill={`url(#${id}-skin)`} />
      <ellipse cx="230" cy="170" rx="11" ry="14" fill={`url(#${id}-skin)`} />
      <ellipse cx="170" cy="166" rx="58" ry="62" fill={`url(#${id}-skin)`} />
      <circle cx="136" cy="190" r="11" fill="#e0775a" opacity="0.28" />
      <circle cx="204" cy="190" r="11" fill="#e0775a" opacity="0.28" />

      {/* face */}
      <path d="M132 148 Q146 138 158 146" fill="none" stroke="#3a2418" strokeWidth="5" strokeLinecap="round" />
      <path d="M182 146 Q194 138 208 148" fill="none" stroke="#3a2418" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="146" cy="162" rx="5" ry="6.5" fill="#2a1a14" />
      <ellipse cx="194" cy="162" rx="5" ry="6.5" fill="#2a1a14" />
      <circle cx="148" cy="160" r="1.8" fill="#fff" />
      <circle cx="196" cy="160" r="1.8" fill="#fff" />
      <path d="M170 168 Q164 182 171 184" fill="none" stroke="#c98b63" strokeWidth="3" strokeLinecap="round" />
      <path d="M170 193 C156 182 130 188 124 204 C142 214 160 208 170 200 C180 208 198 214 216 204 C210 188 184 182 170 193 Z" fill="#35211a" />
      <path d="M154 214 Q170 228 186 214" fill="none" stroke="#9c4a35" strokeWidth="4.5" strokeLinecap="round" />

      {/* toque */}
      <g>
        <circle cx="124" cy="86" r="30" fill="#fff" />
        <circle cx="216" cy="86" r="30" fill="#fff" />
        <circle cx="170" cy="66" r="38" fill="#fff" />
        <rect x="116" y="84" width="108" height="42" rx="8" fill="#fff" />
        <rect x="116" y="112" width="108" height="16" rx="6" fill="#ece6dc" />
        <path d="M132 70 C140 60 148 58 156 62 M196 62 C204 58 212 60 218 70" fill="none" stroke="#e4ddd0" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* raised arm + covered dish */}
      <path d="M262 290 C292 282 304 262 306 240" fill="none" stroke={`url(#${id}-coat)`} strokeWidth="38" strokeLinecap="round" />
      <ellipse cx="306" cy="236" rx="17" ry="14" fill={`url(#${id}-skin)`} />
      <ellipse cx="306" cy="226" rx="56" ry="9" fill="#aab4bd" />
      <ellipse cx="306" cy="223" rx="56" ry="8" fill="#dfe5ea" />
      <path d="M262 221 C262 168 288 152 306 152 C324 152 350 168 350 221 Z" fill={`url(#${id}-dome)`} />
      <path d="M276 210 C278 182 292 168 306 166" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
      <circle cx="306" cy="148" r="7" fill="#c3ccd3" />

      {/* steam */}
      <g fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.55">
        {[286, 306, 326].map((x, i) => (
          <path key={x} className="chef-steam" style={{ animationDelay: `${i * 0.5}s` }} d={`M${x} 134 c-7 -9 7 -15 0 -25 s7 -15 0 -25`} />
        ))}
      </g>
    </svg>
  )
}
