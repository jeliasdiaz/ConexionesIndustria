import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../config/app.ts';
import { institutional, ui } from '../../config/brand.ts';

// WCAG 2.x: luminancia relativa y razón de contraste.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('paleta', () => {
  it('HEX coincide con el RGB declarado', () => {
    for (const c of Object.values(institutional)) {
      const rgb = [1, 3, 5].map((i) => Number.parseInt(c.hex.slice(i, i + 2), 16));
      expect(rgb, c.name).toEqual([...c.rgb]);
    }
  });

  it('los tokens cumplen WCAG AA (≥ 4,5:1) para texto', () => {
    const t = ui;
    for (const bg of [t.surface, t.canvas, t.surfaceMuted]) {
      expect(contrast(t.ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.inkSoft, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.inkMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.link, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.danger, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t.primary, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onPrimary, t.primaryHover)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.link, t.primarySubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.success, t.successSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.warning, t.warningSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.danger, t.dangerSubtle)).toBeGreaterThanOrEqual(4.5);
  });

  it('los bordes de los campos y el foco se distinguen del fondo (≥ 3:1, WCAG 1.4.11)', () => {
    for (const bg of [ui.surface, ui.canvas]) {
      expect(contrast(ui.borderStrong, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(ui.focus, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('el amarillo institucional no sirve como texto sobre blanco', () => {
    expect(contrast(institutional.oakYellow.hex, '#FFFFFF')).toBeLessThan(3);
  });
});

describe('APP_NAME (D17)', () => {
  it('es el nombre público acordado', () => {
    expect(APP_NAME).toBe('Conexiones con la Industria');
  });
});
