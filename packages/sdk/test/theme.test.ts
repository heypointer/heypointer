// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { describe, expect, it } from 'vitest';
import { contrastProblems, contrastRatio } from '../src/contrast';
import { isCssColor, isCssLength, isFontFamily, sanitizeTheme, themeVars } from '../src/theme';

describe('isCssColor', () => {
  it.each(['#fff', '#FFFF', '#7c3aed', '#7c3aedcc', 'rebeccapurple', 'transparent', 'currentcolor', 'rgb(1, 2, 3)', 'rgb(1 2 3 / 50%)', 'rgba(0,0,0,.5)', 'hsl(210 40% 20%)', 'oklch(0.7 0.1 250)', 'color-mix(in srgb, red 50%, blue)', 'var(--brand)'])(
    'accepts %s', (v) => expect(isCssColor(v)).toBe(true));
  it.each([
    'red; background: url(//evil)', 'red}', '{red', 'url(http://evil/x.png)', 'URL(x)', 'expression(alert(1))', 'red /* c */', '@import "x"', 'red\nblue', 'red\\00', '"red"', "'red'",
    'javascript:alert(1)', '<script>', 'image-set(x 1x)', 'var(--a, url(x))', 'var(--a); x', '', '   ', 'a'.repeat(200), 'rgb(1,2,3);', 'calc(1px+2px)',
  ])('rejects %j', (v) => expect(isCssColor(v)).toBe(false));
  it('rejects non-strings', () => {
    for (const v of [undefined, null, 5, {}, [], true]) expect(isCssColor(v)).toBe(false);
  });
});

describe('length and font validators', () => {
  it('accepts plain lengths only', () => {
    for (const v of ['0px', '12px', '1.5rem', '8em']) expect(isCssLength(v)).toBe(true);
    for (const v of ['12', '12px; x', 'calc(1px)', 'url(x)', '-4px', '1e3px', 'auto']) expect(isCssLength(v)).toBe(false);
  });
  it('accepts font-family lists only', () => {
    for (const v of ['Inter, system-ui, sans-serif', '"Noto Sans", sans-serif', "'Segoe UI', Arial"]) expect(isFontFamily(v)).toBe(true);
    for (const v of ['Inter; color: red', 'x}', 'url(x)', 'a\\b', 'x/*', '']) expect(isFontFamily(v)).toBe(false);
  });
});

describe('sanitizeTheme', () => {
  it('keeps valid entries and drops invalid ones with a reason', () => {
    const { theme, problems } = sanitizeTheme({ accent: '#7c3aed', fg: 'red; x: y', bg: 'url(x)', radius: '8px', font: 'Inter, sans-serif', fontSize: 'big', nope: '#fff', dark: { bg: '#000', accent: '}' } });
    expect(theme).toEqual({ accent: '#7c3aed', radius: '8px', font: 'Inter, sans-serif', dark: { bg: '#000' } });
    expect(problems.join('|')).toMatch(/fg is not a plain CSS color/);
    expect(problems.join('|')).toMatch(/unknown key "nope"/);
    expect(problems.join('|')).toMatch(/fontSize/);
  });
  it('survives non-objects and prototype keys', () => {
    expect(sanitizeTheme('x').theme).toEqual({});
    expect(sanitizeTheme([1]).theme).toEqual({});
    expect(sanitizeTheme(undefined)).toEqual({ theme: {}, problems: [] });
    expect(sanitizeTheme(JSON.parse('{"__proto__": {"accent": "red"}}')).theme).toEqual({});
  });
});

describe('themeVars', () => {
  it('maps keys to the public custom properties', () => {
    expect(themeVars({ accent: '#111', accentFg: '#fff', warnBorder: '#222', errBg: '#333', radius: '4px', font: 'Inter', fontSize: '15px', dark: { accent: '#aaa', errBorder: '#bbb' } })).toEqual({
      '--hp-accent': '#111', '--hp-accent-fg': '#fff', '--hp-warn-border': '#222', '--hp-err-bg': '#333',
      '--hp-dark-accent': '#aaa', '--hp-dark-err-border': '#bbb', '--hp-radius': '4px', '--hp-font': 'Inter', '--hp-font-size': '15px',
    });
    expect(themeVars({})).toEqual({});
  });
});

describe('contrast helper', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#fff')).toBeGreaterThan(4.5);
    expect(contrastRatio('#777777', '#fff')).toBeLessThan(4.5);
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255 255 255)')).toBeCloseTo(21, 0);
  });
  it('returns null for colors it cannot read (named, hsl, var, translucent)', () => {
    expect(contrastRatio('red', '#fff')).toBeNull();
    expect(contrastRatio('hsl(0 0% 0%)', '#fff')).toBeNull();
    expect(contrastRatio('var(--x)', '#fff')).toBeNull();
    expect(contrastRatio('#00000080', '#fff')).toBeNull();
  });
  it('warns about a custom pair below 4.5:1 and stays quiet otherwise', () => {
    expect(contrastProblems({ accent: '#ffff00' }, 'light').join('|')).toMatch(/accentFg on accent \(light\) has contrast 1\.0\d:1/);
    expect(contrastProblems({ accent: '#7c3aed', accentFg: '#fff' }, 'light')).toEqual([]);
    expect(contrastProblems({}, 'auto')).toEqual([]);
    expect(contrastProblems({ fg: '#ccc', bg: '#fff' }, 'light')).toHaveLength(1);
  });
  it('checks the dark scheme with its own values and never reuses a light surface there', () => {
    // A light bg in `theme.bg` is not used in dark mode, so only the dark pair is judged.
    expect(contrastProblems({ bg: '#ffffff', fg: '#ffffff' }, 'dark')).toEqual([]);
    expect(contrastProblems({ dark: { bg: '#111111', fg: '#222222' } }, 'dark')).toHaveLength(1);
    expect(contrastProblems({ accent: '#7c3aed' }, 'dark')).toHaveLength(1); // custom accent over the dark accentFg default
  });
});
