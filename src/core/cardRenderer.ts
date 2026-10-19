import { Canvas, loadImage } from 'skia-canvas';
import * as fs from 'fs';
import * as path from 'path';
import { CardOptions, ProcessResult, RGB, TemplateId } from './types';
import { loadImageAsRGB, cropBlackBars, rgbToThumbnail } from './imageLoader';
import { extractPalette } from './paletteExtractor';

/** 默认色卡参数 */
const DEFAULT_CARD_WIDTH = 1920;
const DEFAULT_CARD_HEIGHT = 1080;
const DEFAULT_BG: RGB = { r: 24, g: 24, b: 26 };
const PADDING = 40;

/** 字体栈：优先微软雅黑保证中文标题正常 */
const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';

/**
 * 根据背景色亮度决定叠加文字用深色还是浅色
 */
function textColorFor(bg: RGB): string {
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  return lum > 140 ? '#0F0F0F' : '#F5F5F5';
}

/** 画布上的主文字颜色（标题 / HEX） */
function inkColor(bg: RGB): string {
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  return lum > 140 ? '#1A1A1A' : '#EBEBEB';
}

/** 分隔线颜色 */
function separatorColor(bg: RGB): string {
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  return lum > 140 ? '#D4D4D8' : '#3C3C40';
}

/** 色块描边颜色 */
function swatchBorderColor(bg: RGB): string {
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  return lum > 140 ? '#C0C0C4' : '#505054';
}

/**
 * RGB → CSS 颜色字符串
 */
function rgbCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * 为单张图片生成色卡
 *
 * 版式自适应：
 *   - 横版 / 方版（宽 ≥ 高）：上图下色块横排
 *   - 竖版（高 > 宽）：上图下色块竖排（每行：色块 + 占比 + HEX）
 *
 * @param sourcePath 原图路径
 * @param options 生成选项
 * @returns 处理结果
 */
export async function generateCard(sourcePath: string, options: CardOptions): Promise<ProcessResult> {
  const {
    numColors = 6,
    cropBars = true,
    cardWidth = DEFAULT_CARD_WIDTH,
    cardHeight = DEFAULT_CARD_HEIGHT,
    background = DEFAULT_BG,
    titleText,
    outputPath,
    outputFormat = 'jpg',
    template = 'landscape',
  } = options;

  try {
    // 1. 加载图片并统一为 RGB Buffer
    const { data, width, height } = await loadImageAsRGB(sourcePath);

    // 2. 可选：裁除电影黑边
    let work = { data, width, height };
    if (cropBars) {
      work = cropBlackBars(data, width, height);
    }

    // 3. 提取主色
    const colors = extractPalette(work.data, work.width, work.height, numColors);
    if (colors.length === 0) {
      throw new Error('未能从图片中提取到任何主色');
    }

    // 4. 画布缩放因子（相对 1920 宽的基准字体/间距）
    const scale = Math.max(0.5, Math.min(1, cardWidth / 1920));
    const pad = Math.max(16, Math.round(PADDING * scale));
    const isPalette = template === 'palette';
    const isPortrait = !isPalette && cardHeight > cardWidth;

    // 5. 画布与主题色
    const canvas = new Canvas(cardWidth, cardHeight);
    const ctx = canvas.getContext('2d');
    const ink = inkColor(background);
    const sep = separatorColor(background);
    const border = swatchBorderColor(background);

    // 背景
    ctx.fillStyle = rgbCss(background);
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 标题
    const title = titleText ?? path.basename(sourcePath, path.extname(sourcePath));
    const titleFont = `bold ${Math.max(14, Math.round(30 * scale))}px ${FONT_FAMILY}`;
    ctx.fillStyle = ink;
    ctx.font = titleFont;
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad, Math.round(14 * scale));

    // 6. 缩略图区（palette 模式跳过，compact/thumb 缩小占比）
    let sepY;
    if (isPalette) {
      sepY = Math.round(40 * scale);  // 仅保留标题 + 分隔线
    } else {
      const imgTop = Math.round(54 * scale);
      let imgAreaRatio = isPortrait ? 0.45 : 0.66;
      if (template === 'compact') imgAreaRatio = 0.45;
      if (template === 'thumb') imgAreaRatio = 0.4;
      const imgBottom = Math.floor(cardHeight * imgAreaRatio);
      const imgHeight = imgBottom - imgTop;
      const thumbBuffer = await rgbToThumbnail(
        work.data, work.width, work.height,
        cardWidth - pad * 2, imgHeight
      );
      const thumbImage = await loadImage(thumbBuffer);
      const thumbX = pad + Math.floor((cardWidth - pad * 2 - thumbImage.width) / 2);
      const thumbY = imgTop + Math.floor((imgHeight - thumbImage.height) / 2);
      ctx.drawImage(thumbImage, thumbX, thumbY, thumbImage.width, thumbImage.height);
      sepY = imgBottom + Math.round(10 * scale);
    }

    // 分隔线
    ctx.strokeStyle = sep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, sepY);
    ctx.lineTo(cardWidth - pad, sepY);
    ctx.stroke();

    // 7. 色块区
    const swTop = sepY + Math.round(22 * scale);
    const swBottom = cardHeight - pad;
    const availWidth = cardWidth - pad * 2;

    // palette 模式：纯色板横条（不区分竖排/横排）
    if (isPalette) {
      const gap = Math.round(10 * scale);
      const minSwatchW = Math.round(100 * scale);
      const cols = Math.max(1, Math.min(colors.length, Math.floor((availWidth + gap) / (minSwatchW + gap))));
      const rows = Math.ceil(colors.length / cols);
      const swWidth = Math.floor((availWidth - gap * (cols - 1)) / cols);
      const blockH = Math.floor((swBottom - swTop - gap * (rows - 1)) / rows);
      const hexSize = Math.max(12, Math.round(18 * scale));

      colors.forEach((color, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x0 = pad + col * (swWidth + gap);
        const y0 = swTop + row * (blockH + gap);

        ctx.fillStyle = color.hex;
        ctx.fillRect(x0, y0, swWidth, blockH);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, swWidth, blockH);

        ctx.fillStyle = textColorFor(color.rgb);
        ctx.font = `${Math.max(10, Math.round(11 * scale))}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${(color.ratio * 100).toFixed(1)}%`, x0 + 6, y0 + 4);

        ctx.fillStyle = ink;
        ctx.font = `${hexSize}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(color.hex, x0 + 6, y0 + blockH - 4);
      });
    } else if (isPortrait) {
      // 竖排：每行 色块 + 占比 + HEX
      const rowGap = Math.round(12 * scale);
      const rowHeight = Math.floor((swBottom - swTop - rowGap * (colors.length - 1)) / colors.length);
      const blockWidth = Math.min(rowHeight, Math.floor(availWidth * 0.4));

      colors.forEach((color, i) => {
        const y0 = swTop + i * (rowHeight + rowGap);
        const x0 = pad;

        ctx.fillStyle = color.hex;
        ctx.fillRect(x0, y0, blockWidth, rowHeight);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, blockWidth, rowHeight);

        ctx.fillStyle = textColorFor(color.rgb);
        ctx.font = `${Math.max(12, Math.round(16 * scale))}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${(color.ratio * 100).toFixed(1)}%`, x0 + Math.round(8 * scale), y0 + Math.round(6 * scale));

        ctx.fillStyle = ink;
        ctx.font = `${Math.max(14, Math.round(24 * scale))}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(color.hex, x0 + blockWidth + Math.round(20 * scale), y0 + rowHeight / 2);
      });
    } else {
      // 横排 / 方排 / compact / thumb：自动网格
      const gap = Math.round(16 * scale);
      const hexLineH = Math.round(36 * scale);
      const minSwW = Math.round(130 * scale);

      const cols = Math.max(1, Math.min(colors.length, Math.floor((availWidth + gap) / (minSwW + gap))));
      const rows = Math.ceil(colors.length / cols);

      const swWidth = Math.floor((availWidth - gap * (cols - 1)) / cols);
      const blockHeight = Math.floor((swBottom - swTop - gap * (rows - 1)) / rows);
      const swHeight = blockHeight - hexLineH;

      colors.forEach((color, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x0 = pad + col * (swWidth + gap);
        const y0 = swTop + row * (blockHeight + gap);

        ctx.fillStyle = color.hex;
        ctx.fillRect(x0, y0, swWidth, swHeight);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, swWidth, swHeight);

        ctx.fillStyle = textColorFor(color.rgb);
        ctx.font = `${Math.max(12, Math.round(18 * scale))}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${(color.ratio * 100).toFixed(1)}%`, x0 + Math.round(10 * scale), y0 + Math.round(8 * scale));

        ctx.fillStyle = ink;
        ctx.font = `${Math.max(14, Math.round(26 * scale))}px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(color.hex, x0, y0 + swHeight + Math.round(10 * scale));
      });
    }

    // 7. 保存 PNG
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    if (outputFormat === 'png') {
      await canvas.toFile(outputPath, { format: 'png' });
    } else {
      await canvas.toFile(outputPath, { format: 'jpeg', quality: 0.92 });
    }

    return {
      sourcePath,
      outputPath,
      success: true,
      colors,
    };
  } catch (err) {
    return {
      sourcePath,
      outputPath,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
