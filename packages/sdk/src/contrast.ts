import type { ColorScheme, HeyPointerTheme } from './theme';

/** Development-time advice only. Imported behind the DEV flag, so shipped bundles do not contain it. */
/** Same defaults as styles.css, for the contrast warning only. */
const DEFAULTS = {
  light: { accent: '#087ea4', accentFg: '#fff', bg: '#fff', fg: '#172b3a' },
  dark: { accent: '#38bdf8', accentFg: '#082f49', bg: '#0f172a', fg: '#f1f5f9' },
} as const;

function parseColor(s: string | undefined): [number, number, number] | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    if (h.length === 8 && h.slice(6) !== 'ff') return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (fn) {
    const a = fn[4];
    if (a !== undefined && !(a === '1' || a === '100%')) return null;
    const rgb = [fn[1], fn[2], fn[3]].map(Number) as [number, number, number];
    return rgb.every((n) => n <= 255) ? rgb : null;
  }
  return null;
}
const lum = ([r, g, b]: [number, number, number]) => {
  const c = [r, g, b].map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

/** WCAG contrast ratio of two opaque hex or rgb() colors; null when either cannot be parsed (named colors, hsl, var()). */
export function contrastRatio(a: string, b: string): number | null {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return null;
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Messages for pairs a theme makes unreadable (below 4.5:1). Advice only: nothing is blocked or changed. */
export function contrastProblems(theme: HeyPointerTheme, scheme: ColorScheme): string[] {
  const out: string[] = [];
  const schemes: ('light' | 'dark')[] = scheme === 'auto' ? ['light', 'dark'] : [scheme];
  for (const s of schemes) {
    const d = DEFAULTS[s];
    const pick = (k: 'accent' | 'accentFg' | 'bg' | 'fg') => {
      const own = s === 'dark' ? theme.dark?.[k] : undefined;
      // Dark accents fall back to the light value, surfaces never do (see styles.css).
      const shared = s === 'dark' && (k === 'bg' || k === 'fg') ? undefined : theme[k];
      return { value: own ?? shared ?? d[k], custom: !!(own ?? shared) };
    };
    for (const [fg, bg, label] of [['accentFg', 'accent', 'accentFg on accent'], ['fg', 'bg', 'fg on bg']] as const) {
      const f = pick(fg);
      const b = pick(bg);
      if (!f.custom && !b.custom) continue;
      const ratio = contrastRatio(f.value, b.value);
      if (ratio !== null && ratio < 4.5) out.push(`${label} (${s}) has contrast ${ratio.toFixed(2)}:1, below the 4.5:1 WCAG AA minimum`);
    }
  }
  return out;
}
