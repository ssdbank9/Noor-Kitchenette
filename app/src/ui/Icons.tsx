// Inline stroke icons (no icon font, so they work offline and take the text colour).
type IconProps = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const HomeIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const CalendarIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
export const PantryIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M3 15h18" /></svg>
);
export const CartIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" /></svg>
);
export const ChartIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const CameraIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
);
export const PotIcon = ({ size = 36 }: IconProps) => (
  <svg {...base(size)} strokeWidth={1.6}><path d="M3 11h18" /><path d="M5 11v5a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-5" /><path d="M1 11h2M21 11h2" /><path d="M9 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5" /></svg>
);
export const ForkKnifeIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}><path d="M3 2v7a3 3 0 0 0 3 3v10M9 2v7a3 3 0 0 1-3 3M6 2v5" /><path d="M18 22V2c-2.5 1-4 4-4 8v3h4" /></svg>
);
export const GearIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
