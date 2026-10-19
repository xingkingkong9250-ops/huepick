import sharp from 'sharp';
import { RGB } from './types';

/** 默认黑边检测阈值（0~255，低于此值视为黑） */
export const DEFAULT_BLACK_THRESHOLD = 12;

/**
 * 用 sharp 加载图片，统一转为 RGB Buffer。
 * 自动处理透明通道：透明区域用黑色合成。
 */
export async function loadImageAsRGB(filePath: string): Promise<{ data: Buffer; width: number; height: number }> {
  const image = sharp(filePath);
  const metadata = await image.metadata();

  // 如果有 alpha 通道，先合成到黑色背景上
  if (metadata.hasAlpha) {
    const flattened = await image.flatten({ background: { r: 0, g: 0, b: 0 } });
    const { data, info } = await flattened.raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * 检测并裁除上下黑边。
 * 逐行扫描：若某一行存在亮度 > threshold 的像素，则认为该行有内容。
 *
 * @param rgbData 原始 RGB 像素数据（width*height*3）
 * @param width 图像宽度
 * @param height 图像高度
 * @param threshold 黑边阈值，默认 12
 * @returns [top, bottom] 内容区域的起止行（含）
 */
export function detectContentRows(
  rgbData: Buffer,
  width: number,
  height: number,
  threshold: number = DEFAULT_BLACK_THRESHOLD
): [number, number] {
  let top = 0;
  let bottom = height - 1;

  // 从上往下找第一行有内容的
  for (let y = 0; y < height; y++) {
    if (rowHasContent(rgbData, width, y, threshold)) {
      top = y;
      break;
    }
  }

  // 从下往上找最后一行有内容的
  for (let y = height - 1; y >= 0; y--) {
    if (rowHasContent(rgbData, width, y, threshold)) {
      bottom = y;
      break;
    }
  }

  return [top, bottom];
}

/**
 * 判断某一行是否有内容（存在亮度超过阈值的像素）
 * 每隔 4 个像素采样一次，提升性能
 */
function rowHasContent(rgbData: Buffer, width: number, row: number, threshold: number): boolean {
  const rowOffset = row * width * 3;
  for (let x = 0; x < width; x += 4) {
    const offset = rowOffset + x * 3;
    const r = rgbData[offset];
    const g = rgbData[offset + 1];
    const b = rgbData[offset + 2];
    // 感知亮度
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > threshold) return true;
  }
  return false;
}

/**
 * 裁除上下黑边，返回裁剪后的 RGB 数据和新尺寸
 */
export function cropBlackBars(
  rgbData: Buffer,
  width: number,
  height: number,
  threshold: number = DEFAULT_BLACK_THRESHOLD
): { data: Buffer; width: number; height: number } {
  const [top, bottom] = detectContentRows(rgbData, width, height, threshold);
  if (bottom <= top) {
    // 无法确定有效区域，返回原图
    return { data: rgbData, width, height };
  }

  const newHeight = bottom - top + 1;
  const rowSize = width * 3;
  const cropped = Buffer.alloc(newHeight * rowSize);
  rgbData.copy(cropped, 0, top * rowSize, (bottom + 1) * rowSize);

  return { data: cropped, width, height: newHeight };
}

/**
 * 用 sharp 将 RGB Buffer 转为指定尺寸的缩略图 PNG Buffer
 */
export async function rgbToThumbnail(
  rgbData: Buffer,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): Promise<Buffer> {
  return sharp(rgbData, { raw: { width, height, channels: 3 } })
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * 将 RGB Buffer 保存为 PNG
 */
export async function saveRgbAsPng(
  rgbData: Buffer,
  width: number,
  height: number,
  outputPath: string
): Promise<void> {
  await sharp(rgbData, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

/**
 * 将 RGB 值转为 HEX 字符串
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}
