import { useId } from "react";

// Examora's mark: the shield, mortarboard and "E" on the dark badge (public/examora-logo.svg without the wordmark).
// Ids are made unique per use, since the mark can appear several times on one page.
export function LogoMark({ className = "size-9" }: { className?: string }) {
  const p = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${p}${name})`;
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${p}bg`} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#0b1326" />
          <stop offset="100%" stopColor="#060e20" />
        </radialGradient>
        <linearGradient id={`${p}primary`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id={`${p}cyan`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={`${p}emerald`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id={`${p}glass`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
        </linearGradient>
        <filter id={`${p}soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id={`${p}neon`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="18" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="512" height="512" rx="104" fill={ref("bg")} />
      <rect width="508" height="508" x="2" y="2" rx="102" fill="none" stroke="#31394d" strokeWidth="6" strokeOpacity="0.8" />
      <ellipse cx="256" cy="235" rx="110" ry="100" fill="#6366f1" opacity="0.22" filter={ref("soft")} />
      <ellipse cx="256" cy="235" rx="70" ry="60" fill="#38bdf8" opacity="0.18" filter={ref("soft")} />
      <path
        d="M 256,92 L 378,160 L 378,285 C 378,358 256,418 256,418 C 256,418 134,358 134,285 L 134,160 Z"
        fill="none"
        stroke={ref("cyan")}
        strokeWidth="8"
        strokeOpacity="0.45"
        strokeLinejoin="round"
      />
      <polygon points="256,122 360,178 256,234 152,178" fill={ref("primary")} filter={ref("neon")} />
      <polygon points="256,122 360,178 256,234 152,178" fill={ref("glass")} />
      <polygon points="256,162 274,178 256,194 238,178" fill="#ffffff" opacity="0.95" />
      <path d="M 172,198 L 214,222 L 214,332 L 172,308 Z" fill={ref("primary")} opacity="0.95" />
      <path d="M 172,198 L 214,222 L 214,332 L 172,308 Z" fill={ref("glass")} />
      <path d="M 230,248 L 332,248 L 316,276 L 230,276 Z" fill={ref("cyan")} />
      <path d="M 172,328 L 256,375 L 344,326 L 344,354 L 256,403 L 172,356 Z" fill={ref("primary")} />
      <path d="M 230,360 L 256,375 L 282,360 L 256,403 Z" fill={ref("emerald")} opacity="0.9" />
      <path d="M 360,178 C 368,214 366,242 376,268" fill="none" stroke={ref("cyan")} strokeWidth="6" strokeLinecap="round" strokeDasharray="6 8" />
      <circle cx="376" cy="272" r="7" fill="#38bdf8" />
    </svg>
  );
}
