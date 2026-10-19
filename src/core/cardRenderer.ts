import { Canvas, loadImage, FontLibrary } from 'skia-canvas';
import * as fs from 'fs';
import * as path from 'path';
import { CardOptions, ColorInfo, ProcessResult, RGB } from './types';
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

/**
 * RGB → CSS 颜色字符串
 */
function rgbCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * 为单张图片生成色卡
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

    // 4. 用 sharp 生成缩略图 PNG Buffer（作为合成素材）
    const imgAreaTop = 70;
    const imgAreaBottom = Math.floor(cardHeight * 0.66);
    const imgAreaHeight = imgAreaBottom - imgAreaTop;
    const thumbBuffer = await rgbToThumbnail(
      work.data,
      work.width,
      work.height,
      cardWidth - PADDING * 2,
      imgAreaHeight
    );

    // 5. skia-canvas 绘制色卡
    const canvas = new Canvas(cardWidth, cardHeight);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = rgbCss(background);
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 标题
    const title = titleText ?? path.basename(sourcePath, path.extname(sourcePath));
    ctx.fillStyle = '#EBEBEB';
    ctx.font = `bold 30px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, PADDING, 18);

    // 嵌入缩略图
    const thumbImage = await loadImage(thumbBuffer);
    const thumbWidth = thumbImage.width;
    const thumbHeight = thumbImage.height;
    const thumbX = PADDING;
    const thumbY = imgAreaTop + Math.floor((imgAreaHeight - thumbHeight) / 2);
    ctx.drawImage(thumbImage, thumbX, thumbY, thumbWidth, thumbHeight);

    // 分隔线
    const sepY = imgAreaBottom + 10;
    ctx.strokeStyle = '#3C3C40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PADDING, sepY);
    ctx.lineTo(cardWidth - PADDING, sepY);
    ctx.stroke();

    // 色块区
    const swTop = sepY + 25;
    const swBottom = cardHeight - 50;
    const swHeight = swBottom - swTop - 50; // 底部留 50 给 HEX 文字
    const gap = 16;
    const availWidth = cardWidth - PADDING * 2;
    const swWidth = Math.floor((availWidth - gap * (colors.length - 1)) / colors.length);

    colors.forEach((color, i) => {
      const x0 = PADDING + i * (swWidth + gap);
      const y0 = swTop;

      // 色块
      ctx.fillStyle = color.hex;
      ctx.fillRect(x0, y0, swWidth, swHeight);

      // 色块边框
      ctx.strokeStyle = '#505054';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, swWidth, swHeight);

      // 占比文字（色块内）
      const pct = `${(color.ratio * 100).toFixed(1)}%`;
      ctx.fillStyle = textColorFor(color.rgb);
      ctx.font = `18px ${FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      ctx.fillText(pct, x0 + 10, y0 + 8);

      // HEX 文字（色块下方）
      ctx.fillStyle = '#EBEBEB';
      ctx.font = `26px ${FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      ctx.fillText(color.hex, x0, y0 + swHeight + 10);
    });

    // 6. 保存 PNG
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    await canvas.toFile(outputPath, { format: 'png', quality: 1 });

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
