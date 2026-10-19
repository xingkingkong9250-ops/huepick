import { Canvas, loadImage } from 'skia-canvas';
import * as fs from 'fs';
import * as path from 'path';
import { CardOptions, ProcessResult, RGB } from './types';
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

    // 4. 画布与主题色
    const canvas = new Canvas(cardWidth, cardHeight);
    const ctx = canvas.getContext('2d');
    const ink = inkColor(background);
    const sep = separatorColor(background);
    const border = swatchBorderColor(background);
    const isPortrait = cardHeight > cardWidth;

    // 背景
    ctx.fillStyle = rgbCss(background);
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 标题
    const title = titleText ?? path.basename(sourcePath, path.extname(sourcePath));
    ctx.fillStyle = ink;
    ctx.font = `bold 30px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, PADDING, 18);

    // 5. 缩略图区
    const imgAreaTop = 70;
    const imgAreaRatio = isPortrait ? 0.45 : 0.66;
    const imgAreaBottom = Math.floor(cardHeight * imgAreaRatio);
    const imgAreaHeight = imgAreaBottom - imgAreaTop;
    const thumbBuffer = await rgbToThumbnail(
      work.data,
      work.width,
      work.height,
      cardWidth - PADDING * 2,
      imgAreaHeight
    );
    const thumbImage = await loadImage(thumbBuffer);
    const thumbX = PADDING + Math.floor((cardWidth - PADDING * 2 - thumbImage.width) / 2);
    const thumbY = imgAreaTop + Math.floor((imgAreaHeight - thumbImage.height) / 2);
    ctx.drawImage(thumbImage, thumbX, thumbY, thumbImage.width, thumbImage.height);

    // 分隔线
    const sepY = imgAreaBottom + 10;
    ctx.strokeStyle = sep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PADDING, sepY);
    ctx.lineTo(cardWidth - PADDING, sepY);
    ctx.stroke();

    // 6. 色块区
    const swTop = sepY + 25;
    const swBottom = cardHeight - PADDING;
    const availWidth = cardWidth - PADDING * 2;

    if (isPortrait) {
      // 竖排：每行 色块 + 占比 + HEX
      const rowGap = 12;
      const rowHeight = Math.floor((swBottom - swTop - rowGap * (colors.length - 1)) / colors.length);
      const blockWidth = Math.min(rowHeight, Math.floor(availWidth * 0.4));

      colors.forEach((color, i) => {
        const y0 = swTop + i * (rowHeight + rowGap);
        const x0 = PADDING;

        ctx.fillStyle = color.hex;
        ctx.fillRect(x0, y0, blockWidth, rowHeight);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, blockWidth, rowHeight);

        // 占比（色块内）
        const pct = `${(color.ratio * 100).toFixed(1)}%`;
        ctx.fillStyle = textColorFor(color.rgb);
        ctx.font = `16px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(pct, x0 + 8, y0 + 6);

        // HEX（色块右侧，垂直居中）
        ctx.fillStyle = ink;
        ctx.font = `24px ${FONT_FAMILY}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(color.hex, x0 + blockWidth + 20, y0 + rowHeight / 2);
      });
    } else {
      // 横排 / 方排：自动网格（一行放不下自动换行，保证 HEX 可读）
      const gap = 16;
      const hexLineHeight = 40;
      const minSwatchWidth = 130;  // 保证 HEX 文本有足够宽度

      const cols = Math.max(1, Math.min(colors.length, Math.floor((availWidth + gap) / (minSwatchWidth + gap))));
      const rows = Math.ceil(colors.length / cols);

      const swWidth = Math.floor((availWidth - gap * (cols - 1)) / cols);
      const blockHeight = Math.floor((swBottom - swTop - gap * (rows - 1)) / rows);
      const swHeight = blockHeight - hexLineHeight;

      colors.forEach((color, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x0 = PADDING + col * (swWidth + gap);
        const y0 = swTop + row * (blockHeight + gap);

        ctx.fillStyle = color.hex;
        ctx.fillRect(x0, y0, swWidth, swHeight);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, swWidth, swHeight);

        // 占比（色块内）
        const pct = `${(color.ratio * 100).toFixed(1)}%`;
        ctx.fillStyle = textColorFor(color.rgb);
        ctx.font = `18px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(pct, x0 + 10, y0 + 8);

        // HEX（色块下方）
        ctx.fillStyle = ink;
        ctx.font = `26px ${FONT_FAMILY}`;
        ctx.textBaseline = 'top';
        ctx.fillText(color.hex, x0, y0 + swHeight + 10);
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
