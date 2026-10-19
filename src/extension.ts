import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

interface RunOptions {
  targetPath: string;
  outputDir?: string;
}

interface RunResult {
  okCount: number;
  failCount: number;
  stdout: string;
  stderr: string;
}

export function activate(context: vscode.ExtensionContext) {
  const scriptPath = path.join(context.extensionPath, 'python', 'color_card_tool.py');

  /** 调用 Python 脚本生成色卡。返回 null 表示进程级失败。 */
  const runPython = (pythonPath: string, args: string[]): Promise<RunResult | null> =>
    new Promise((resolve) => {
      execFile(
        pythonPath,
        args,
        { maxBuffer: 32 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            vscode.window.showErrorMessage(
              `拾色 HuePick 调用失败：${stderr || err.message}`
            );
            resolve(null);
            return;
          }
          const okCount = (stdout.match(/\[OK\]/g) || []).length;
          const failCount = (stdout.match(/\[FAIL\]/g) || []).length + (stderr.match(/\[FAIL\]/g) || []).length;
          resolve({ okCount, failCount, stdout, stderr });
        }
      );
    });

  const runOnPath = async (opts: RunOptions) => {
    const { targetPath } = opts;
    const cfg = vscode.workspace.getConfiguration('huepick');
    const pythonPath = cfg.get<string>('pythonPath', 'python');
    const numColors = cfg.get<number>('numColors', 6);
    const cropBars = cfg.get<boolean>('cropBlackBars', true);
    const suffix = cfg.get<string>('outputSuffix', '色卡');
    const toSourceDir = cfg.get<boolean>('outputToSourceDir', true);

    if (!fs.existsSync(scriptPath)) {
      vscode.window.showErrorMessage(`拾色 HuePick：找不到脚本 ${scriptPath}`);
      return;
    }
    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`拾色 HuePick：目标路径不存在 ${targetPath}`);
      return;
    }

    // 解析输出目录：优先调用方传入 → 配置项 outputToSourceDir=false 时弹窗选 → 默认同源目录
    let outputDir = opts.outputDir;
    if (!outputDir && !toSourceDir) {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '选择色卡输出目录',
      });
      if (!picked || picked.length === 0) { return; }
      outputDir = picked[0].fsPath;
    }

    const args = [scriptPath, targetPath, '--colors', String(numColors), '--suffix', suffix];
    if (!cropBars) { args.push('--no-crop'); }
    if (outputDir) { args.push('--output', outputDir); }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '拾色 HuePick：正在生成色卡…',
        cancellable: false,
      },
      async () => {
        const result = await runPython(pythonPath, args);
        if (!result) { return; }

        const { okCount, failCount } = result;
        if (failCount > 0) {
          vscode.window.showWarningMessage(
            `拾色 HuePick：成功 ${okCount} 张，失败 ${failCount} 张（详见输出面板）。`
          );
        } else if (okCount > 0) {
          vscode.window.showInformationMessage(`拾色 HuePick：完成，生成 ${okCount} 张色卡。`);
        } else {
          vscode.window.showWarningMessage('拾色 HuePick：未找到任何可处理的图片。');
          return;
        }

        // 自动打开第一张结果（仅单文件场景）
        if (okCount > 0 && fs.statSync(targetPath).isFile()) {
          const dir = outputDir ?? path.dirname(targetPath);
          const name = path.basename(targetPath);
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          const outName = base.includes('ZZO')
            ? base.replace('ZZO', `${suffix}_ZZO`) + ext
            : `${base}_${suffix}${ext}`;
          const outPath = path.join(dir, outName);
          if (fs.existsSync(outPath)) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outPath));
          }
        }
      }
    );
  };

  /** 校验路径是支持的图片或目录。 */
  const isImageFile = (p: string) =>
    fs.existsSync(p) && fs.statSync(p).isFile() && IMAGE_EXTS.has(path.extname(p).toLowerCase());

  // 命令 1：当前编辑器打开的图片
  const pickActive = vscode.commands.registerCommand('huepick.pickFromActiveFile', async () => {
    // 优先取当前激活的 Tab（兼容 CustomEditor / 图片预览）
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
    await runOnPath({ targetPath: uri.fsPath });
  });

  // 命令 2：资源管理器右键（文件或文件夹）
  const pickExplorer = vscode.commands.registerCommand('huepick.pickFromExplorer', async (uri: vscode.Uri) => {
    if (!uri || uri.scheme !== 'file') { return; }
    await runOnPath({ targetPath: uri.fsPath });
  });

  // 命令 3：命令面板里选文件夹
  const pickFolder = vscode.commands.registerCommand('huepick.pickFromFolder', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: '选择包含图片的文件夹',
    });
    if (!uris || uris.length === 0) { return; }
    await runOnPath({ targetPath: uris[0].fsPath });
  });

  context.subscriptions.push(pickActive, pickExplorer, pickFolder);
}

export function deactivate() {}
