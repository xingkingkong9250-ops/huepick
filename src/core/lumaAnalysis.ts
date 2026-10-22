import { RGB } from './types';

/**
 * 影视光影分析模块
 * 从 RGB 像素数据计算九宫格亮度分布、明暗统计、对比度、饱和度，
 * 并生成文字描述的光影判断。
 */

/** 感知亮度（Rec.601） */
function perceivedLum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** RGB → 饱和度（0~1） */
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/** 九宫格单格统计 */
export interface GridCell {
  /** 平均亮度 0~255 */
  avgLum: number;
  /** 亮度占比（0~1，相对全图最亮格） */
  ratio: number;
}

/** 光影分析结果 */
export interface LumaAnalysis {
  /** 九宫格亮度百分比（左上→右下，0~100 整数） */
  grid: number[][];
  /** 平均亮度（0~100） */
  avgBrightness: number;
  /** 暗部占比（0~100，亮度 < 85 的像素占比） */
  darkRatio: number;
  /** 中间调占比（0~100，85~170） */
  midRatio: number;
  /** 亮部占比（0~100，> 170） */
  brightRatio: number;
  /** 平均彩度/饱和度（0~100） */
  avgSaturation: number;
  /** 九宫格纵向极差（最亮行均值 - 最暗行均值，0~100） */
  verticalRange: number;
  /** 九宫格最亮值（0~100） */
  gridMax: number;
  /** 九宫格最暗值（0~100） */
  gridMin: number;
  /** 光影判断文字 */
  analysisText: string;
  /** 时段分类文字 */
  timeCategory: string;
}

/**
 * 从 RGB Buffer 执行光影分析
 * @param data RGB 像素数据（width*height*3）
 * @param width 图像宽度
 * @param height 图像高度
 */
export function analyzeLuma(data: Buffer, width: number, height: number): LumaAnalysis {
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 20000)); // 采样约 2 万像素

  // 九宫格累加器
  const gridSums: number[][] = [ [0,0,0], [0,0,0], [0,0,0] ];
  const gridCounts: number[][] = [ [0,0,0], [0,0,0], [0,0,0] ];

  let totalLum = 0;
  let totalSat = 0;
  let darkCount = 0, midCount = 0, brightCount = 0;
  let sampleCount = 0;

  for (let i = 0; i < totalPixels; i += step) {
    const offset = i * 3;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    const lum = perceivedLum(r, g, b);
    const sat = saturation(r, g, b);

    totalLum += lum;
    totalSat += sat;
    sampleCount++;

    // 明暗分区
    if (lum < 85) darkCount++;
    else if (lum > 170) brightCount++;
    else midCount++;

    // 九宫格定位
    const x = i % width;
    const y = Math.floor(i / width);
    const gx = Math.min(2, Math.floor(x / (width / 3)));
    const gy = Math.min(2, Math.floor(y / (height / 3)));
    gridSums[gy][gx] += lum;
    gridCounts[gy][gx]++;
  }

  // 九宫格百分比（相对全图最大亮度格）
  const gridAvgs: number[][] = [ [0,0,0], [0,0,0], [0,0,0] ];
  let gridMax = 0, gridMin = 100;
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const avg = gridCounts[gy][gx] > 0 ? gridSums[gy][gx] / gridCounts[gy][gx] : 0;
      gridAvgs[gy][gx] = Math.round((avg / 255) * 100);
      if (gridAvgs[gy][gx] > gridMax) gridMax = gridAvgs[gy][gx];
      if (gridAvgs[gy][gx] < gridMin) gridMin = gridAvgs[gy][gx];
    }
  }

  // 纵向三行均值
  const rowAvgs = [0, 1, 2].map(r => Math.round((gridAvgs[r][0] + gridAvgs[r][1] + gridAvgs[r][2]) / 3));
  const verticalRange = Math.max(...rowAvgs) - Math.min(...rowAvgs);

  const avgBrightness = sampleCount > 0 ? Math.round((totalLum / sampleCount / 255) * 100) : 0;
  const avgSat = sampleCount > 0 ? Math.round((totalSat / sampleCount) * 100) : 0;
  const darkRatio = sampleCount > 0 ? Math.round((darkCount / sampleCount) * 100) : 0;
  const midRatio = sampleCount > 0 ? Math.round((midCount / sampleCount) * 100) : 0;
  const brightRatio = sampleCount > 0 ? Math.round((brightCount / sampleCount) * 100) : 0;

  // 生成时段分类
  const timeCategory = classifyTime(avgBrightness, darkRatio);

  // 生成光影判断文字
  const analysisText = generateAnalysisText(avgBrightness, darkRatio, midRatio, brightRatio, avgSat, verticalRange, gridMax, gridMin);

  return {
    grid: gridAvgs,
    avgBrightness,
    darkRatio,
    midRatio,
    brightRatio,
    avgSaturation: avgSat,
    verticalRange,
    gridMax,
    gridMin,
    analysisText,
    timeCategory,
  };
}

/** 根据平均亮度分类时段 */
function classifyTime(avgBrightness: number, darkRatio: number): string {
  if (avgBrightness < 15) return '夜晚/暗光';
  if (avgBrightness < 30) return '清晨/黄昏';
  if (avgBrightness < 45) return '上午/下午日光';
  if (avgBrightness < 60) return '正午日光';
  return '强光/高调';
}

/** 生成光影判断描述文字 */
function generateAnalysisText(
  avgBrightness: number,
  darkRatio: number,
  midRatio: number,
  brightRatio: number,
  avgSat: number,
  verticalRange: number,
  gridMax: number,
  gridMin: number,
): string {
  const parts: string[] = [];

  // 主调判断
  if (darkRatio > 60) {
    parts.push('画面以暗调为主，阴影面积大');
  } else if (brightRatio > 60) {
    parts.push('画面以亮调为主，高光区域开阔');
  } else if (midRatio > 50) {
    parts.push('画面以中间调为主，过渡柔和');
  } else {
    parts.push('明暗分布均衡，层次丰富');
  }

  // 对比度判断
  if (verticalRange > 40) {
    parts.push('纵向光比强烈，方向性明显');
  } else if (verticalRange > 20) {
    parts.push('纵向光比适中，立体感自然');
  } else {
    parts.push('纵向光比平缓，氛围柔和');
  }

  // 饱和度判断
  if (avgSat > 50) {
    parts.push('色彩饱和度高，视觉冲击力强');
  } else if (avgSat > 25) {
    parts.push('饱和度适中，色彩自然');
  } else {
    parts.push('饱和度偏低，色调沉稳');
  }

  // 最亮最暗位置
  if (gridMax > 0 && gridMin < 100) {
    const maxPos = gridMax >= 60 ? '高光区域明亮' : '高光克制';
    const minPos = gridMin <= 15 ? '暗部深沉' : '暗部保留细节';
    parts.push(`${maxPos}，${minPos}`);
  }

  return parts.join('；') + '。';
}
