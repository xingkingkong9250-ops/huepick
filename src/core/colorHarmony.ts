import { HSL, HarmonyRule, HarmonyScheme, RGB } from './types';

/**
 * 配色规则模块
 *
 * 基于提取出的第一主色，按经典色彩理论生成配色方案：
 *   - complementary      互补色（+180°）
 *   - analogous          类似色（±30°）
 *   - triadic            三原色（+120°/+240°）
 *   - splitComplementary 分裂互补（+150°/+210°）
 *   - monochromatic      单色（同色相不同明度/饱和度）
 *
 * 所有计算在 HSL 空间完成，再转回 RGB。
 */

/** RGB → HSL */
export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  h *= 60;

  return { h, s, l };
}

/** HSL → RGB */
export function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = ((h % 360) + 360) % 360 / 360;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hueToRgb = (t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  return {
    r: Math.round(hueToRgb(hn + 1 / 3) * 255),
    g: Math.round(hueToRgb(hn) * 255),
    b: Math.round(hueToRgb(hn - 1 / 3) * 255),
  };
}

/** 色相旋转 */
function rotateHue(hsl: HSL, degrees: number): HSL {
  return { ...hsl, h: (((hsl.h + degrees) % 360) + 360) % 360 };
}

/** 钳制到 0~1 */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const RULE_LABELS: Record<HarmonyRule, string> = {
  complementary: '互补色',
  analogous: '类似色',
  triadic: '三原色',
  splitComplementary: '分裂互补',
  monochromatic: '单色系',
};

/**
 * 基于基准色生成一组配色方案
 *
 * @param base 基准色（通常取第一主色）
 * @param rules 要生成的规则集合，默认全部
 */
export function generateHarmonies(
  base: RGB,
  rules: HarmonyRule[] = ['complementary', 'analogous', 'triadic', 'splitComplementary', 'monochromatic']
): HarmonyScheme[] {
  const hsl = rgbToHsl(base);
  const schemes: HarmonyScheme[] = [];

  for (const rule of rules) {
    let hslList: HSL[];
    switch (rule) {
      case 'complementary':
        hslList = [hsl, rotateHue(hsl, 180)];
        break;
      case 'analogous':
        hslList = [rotateHue(hsl, -30), hsl, rotateHue(hsl, 30)];
        break;
      case 'triadic':
        hslList = [hsl, rotateHue(hsl, 120), rotateHue(hsl, 240)];
        break;
      case 'splitComplementary':
        hslList = [hsl, rotateHue(hsl, 150), rotateHue(hsl, 210)];
        break;
      case 'monochromatic':
        hslList = [
          { h: hsl.h, s: clamp01(hsl.s * 0.5), l: clamp01(hsl.l * 1.4) },
          hsl,
          { h: hsl.h, s: clamp01(hsl.s), l: clamp01(hsl.l * 0.6) },
        ];
        break;
    }

    schemes.push({
      rule,
      label: RULE_LABELS[rule],
      colors: hslList.map(hslToRgb),
    });
  }

  return schemes;
}
