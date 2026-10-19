import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { generateCard } from './core/cardRenderer';
import { generateHarmonies } from './core/colorHarmony';
import { exportPalettes } from './core/exporter';
import {
  BatchSummary,
  ExportFormat,
  ProcessResult,
  RGB,
  TemplateId,
  ThemeId,
} from './core/types';
import { collectImages, isImageFile, resolveOutputPath } from './utils/fileNaming';

/** 模板尺寸表 */
const TEMPLATE_SIZES: Record<Exclude<TemplateId, 'custom'>, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** 主题背景色 */
const THEME_BACKGROUNDS: Record<ThemeId, RGB> = {
  dark: { r: 24, g: 24, b: 26 },
  light: { r: 245, g: 245, b: 247 },
};

/** 从配置解析画布尺寸 */
function resolveCanvasSize(cfg: vscode.WorkspaceConfiguration): { width: number; height: number } {
  const template = cfg.get<TemplateId>('template', 'landscape');
  if (template === 'custom') {
    const width = cfg.get<number>('customWidth', 1920);
    const height = cfg.get<number>('customHeight', 1080);
    return {
      width: Math.min(4096, Math.max(400, width)),
      height: Math.min(4096, Math.max(400, height)),
    };
  }
  return TEMPLATE_SIZES[template] ?? TEMPLATE_SIZES.landscape;
}

export function activate(context: vscode.ExtensionContext) {
  /** 批量处理一组图片 */
  const processBatch = async (
    files: string[],
    suffix: string,
    numColors: number,
    cropBars: boolean,
    outputDir: string | undefined,
    canvasSize: { width: number; height: number },
    background: RGB,
    exportFormats: ExportFormat[],
    exportHarmony: boolean,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<BatchSummary> => {
    const results: ProcessResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const src = files[i];
      const outPath = resolveOutputPath(src, suffix, outputDir);
      progress.report({
        message: `(${i + 1}/${files.length}) ${path.basename(src)}`,
        increment: 100 / files.length,
      });

      const result = await generateCard(src, {
        numColors,
        cropBars,
        cardWidth: canvasSize.width,
        cardHeight: canvasSize.height,
        background,
        outputPath: outPath,
      });

      // 成功后：生成配色方案并按需导出
      if (result.success && result.colors && result.colors.length > 0) {
        try {
          const harmonies = exportHarmony ? generateHarmonies(result.colors[0].rgb) : [];
          result.harmonies = harmonies;
          if (exportFormats.length > 0) {
            result.exportedFiles = exportPalettes(
              src,
              outPath,
              result.colors,
              harmonies,
              exportFormats
            );
          }
        } catch (err) {
          console.error(`[HuePick EXPORT FAIL] ${src}: ${err}`);
        }
      }

      results.push(result);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        console.error(`[HuePick FAIL] ${src}: ${result.error}`);
      }
    }

    return { total: files.length, succeeded, failed, results };
  };

  /** 主入口：处理一个目标路径（文件或目录） */
  const runOnPath = async (targetPath: string) => {
    const cfg = vscode.workspace.getConfiguration('huepick');
    const numColors = cfg.get<number>('numColors', 6);
    const cropBars = cfg.get<boolean>('cropBlackBars', true);
    const suffix = cfg.get<string>('outputSuffix', '色卡');
    const toSourceDir = cfg.get<boolean>('outputToSourceDir', true);
    const theme = cfg.get<ThemeId>('theme', 'dark');
    const exportFormats = cfg.get<ExportFormat[]>('exportFormats', ['css']);
    const exportHarmony = cfg.get<boolean>('exportHarmony', true);
    const canvasSize = resolveCanvasSize(cfg);
    const background = THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS.dark;

    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`拾色 HuePick：目标路径不存在 ${targetPath}`);
      return;
    }

    // 解析输出目录
    let outputDir: string | undefined;
    if (!toSourceDir) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '选择色卡输出目录',
      });
      if (!picked || picked.length === 0) { return; }
      outputDir = picked[0].fsPath;
    }

    // 收集要处理的图片
    const files = collectImages(targetPath, suffix);
    if (files.length === 0) {
      vscode.window.showWarningMessage('拾色 HuePick：未找到任何可处理的图片。');
      return;
    }

    // 带进度的批量处理
    const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '拾色 HuePick：正在生成色卡…',
        cancellable: false,
      },
      (progress) =>
        processBatch(
          files,
          suffix,
          numColors,
          cropBars,
          outputDir,
          canvasSize,
          background,
          exportFormats,
          exportHarmony,
          progress
        )
    );

    // 结果反馈
    const exportCount = summary.results.reduce(
      (sum, r) => sum + (r.exportedFiles?.length ?? 0),
      0
    );
    const exportNote = exportCount > 0 ? `，导出配色文件 ${exportCount} 个` : '';
    if (summary.failed > 0) {
      vscode.window.showWarningMessage(
        `拾色 HuePick：成功 ${summary.succeeded} 张，失败 ${summary.failed} 张${exportNote}（详见控制台）。`
      );
    } else {
      vscode.window.showInformationMessage(
        `拾色 HuePick：完成，生成 ${summary.succeeded} 张色卡${exportNote}。`
      );
    }

    // 单文件场景：自动打开结果
    if (summary.succeeded > 0 && files.length === 1 && fs.statSync(targetPath).isFile()) {
      const firstOk = summary.results.find((r) => r.success);
      if (firstOk && fs.existsSync(firstOk.outputPath)) {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(firstOk.outputPath));
      }
    }
  };

  // 命令 1：当前编辑器打开的图片
  const pickActive = vscode.commands.registerCommand('huepick.pickFromActiveFile', async () => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const tabInput = tab?.input as { uri?: vscode.Uri } | undefined;
    let uri = tabInput?.uri;
    if (!uri && vscode.window.activeTextEditor) {
      uri = vscode.window.activeTextEditor.document.uri;
    }
    if (!uri || uri.scheme !== 'file') {
      vscode.window.showWarningMessage('拾色 HuePick：请先在编辑器中打开一张图片。');
      return;
    }
    if (!isImageFile(uri.fsPath)) {
      vscode.window.showWarningMessage('拾色 HuePick：当前文件不是受支持的图片格式。');
      return;
    }
    await runOnPath(uri.fsPath);
  });

  // 命令 2：资源管理器右键
  const pickExplorer = vscode.commands.registerCommand('huepick.pickFromExplorer', async (uri: vscode.Uri) => {
    if (!uri || uri.scheme !== 'file') { return; }
    await runOnPath(uri.fsPath);
  });

  // 命令 3：命令面板选文件夹
  const pickFolder = vscode.commands.registerCommand('huepick.pickFromFolder', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: '选择包含图片的文件夹',
    });
    if (!uris || uris.length === 0) { return; }
    await runOnPath(uris[0].fsPath);
  });

  context.subscriptions.push(pickActive, pickExplorer, pickFolder);
}

export function deactivate() {}
