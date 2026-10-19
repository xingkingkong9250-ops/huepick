import { RGB, ColorInfo } from './types';
import { rgbToHex } from './imageLoader';

/**
 * 颜色量化与主色提取模块
 *
 * 实现 MMCQ（Modified Median Cut Quantization）算法，与 Color Thief 同源。
 * 步骤：
 *   1. 从 RGB Buffer 采样像素，过滤掉接近纯黑/纯白/纯灰的"无趣"像素
 *   2. 将颜色量化到低位空间，构建直方图
 *   3. 用优先队列按体积进行 Median Cut，直到达到目标色数
 *   4. 对每个色箱取加权平均作为代表色
 */

const SIGNIFICANT_BITS = 5;           // 每通道保留位数（5bit = 32 级）
const SHIFT = 8 - SIGNIFICANT_BITS;   // 右移位数
const MAX_COLORS_IN_BOX = 1 << (SIGNIFICANT_BITS * 3); // 32768

/** 采样时的过滤阈值 */
const WHITE_THRESHOLD = 250;
const BLACK_THRESHOLD = 5;
const GRAY_TOLERANCE = 8;

interface VBox {
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
  histogram: Map<number, number>;
  population: number;
}

/** 将 RGB 量化到低位空间，返回索引 */
function quantize(r: number, g: number, b: number): number {
  return (r >> SHIFT) << (2 * SIGNIFICANT_BITS) | (g >> SHIFT) << SIGNIFICANT_BITS | (b >> SHIFT);
}

/** 从量化索引还原 RGB */
function dequantize(index: number): RGB {
  const mask = (1 << SIGNIFICANT_BITS) - 1;
  return {
    r: (index >> (2 * SIGNIFICANT_BITS)) & mask,
    g: (index >> SIGNIFICANT_BITS) & mask,
    b: index & mask,
  };
}

/** 判断像素是否"无趣"（接近黑/白/灰），这些像素会干扰主色提取 */
function isBoring(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > WHITE_THRESHOLD && min > WHITE_THRESHOLD) return true;
  if (max < BLACK_THRESHOLD) return true;
  if (max - min < GRAY_TOLERANCE) return true;
  return false;
}

/** 计算色箱体积 */
function boxVolume(box: VBox): number {
  return (box.rMax - box.rMin + 1) * (box.gMax - box.gMin + 1) * (box.bMax - box.bMin + 1);
}

/** 找到色箱中最长的轴 */
function longestAxis(box: VBox): 'r' | 'g' | 'b' {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;
  if (rRange >= gRange && rRange >= bRange) return 'r';
  if (gRange >= rRange && gRange >= bRange) return 'g';
  return 'b';
}

/** 从 RGB Buffer 构建量化直方图（自动过滤无趣像素） */
function buildHistogram(data: Buffer, width: number, height: number): Map<number, number> {
  const histogram = new Map<number, number>();
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 10000)); // 最多采样约 1 万像素

  for (let i = 0; i < totalPixels; i += step) {
    const offset = i * 3;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (isBoring(r, g, b)) continue;
    const index = quantize(r, g, b);
    histogram.set(index, (histogram.get(index) || 0) + 1);
  }

  return histogram;
}

/** 创建包含所有颜色的初始色箱 */
function createInitialBox(histogram: Map<number, number>): VBox {
  let rMin = MAX_COLORS_IN_BOX, rMax = 0;
  let gMin = MAX_COLORS_IN_BOX, gMax = 0;
  let bMin = MAX_COLORS_IN_BOX, bMax = 0;
  let population = 0;

  for (const [index, count] of histogram) {
    const { r, g, b } = dequantize(index);
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
    population += count;
  }

  return { rMin, rMax, gMin, gMax, bMin, bMax, histogram, population };
}

/** 沿指定轴找到中位数位置 */
function findMedian(box: VBox, axis: 'r' | 'g' | 'b'): number {
  const entries: Array<{ value: number; count: number }> = [];

  for (const [index, count] of box.histogram) {
    const { r, g, b } = dequantize(index);
    let value: number;
    if (axis === 'r') value = r;
    else if (axis === 'g') value = g;
    else value = b;

    if (value >= (axis === 'r' ? box.rMin : axis === 'g' ? box.gMin : box.bMin) &&
        value <= (axis === 'r' ? box.rMax : axis === 'g' ? box.gMax : box.bMax)) {
      entries.push({ value, count });
    }
  }

  entries.sort((a, b) => a.value - b.value);

  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const median = total / 2;
  let cumulative = 0;

  for (const entry of entries) {
    cumulative += entry.count;
    if (cumulative >= median) return entry.value;
  }

  return entries[entries.length - 1]?.value ?? 0;
}

/** 将色箱沿最长轴的中位数切开 */
function splitBox(box: VBox): [VBox, VBox] {
  const axis = longestAxis(box);
  const axisMax = axis === 'r' ? box.rMax : axis === 'g' ? box.gMax : box.bMax;
  let cut = findMedian(box, axis);

  // 中位数若等于轴上最大值，右侧色箱会为空（所有像素留在左侧），
  // 导致切割无法推进、最终只剩一个平均色。此时将切割点左移一格，
  // 让最大值单独进入右侧，保证两侧均非空。
  if (cut >= axisMax) {
    cut = axisMax - 1;
  }

  const box1: VBox = { ...box, histogram: new Map(), population: 0 };
  const box2: VBox = { ...box, histogram: new Map(), population: 0 };

  if (axis === 'r') {
    box1.rMax = cut;
    box2.rMin = cut + 1;
  } else if (axis === 'g') {
    box1.gMax = cut;
    box2.gMin = cut + 1;
  } else {
    box1.bMax = cut;
    box2.bMin = cut + 1;
  }

  for (const [index, count] of box.histogram) {
    const { r, g, b } = dequantize(index);
    const value = axis === 'r' ? r : axis === 'g' ? g : b;
    if (value <= cut) {
      box1.histogram.set(index, (box1.histogram.get(index) || 0) + count);
      box1.population += count;
    } else {
      box2.histogram.set(index, (box2.histogram.get(index) || 0) + count);
      box2.population += count;
    }
  }

  return [box1, box2];
}

/** 计算色箱的代表色（加权平均） */
function averageColor(box: VBox): RGB {
  let rSum = 0, gSum = 0, bSum = 0, total = 0;

  for (const [index, count] of box.histogram) {
    const { r, g, b } = dequantize(index);
    rSum += r * count;
    gSum += g * count;
    bSum += b * count;
    total += count;
  }

  if (total === 0) return { r: 128, g: 128, b: 128 };

  // 还原到 8bit 空间
  const scale = 255 / ((1 << SIGNIFICANT_BITS) - 1);
  return {
    r: Math.round((rSum / total) * scale),
    g: Math.round((gSum / total) * scale),
    b: Math.round((bSum / total) * scale),
  };
}

/**
 * 从 RGB Buffer 提取主色
 *
 * @param data RGB 像素数据
 * @param width 图像宽度
 * @param height 图像高度
 * @param numColors 目标主色数量
 * @returns 按占比降序排列的主色数组
 */
export function extractPalette(data: Buffer, width: number, height: number, numColors: number): ColorInfo[] {
  const histogram = buildHistogram(data, width, height);
  if (histogram.size === 0) return [];

  // 优先队列：按体积排序
  const queue: VBox[] = [createInitialBox(histogram)];

  // 迭代切割直到达到目标色数
  while (queue.length < numColors) {
    // 找体积最大的色箱
    let maxIndex = 0;
    let maxVolume = 0;
    for (let i = 0; i < queue.length; i++) {
      const vol = boxVolume(queue[i]);
      if (vol > maxVolume) {
        maxVolume = vol;
        maxIndex = i;
      }
    }

    const box = queue[maxIndex];
    if (box.population === 0 || boxVolume(box) <= 1) break;

    const [box1, box2] = splitBox(box);
    queue.splice(maxIndex, 1, box1, box2);
  }

  // 计算每个色箱的代表色和占比
  const totalPopulation = queue.reduce((sum, b) => sum + b.population, 0);
  const colors: ColorInfo[] = queue
    .filter(box => box.population > 0)
    .map(box => {
      const rgb = averageColor(box);
      return {
        hex: rgbToHex(rgb),
        rgb,
        ratio: box.population / totalPopulation,
        population: box.population,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);

  return colors;
}
