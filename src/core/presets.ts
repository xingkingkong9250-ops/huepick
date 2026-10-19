import { RGB, TemplateId, ThemeId } from './types';

/**
 * 预设表：色卡模板尺寸、主题背景色。
 * 独立于 VS Code API，便于单元测试与复用。
 */

/** 模板尺寸表（不含自定义） */
export const TEMPLATE_SIZES: Record<Exclude<TemplateId, 'custom'>, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  compact: { width: 1200, height: 800 },
  palette: { width: 1200, height: 240 },
  thumb: { width: 800, height: 450 },
};

/** 主题背景色 */
export const THEME_BACKGROUNDS: Record<ThemeId, RGB> = {
  dark: { r: 24, g: 24, b: 26 },
  light: { r: 245, g: 245, b: 247 },
};

/** 画布尺寸合法区间 */
export const CANVAS_MIN = 400;
export const CANVAS_MAX = 4096;

/**
 * 解析模板对应的画布尺寸；自定义模板时使用自定义宽高并钳制到合法区间。
 */
export function resolveCanvasSize(
  template: TemplateId,
  customWidth: number,
  customHeight: number
): { width: number; height: number } {
  if (template === 'custom') {
    return {
      width: clampCanvas(customWidth),
      height: clampCanvas(customHeight),
    };
  }
  return TEMPLATE_SIZES[template] ?? TEMPLATE_SIZES.landscape;
}

/** 将画布边长钳制到 [CANVAS_MIN, CANVAS_MAX] */
export function clampCanvas(value: number): number {
  if (!Number.isFinite(value)) return 1080;
  return Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, Math.round(value)));
}
