/**
 * HuePick 核心类型定义
 */

/** RGB 颜色值 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 提取到的主色信息 */
export interface ColorInfo {
  /** HEX 字符串，如 "#A3B8CC" */
  hex: string;
  /** RGB 值 */
  rgb: RGB;
  /** 在画面中的像素占比（0~1） */
  ratio: number;
  /** 在量化空间中的像素数 */
  population: number;
}

/** HSL 颜色值（h: 0~360，s/l: 0~1） */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** 配色规则 */
export type HarmonyRule =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'splitComplementary'
  | 'monochromatic';

/** 一组配色方案（基于主色按规则生成） */
export interface HarmonyScheme {
  rule: HarmonyRule;
  /** 方案展示名（中文） */
  label: string;
  /** 方案包含的颜色（含基准色，第 0 位为基准色） */
  colors: RGB[];
}

/** 色卡模板 */
export type TemplateId = 'landscape' | 'portrait' | 'square' | 'compact' | 'palette' | 'thumb' | 'custom';

/** 色卡主题 */
export type ThemeId = 'dark' | 'light';

/** 导出格式 */
export type ExportFormat = 'css' | 'scss' | 'tailwind' | 'json';

/** 色卡生成选项 */
export interface CardOptions {
  /** 主色数量，默认 6 */
  numColors: number;
  /** 是否自动裁除电影黑边，默认 true */
  cropBars: boolean;
  /** 色卡画布宽度，默认 1920 */
  cardWidth: number;
  /** 色卡画布高度，默认 1080 */
  cardHeight: number;
  /** 背景色，默认深灰 */
  background: RGB;
  /** 标题文字，默认用文件名（去后缀） */
  titleText?: string;
  /** 输出文件路径（含文件名） */
  outputPath: string;
  /** 输出格式 'jpg' | 'png'，默认 'jpg' */
  outputFormat?: 'jpg' | 'png';
  /** 模板 id，用于 renderer 选择版式分支 */
  template?: TemplateId;
}

/** 单张图片处理结果 */
export interface ProcessResult {
  /** 原图路径 */
  sourcePath: string;
  /** 色卡输出路径 */
  outputPath: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
  /** 提取到的主色 */
  colors?: ColorInfo[];
  /** 成功时生成的配色方案 */
  harmonies?: HarmonyScheme[];
  /** 成功时额外导出的文件路径列表 */
  exportedFiles?: string[];
}

/** 批量处理汇总 */
export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: ProcessResult[];
}
