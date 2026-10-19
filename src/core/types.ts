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
}

/** 批量处理汇总 */
export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: ProcessResult[];
}
