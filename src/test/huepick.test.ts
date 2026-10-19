import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';

import { rgbToHsl, hslToRgb, generateHarmonies } from '../core/colorHarmony';
import { extractPalette } from '../core/paletteExtractor';
import { exportPalettes } from '../core/exporter';
import { generateCard } from '../core/cardRenderer';
import { buildOutputName } from '../utils/fileNaming';
import { resolveCanvasSize, clampCanvas, CANVAS_MIN, CANVAS_MAX } from '../core/presets';
import { rgbToHex, cropBlackBars, detectContentRows, DEFAULT_BLACK_THRESHOLD } from '../core/imageLoader';
import { ColorInfo, HarmonyScheme } from '../core/types';

/** 构造纯色横条测试图（上半色 A，下半色 B） */
function buildTwoTone(toneA: [number, number, number], toneB: [number, number, number], w = 100, h = 100): Buffer {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const [r, g, b] = y < h / 2 ? toneA : toneB;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b;
    }
  }
  return buf;
}

// ---------- colorHarmony ----------

test('rgbToHsl / hslToRgb 纯红往返一致', () => {
  const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
  assert.equal(Math.round(hsl.h), 0);
  assert.equal(hsl.s, 1);
  assert.equal(hsl.l, 0.5);
  assert.deepEqual(hslToRgb(hsl), { r: 255, g: 0, b: 0 });
});

test('互补色：纯红 → 青色', () => {
  const [scheme] = generateHarmonies({ r: 255, g: 0, b: 0 }, ['complementary']);
  assert.equal(scheme.rule, 'complementary');
  assert.equal(scheme.colors.length, 2);
  assert.deepEqual(scheme.colors[1], { r: 0, g: 255, b: 255 });
});

test('各配色规则返回预期色数且首色为基准色', () => {
  const base = { r: 200, g: 30, b: 40 };
  const schemes = generateHarmonies(base);
  assert.equal(schemes.length, 5);
  const expected: Record<string, number> = {
    complementary: 2, analogous: 3, triadic: 3, splitComplementary: 3, monochromatic: 3,
  };
  for (const s of schemes) {
    assert.equal(s.colors.length, expected[s.rule], `${s.rule} 色数不符`);
  }
  // 类似色与三原色均以基准色为中间/首位之一
  const analogous = schemes.find(s => s.rule === 'analogous')!;
  assert.deepEqual(analogous.colors[1], base);
});

// ---------- paletteExtractor ----------

test('双色图提取出两个主色，占比各半', () => {
  const buf = buildTwoTone([200, 30, 40], [30, 60, 200]);
  const colors = extractPalette(buf, 100, 100, 2);
  assert.equal(colors.length, 2, '应提取到 2 个主色（回归：中位数等于轴最大值时切割停滞）');
  const hexes = colors.map(c => c.hex).sort();
  assert.deepEqual(hexes, ['#193ACE', '#CE1929']);
});

test('主色按占比降序排列', () => {
  // 75% 红 / 25% 蓝
  const w = 100, h = 100;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const red = x < w * 0.75;
      buf[o] = red ? 200 : 30;
      buf[o + 1] = red ? 30 : 60;
      buf[o + 2] = red ? 40 : 200;
    }
  }
  const colors = extractPalette(buf, w, h, 2);
  assert.equal(colors.length, 2);
  assert.ok(colors[0].ratio > colors[1].ratio, '占比应降序');
  assert.equal(colors[0].hex, '#CE1929');
});

test('近黑/近白/近灰像素被过滤，纯灰图无有效主色', () => {
  const gray = buildTwoTone([128, 128, 128], [130, 129, 131]);
  const colors = extractPalette(gray, 100, 100, 4);
  assert.equal(colors.length, 0, '无趣像素应被过滤殆尽');
});

// ---------- imageLoader ----------

test('rgbToHex 格式与钳制正确', () => {
  assert.equal(rgbToHex({ r: 255, g: 0, b: 128 }), '#FF0080');
  assert.equal(rgbToHex({ r: 300, g: -20, b: 5.6 }), '#FF0006');
});

test('cropBlackBars 裁除上下黑边', () => {
  const w = 80, h = 100;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const content = y >= 30 && y < 70;
      buf[o] = content ? 200 : 0;
      buf[o + 1] = content ? 30 : 0;
      buf[o + 2] = content ? 40 : 0;
    }
  }
  const [top, bottom] = detectContentRows(buf, w, h, DEFAULT_BLACK_THRESHOLD);
  assert.equal(top, 30);
  assert.equal(bottom, 69);

  const cropped = cropBlackBars(buf, w, h);
  assert.equal(cropped.width, w);
  assert.equal(cropped.height, 40);
});

test('cropBlackBars 全黑图保持原尺寸', () => {
  const w = 20, h = 20;
  const buf = Buffer.alloc(w * h * 3); // 全 0
  const out = cropBlackBars(buf, w, h);
  assert.equal(out.height, h);
  assert.equal(out.width, w);
  assert.equal(out.data.length, buf.length);
});

// ---------- presets ----------

test('resolveCanvasSize 模板尺寸正确', () => {
  assert.deepEqual(resolveCanvasSize('landscape', 0, 0), { width: 1920, height: 1080 });
  assert.deepEqual(resolveCanvasSize('portrait', 0, 0), { width: 1080, height: 1920 });
  assert.deepEqual(resolveCanvasSize('square', 0, 0), { width: 1080, height: 1080 });
  assert.deepEqual(resolveCanvasSize('custom', 800, 600), { width: 800, height: 600 });
});

test('clampCanvas 钳制到合法区间', () => {
  assert.equal(clampCanvas(100), CANVAS_MIN);
  assert.equal(clampCanvas(99999), CANVAS_MAX);
  assert.equal(clampCanvas(Number.NaN), 1080);
  assert.equal(clampCanvas(1080.6), 1081);
});

// ---------- fileNaming ----------

test('buildOutputName 常规与 ZZO 规则', () => {
  assert.equal(buildOutputName('a.png', '色卡'), 'a_色卡.png');
  assert.equal(buildOutputName('a_ZZO.png', '色卡'), 'a_色卡_ZZO.png');
  assert.equal(buildOutputName('scene.ZZO.01.jpg', '色卡'), 'scene.色卡_ZZO.01.jpg');
});

// ---------- exporter ----------

test('exportPalettes 四种格式产物齐备且内容有效', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'huepick-test-'));
  const colors: ColorInfo[] = [
    { hex: '#CE1929', rgb: { r: 206, g: 25, b: 41 }, ratio: 0.5, population: 100 },
    { hex: '#193ACE', rgb: { r: 25, g: 58, b: 206 }, ratio: 0.5, population: 100 },
  ];
  const harmonies: HarmonyScheme[] = generateHarmonies(colors[0].rgb);
  const cardPath = path.join(tmp, 'a_色卡.png');

  const written = exportPalettes(
    path.join(tmp, 'a.png'),
    cardPath,
    colors,
    harmonies,
    ['css', 'scss', 'tailwind', 'json']
  );
  assert.equal(written.length, 4);

  const names = written.map(p => path.basename(p)).sort();
  assert.deepEqual(names, ['a_palette.css', 'a_palette.json', 'a_palette.scss', 'a_palette.tailwind.js']);

  const css = fs.readFileSync(path.join(tmp, 'a_palette.css'), 'utf8');
  assert.match(css, /:root\s*\{/);
  assert.match(css, /--huepick-1:\s*#CE1929;/);

  const scss = fs.readFileSync(path.join(tmp, 'a_palette.scss'), 'utf8');
  assert.match(scss, /\$huepick-1:\s*#CE1929;/);

  const tailwind = fs.readFileSync(path.join(tmp, 'a_palette.tailwind.js'), 'utf8');
  assert.match(tailwind, /theme:\s*\{/);
  assert.match(tailwind, /colors:\s*\{/);

  const json = JSON.parse(fs.readFileSync(path.join(tmp, 'a_palette.json'), 'utf8'));
  assert.equal(json.palette.length, 2);
  assert.equal(json.palette[0].hex, '#CE1929');
  assert.equal(json.harmonies.length, 5);
  assert.equal(json.palette[0].ratio, 0.5);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('exportPalettes 未选格式时不写文件', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'huepick-test-'));
  const written = exportPalettes(
    path.join(tmp, 'a.png'),
    path.join(tmp, 'a_色卡.png'),
    [{ hex: '#000000', rgb: { r: 0, g: 0, b: 0 }, ratio: 1, population: 1 }],
    [],
    []
  );
  assert.equal(written.length, 0);
  assert.equal(fs.readdirSync(tmp).length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------- cardRenderer 端到端 ----------

/** 用 sharp 写出一张「上/下黑边 + 左右双色」的真实 PNG，供渲染管线使用 */
async function makeRealImage(dir: string): Promise<string> {
  const w = 640, h = 360;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const inBar = y < 40 || y >= h - 40;
      const left = x < w / 2;
      buf[o] = inBar ? 0 : left ? 200 : 30;
      buf[o + 1] = inBar ? 0 : left ? 30 : 60;
      buf[o + 2] = inBar ? 0 : left ? 40 : 200;
    }
  }
  const p = path.join(dir, 'input.png');
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(p);
  return p;
}

test('generateCard 端到端：三种模板 × 两种主题渲染成功且尺寸正确', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'huepick-e2e-'));
  const src = await makeRealImage(tmp);

  const cases = [
    { name: 'landscape', w: 1920, h: 1080, bg: { r: 24, g: 24, b: 26 } },
    { name: 'portrait', w: 1080, h: 1920, bg: { r: 245, g: 245, b: 247 } },
    { name: 'square', w: 1080, h: 1080, bg: { r: 24, g: 24, b: 26 } },
  ];

  for (const c of cases) {
    const out = path.join(tmp, `${c.name}.png`);
    const res = await generateCard(src, {
      numColors: 4,
      cropBars: true,
      cardWidth: c.w,
      cardHeight: c.h,
      background: c.bg,
      outputPath: out,
    });
    assert.equal(res.success, true, `${c.name} 渲染失败: ${res.error}`);
    assert.ok(res.colors && res.colors.length >= 2, `${c.name} 主色数量不足`);
    assert.ok(fs.existsSync(out), `${c.name} 未产出文件`);

    const meta = await sharp(out).metadata();
    assert.equal(meta.width, c.w, `${c.name} 宽度不符`);
    assert.equal(meta.height, c.h, `${c.name} 高度不符`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
});
