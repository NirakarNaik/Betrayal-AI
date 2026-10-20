import type { PersonalityId } from "@/game/types";

/** Distinct SVG emblem per personality. The human player gets a neutral visor. */
const EMBLEMS: Record<PersonalityId | "human", React.ReactNode> = {
  chessmaster: (
    <path d="M18 14h4v3h3v-3h4v3h3v-3h4v7l-3 3v9l3 3v3H18v-3l3-3v-9l-3-3z" />
  ),
  snake: (
    <path d="M36 16c-6-4-16-2-16 5 0 6 14 4 14 10 0 5-8 7-14 3l-2 3c7 5 20 3 20-6 0-7-14-5-14-10 0-4 7-5 11-2z" />
  ),
  politician: (
    <path d="M27 12l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1-7.2-3.8-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2zM17 38h20v3H17z" />
  ),
  chaos_gremlin: (
    <path d="M27 11l3 9 8-5-4 9 9 2-9 3 5 8-9-4-3 9-3-9-9 4 5-8-9-3 9-2-4-9 8 5z" />
  ),
  quant: (
    <path d="M17 14h20v4H23.5l7 8-7 9H37v4H17v-3l8-10-8-9z" />
  ),
  human: (
    <path d="M27 13c-6.6 0-11 4.6-11 11v4c0 2 1 3 3 3h16c2 0 3-1 3-3v-4c0-6.4-4.4-11-11-11zm-7 11h14v3H20zM21 34h12l-2 6h-8z" />
  ),
};

export function AgentAvatar({
  personalityId,
  color,
  size = 56,
  eliminated = false,
  label,
}: {
  personalityId: PersonalityId | null;
  color: string;
  size?: number;
  eliminated?: boolean;
  label: string;
}) {
  const key = personalityId ?? "human";
  return (
    <svg width={size} height={size} viewBox="0 0 54 54" role="img" aria-label={label} className={eliminated ? "grayscale opacity-60" : ""}>
      <defs>
        <linearGradient id={`g-${key}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points="27,2 49,14.5 49,39.5 27,52 5,39.5 5,14.5" fill={`url(#g-${key})`} stroke={color} strokeWidth="1.5" />
      <polygon points="27,7 44.5,17 44.5,37 27,47 9.5,37 9.5,17" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="0.8" />
      <g fill={color}>{EMBLEMS[key]}</g>
      {eliminated && <line x1="8" y1="46" x2="46" y2="8" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}
