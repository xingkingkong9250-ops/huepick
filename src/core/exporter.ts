import * as fs from 'fs';
import * as path from 'path';
import { ColorInfo, ExportFormat, HarmonyScheme, RGB } from './types';
import { rgbToHex } from './imageLoader';

/**
 * 配色多格式导出模块
 *
 * 将提取出的主色 + 配色方案写成开发可直接引用的文件：
 *   - css      CSS Variables（:root 作用域）
 *   - scss     SCSS 变量
 *   - tailwind tailwind.config 片段（extend.colors）
 *   - json     结构化数据（含占比与配色方案）
 */

const RULE_NAME_PREFIX: Record<string, string> = {
  complementary: 'comp',
  analogous: 'analog',
  triadic: 'triad',
  splitComplementary: 'split',
  monochromatic: 'mono',
};

/** 生成 CSS Variables 文本 */
function buildCss(colors: ColorInfo[], harmonies: HarmonyScheme[], sourceName: string): string {
  const lines: string[] = [
    `/* HuePick palette — ${sourceName} */`,
    ':root {',
  ];

  colors.forEach((c, i) => {
    lines.push(`  --huepick-${i + 1}: ${c.hex}; /* ${(c.ratio * 100).toFixed(1)}% */`);
  });

  for (const scheme of harmonies) {
    const prefix = RULE_NAME_PREFIX[scheme.rule] ?? scheme.rule;
    lines.push('');
    lines.push(`  /* ${scheme.label} (${scheme.rule}) */`);
    scheme.colors.forEach((rgb, i) => {
      lines.push(`  --huepick-${prefix}-${i + 1}: ${rgbToHex(rgb)};`);
    });
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

/** 生成 SCSS 变量文本 */
function buildScss(colors: ColorInfo[], harmonies: HarmonyScheme[], sourceName: string): string {
  const lines: string[] = [
    `// HuePick palette — ${sourceName}`,
  ];

  colors.forEach((c, i) => {
    lines.push(`$huepick-${i + 1}: ${c.hex}; // ${(c.ratio * 100).toFixed(1)}%`);
  });

  for (const scheme of harmonies) {
    const prefix = RULE_NAME_PREFIX[scheme.rule] ?? scheme.rule;
    lines.push('');
    lines.push(`// ${scheme.label} (${scheme.rule})`);
    scheme.colors.forEach((rgb, i) => {
      lines.push(`$huepick-${prefix}-${i + 1}: ${rgbToHex(rgb)};`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

/** 生成 Tailwind config 片段 */
function buildTailwind(colors: ColorInfo[], harmonies: HarmonyScheme[], sourceName: string): string {
  const paletteEntries = colors
    .map((c, i) => `        '${i + 1}': '${c.hex}',`)
    .join('\n');

  const harmonyEntries = harmonies
    .map((scheme) => {
      const prefix = RULE_NAME_PREFIX[scheme.rule] ?? scheme.rule;
      const inner = scheme.colors
        .map((rgb, i) => `          '${i + 1}': '${rgbToHex(rgb)}',`)
        .join('\n');
      return `        '${prefix}': {\n${inner}\n        },`;
    })
    .join('\n');

  return [
    `// HuePick palette — ${sourceName}`,
    `// 合并到 tailwind.config.js 的 theme.extend.colors`,
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    `        huepick: {`,
    paletteEntries,
    `        },`,
    harmonyEntries,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    ``,
  ].join('\n');
}

/** 生成 JSON 结构化数据 */
function buildJson(colors: ColorInfo[], harmonies: HarmonyScheme[], sourceName: string): string {
  const payload = {
    source: sourceName,
    generatedAt: new Date().toISOString(),
    generator: 'HuePick',
    palette: colors.map((c) => ({
      hex: c.hex,
      rgb: c.rgb,
      ratio: Number(c.ratio.toFixed(4)),
    })),
    harmonies: harmonies.map((s) => ({
      rule: s.rule,
      label: s.label,
      colors: s.colors.map((rgb) => ({ hex: rgbToHex(rgb), rgb })),
    })),
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

/** 各格式的扩展名与构建器 */
const FORMAT_DEFS: Record<ExportFormat, { ext: string; build: (c: ColorInfo[], h: HarmonyScheme[], n: string) => string }> = {
  css: { ext: '.css', build: buildCss },
  scss: { ext: '.scss', build: buildScss },
  tailwind: { ext: '.tailwind.js', build: buildTailwind },
  json: { ext: '.json', build: buildJson },
};

/**
 * 将配色导出为指定格式文件，与色卡同目录。
 *
 * @param sourcePath 原图路径（用于命名与注释）
 * @param cardOutputPath 色卡输出路径（导出文件与其同目录）
 * @param colors 主色列表
 * @param harmonies 配色方案列表
 * @param formats 要导出的格式
 * @returns 实际写出的文件路径列表
 */
export function exportPalettes(
  sourcePath: string,
  cardOutputPath: string,
  colors: ColorInfo[],
  harmonies: HarmonyScheme[],
  formats: ExportFormat[]
): string[] {
  const sourceName = path.basename(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const outDir = path.dirname(cardOutputPath);
  const written: string[] = [];

  for (const format of formats) {
    const def = FORMAT_DEFS[format];
    if (!def) continue;
    const outPath = path.join(outDir, `${base}_palette${def.ext}`);
    const content = def.build(colors, harmonies, sourceName);
    fs.writeFileSync(outPath, content, 'utf8');
    written.push(outPath);
  }

  return written;
}
