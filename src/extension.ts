import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { generateCard } from './core/cardRenderer';
import { generateHarmonies } from './core/colorHarmony';
import { exportPalettes } from './core/exporter';
import { BatchSummary, ProcessResult } from './core/types';
import { collectImages, isImageFile, resolveOutputPath } from './utils/fileNaming';
import { RunOptions, resolveRunOptions } from './utils/runOptions';
import { t } from './utils/i18n';

export function activate(context: vscode.ExtensionContext) {
  /**
   * 批量处理一组图片。
   * 支持用户取消：取消后停止后续处理并返回已完成结果。
   */
  const processBatch = async (
    files: string[],
    options: RunOptions,
    outputDir: string | undefined,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ): Promise<BatchSummary> => {
    const results: ProcessResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      if (token.isCancellationRequested) break;

      const src = files[i];
      const outPath = resolveOutputPath(src, options.suffix, outputDir);
      progress.report({
        message: `(${i + 1}/${files.length}) ${path.basename(src)}`,
        increment: 100 / files.length,
      });

      const result = await generateCard(src, {
        numColors: options.numColors,
        cropBars: options.cropBars,
        cardWidth: options.canvasSize.width,
        cardHeight: options.canvasSize.height,
        background: options.background,
        outputPath: outPath,
      });

      // 成功后：生成配色方案并按需导出
      if (result.success && result.colors && result.colors.length > 0) {
        try {
          const harmonies = options.exportHarmony ? generateHarmonies(result.colors[0].rgb) : [];
          result.harmonies = harmonies;
          if (options.exportFormats.length > 0) {
            result.exportedFiles = exportPalettes(
              src,
              outPath,
              result.colors,
              harmonies,
              options.exportFormats
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
    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`${t('brand')}: ${t('targetNotExist', targetPath)}`);
      return;
    }

    // 1. 询问本次生成参数
    const options = await resolveRunOptions();
    if (!options) return;

    // 2. 解析输出目录
    let outputDir: string | undefined;
    if (!options.toSourceDir) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: t('pickOutputDir'),
      });
      if (!picked || picked.length === 0) { return; }
      outputDir = picked[0].fsPath;
    }

    // 3. 收集要处理的图片
    const files = collectImages(targetPath, options.suffix);
    if (files.length === 0) {
      vscode.window.showWarningMessage(`${t('brand')}: ${t('noImages')}`);
      return;
    }

    // 4. 带进度、可取消的批量处理
    let cancelled = false;
    const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${t('brand')}: ${t('progressTitle')}`,
        cancellable: true,
      },
      (progress, token) => {
        token.onCancellationRequested(() => { cancelled = true; });
        return processBatch(files, options, outputDir, progress, token);
      }
    );

    // 5. 结果反馈
    const exportCount = summary.results.reduce(
      (sum, r) => sum + (r.exportedFiles?.length ?? 0),
      0
    );
    const exportNote = exportCount > 0 ? t('exportNote', exportCount) : '';

    if (cancelled) {
      vscode.window.showInformationMessage(
        `${t('brand')}: ${t('resultCancelled', summary.succeeded, exportNote)}`
      );
    } else if (summary.failed > 0) {
      vscode.window.showWarningMessage(
        `${t('brand')}: ${t('resultPartial', summary.succeeded, summary.failed, exportNote)}`
      );
    } else {
      vscode.window.showInformationMessage(
        `${t('brand')}: ${t('resultDone', summary.succeeded, exportNote)}`
      );
    }

    // 单文件场景：自动打开结果
    if (!cancelled && summary.succeeded > 0 && files.length === 1 && fs.statSync(targetPath).isFile()) {
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
      vscode.window.showWarningMessage(`${t('brand')}: ${t('openImageFirst')}`);
      return;
    }
    if (!isImageFile(uri.fsPath)) {
      vscode.window.showWarningMessage(`${t('brand')}: ${t('unsupportedFormat')}`);
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
      openLabel: t('chooseFolder'),
    });
    if (!uris || uris.length === 0) { return; }
    await runOnPath(uris[0].fsPath);
  });

  context.subscriptions.push(pickActive, pickExplorer, pickFolder);
}

export function deactivate() {}
