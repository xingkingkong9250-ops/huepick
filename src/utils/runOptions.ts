import * as vscode from 'vscode';
import { ExportFormat, RGB, TemplateId, ThemeId } from '../core/types';
import { clampCanvas, resolveCanvasSize, THEME_BACKGROUNDS } from '../core/presets';
import { t } from './i18n';

/** 一次生成所用的完整参数集 */
export interface RunOptions {
  /** 输出文件名后缀 */
  suffix: string;
  /** 主色数量 */
  numColors: number;
  /** 是否裁黑边 */
  cropBars: boolean;
  /** 是否输出到原图同目录 */
  toSourceDir: boolean;
  /** 画布尺寸 */
  canvasSize: { width: number; height: number };
  /** 背景色 */
  background: RGB;
  /** 导出格式 */
  exportFormats: ExportFormat[];
  /** 导出是否含配色方案 */
  exportHarmony: boolean;
}

/** 带值的快速选择项 */
interface PickItem<T> extends vscode.QuickPickItem {
  value: T;
}

const ALL_FORMATS: ExportFormat[] = ['css', 'scss', 'tailwind', 'json'];

/** 从工作区配置读取参数 */
export function readConfigOptions(): RunOptions {
  const cfg = vscode.workspace.getConfiguration('huepick');
  const template = cfg.get<TemplateId>('template', 'landscape');
  const theme = cfg.get<ThemeId>('theme', 'dark');
  return {
    suffix: cfg.get<string>('outputSuffix', '色卡'),
    numColors: clampNumColors(cfg.get<number>('numColors', 6)),
    cropBars: cfg.get<boolean>('cropBlackBars', true),
    toSourceDir: cfg.get<boolean>('outputToSourceDir', true),
    canvasSize: resolveCanvasSize(
      template,
      cfg.get<number>('customWidth', 1920),
      cfg.get<number>('customHeight', 1080)
    ),
    background: THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS.dark,
    exportFormats: normalizeFormats(cfg.get<ExportFormat[]>('exportFormats', ['css'])),
    exportHarmony: cfg.get<boolean>('exportHarmony', true),
  };
}

/** 主色数量钳制到 3~12 */
function clampNumColors(n: number): number {
  if (!Number.isFinite(n)) return 6;
  return Math.min(12, Math.max(3, Math.round(n)));
}

/** 过滤掉非法导出格式 */
function normalizeFormats(formats: ExportFormat[] | undefined): ExportFormat[] {
  if (!Array.isArray(formats)) return [];
  return formats.filter((f) => ALL_FORMATS.includes(f));
}

/** 生成一句话摘要，用于快速选择项描述 */
function describe(o: RunOptions): string {
  const tpl = `${o.canvasSize.width}×${o.canvasSize.height}`;
  const isDark = o.background.r < 128;
  const theme = isDark ? t('themeDark') : t('themeLight');
  const fmts = o.exportFormats.length > 0 ? o.exportFormats.join(', ') : '—';
  return `${tpl} · ${o.numColors} · ${theme} · ${fmts}`;
}

/**
 * 询问本次生成参数。
 * 首选「使用当前设置」（一键直出），或进入自定义流程逐项覆盖。
 *
 * @returns 参数集；用户取消时返回 undefined
 */
export async function resolveRunOptions(): Promise<RunOptions | undefined> {
  const current = readConfigOptions();

  const mode = await vscode.window.showQuickPick<PickItem<'current' | 'custom'>>(
    [
      { label: `$(play) ${t('useCurrent')}`, description: describe(current), value: 'current' },
      { label: `$(settings-gear) ${t('customParams')}`, value: 'custom' },
    ],
    { title: t('paramsTitle'), placeHolder: describe(current) }
  );

  if (!mode) return undefined;
  if (mode.value === 'current') return current;

  const customized = await customFlow(current);
  return customized;
}

/** 逐项自定义参数 */
async function customFlow(base: RunOptions): Promise<RunOptions | undefined> {
  const out: RunOptions = { ...base, canvasSize: { ...base.canvasSize } };

  // 1. 模板
  const templateItems: PickItem<TemplateId>[] = [
    { label: t('templateLandscape'), value: 'landscape' },
    { label: t('templatePortrait'), value: 'portrait' },
    { label: t('templateSquare'), value: 'square' },
    { label: t('templateCustom'), value: 'custom' },
  ];
  const template = await vscode.window.showQuickPick(templateItems, { title: t('templateTitle') });
  if (!template) return undefined;

  if (template.value === 'custom') {
    const size = await askCustomSize(base);
    if (!size) return undefined;
    out.canvasSize = size;
  } else {
    out.canvasSize = resolveCanvasSize(template.value, 0, 0);
  }

  // 2. 主色数量
  const colorItems: PickItem<number>[] = [];
  for (let n = 3; n <= 12; n++) {
    colorItems.push({ label: `${n}`, description: n === base.numColors ? t('useCurrent') : '', value: n });
  }
  const colors = await vscode.window.showQuickPick(colorItems, { title: t('colorsTitle') });
  if (!colors) return undefined;
  out.numColors = colors.value;

  // 3. 主题
  const themeItems: PickItem<ThemeId>[] = [
    { label: t('themeDark'), value: 'dark' },
    { label: t('themeLight'), value: 'light' },
  ];
  const theme = await vscode.window.showQuickPick(themeItems, { title: t('themeTitle') });
  if (!theme) return undefined;
  out.background = THEME_BACKGROUNDS[theme.value];

  // 4. 导出格式（多选）
  const formatItems: PickItem<ExportFormat>[] = ALL_FORMATS.map((f) => ({
    label: f,
    picked: base.exportFormats.includes(f),
    value: f,
  }));
  const formats = await vscode.window.showQuickPick(formatItems, {
    title: t('exportTitle'),
    canPickMany: true,
  });
  if (!formats) return undefined;
  out.exportFormats = formats.map((f) => f.value);

  return out;
}

/** 询问自定义画布尺寸 */
async function askCustomSize(
  base: RunOptions
): Promise<{ width: number; height: number } | undefined> {
  const widthText = await vscode.window.showInputBox({
    title: t('templateCustom'),
    prompt: t('customSizeWidth'),
    value: String(base.canvasSize.width),
    validateInput: validateCanvasInput,
  });
  if (widthText === undefined) return undefined;

  const heightText = await vscode.window.showInputBox({
    title: t('templateCustom'),
    prompt: t('customSizeHeight'),
    value: String(base.canvasSize.height),
    validateInput: validateCanvasInput,
  });
  if (heightText === undefined) return undefined;

  return { width: clampCanvas(Number(widthText)), height: clampCanvas(Number(heightText)) };
}

/** 输入校验：必须为 400~4096 的整数 */
function validateCanvasInput(value: string): string | undefined {
  const n = Number(value);
  if (!Number.isInteger(n)) return '400 ~ 4096';
  if (n < 400 || n > 4096) return '400 ~ 4096';
  return undefined;
}
