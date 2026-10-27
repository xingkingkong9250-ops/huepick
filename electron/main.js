// Electron 主进程 —— HuePick 桌面版
// 复用 out/core 下编译好的核心模块

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 版本号（单一来源 = package.json）
let PKG_VERSION = app.getVersion();
try {
  // 优先读源文件（开发模式 asar 外），app.getVersion() 在某些打包场景可能返回意外值
  const pkgPath = path.join(__dirname, '..', 'package.json');
  if (fs.existsSync(pkgPath)) {
    PKG_VERSION = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  }
} catch (_) { /* keep app.getVersion() result */ }

// 窗口图标（build/ 在 asar 里和 electron/ 同级，所以相对路径通用）
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');

// 核心模块（共享 VS Code 扩展的编译产物）
let generateCard, generateHarmonies, exportPalettes, TEMPLATE_SIZES;
try {
  ({ generateCard } = require('../out/core/cardRenderer'));
  ({ generateHarmonies } = require('../out/core/colorHarmony'));
  ({ exportPalettes } = require('../out/core/exporter'));
  ({ TEMPLATE_SIZES } = require('../out/core/presets'));
  console.log('[HuePick] core modules loaded OK');
} catch (err) {
  console.error('[HuePick] core modules LOAD FAILED:', err.message);
  process.env.HUEPICK_CORE_ERROR = err.message;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'HuePick — 拾色',
    icon: ICON_PATH,
    backgroundColor: '#1a1a1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,              // 允许 file:// 协议加载预览图
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 开发模式才自动开 DevTools（设置环境变量 HUEPICK_DEV=1 即可开启）
  if (process.env.HUEPICK_DEV === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 核心模块加载失败提前暴露
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[HuePick] load failed:', code, desc);
  });

  // 关闭主窗口时强制退出（确保所有子进程同步终止）
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// 兜底：退出前清理所有子进程
app.on('before-quit', () => {
  process.exitCode = 0;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ========== IPC Handlers ==========

ipcMain.handle('app-version', () => PKG_VERSION);

/** 选择文件夹 → 返回图片文件列表 */
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择包含图片的文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
  const files = fs.readdirSync(dir)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(dir, f));
  return { dir, files };
});

/** 选择文件（可多选） */
ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] },
    ],
    title: '选择图片',
  });
  if (result.canceled) return null;
  return result.filePaths;
});

/** 主入口：生成色卡 */
ipcMain.handle('generate-card', async (_evt, payload) => {
  if (!generateCard) {
    return { ok: false, error: '核心模块加载失败：' + process.env.HUEPICK_CORE_ERROR };
  }
  const {
    sourcePath,
    numColors = 6,
    cropBars = true,
    template = 'landscape',
    customWidth = 1920,
    customHeight = 1080,
    theme = 'dark',
    outputFormat = 'jpg',
    preview = false,
    exportFormats = [],
    exportHarmony = false,
    outputSuffix = '色卡',
  } = payload;

  try {
    // 1. 确定色卡尺寸
    let w = customWidth, h = customHeight;
    if (template !== 'custom' && TEMPLATE_SIZES) {
      const preset = TEMPLATE_SIZES[template];
      if (preset) { w = preset.width; h = preset.height; }
    }

    // 所有模板均跟随色数参数，色板/色块条数自适应

    // 2. 主题背景色
    const bg = theme === 'light'
      ? { r: 245, g: 245, b: 247 }
      : { r: 24, g: 24, b: 26 };

    // 3. 输出路径（预览模式落临时目录，正式生成落原图目录 + 冲突自动编号）
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const ext = outputFormat === 'png' ? '.png' : '.jpg';
    let dir;
    if (preview) {
      dir = path.join(app.getPath('temp'), 'HuePick-preview');
      fs.mkdirSync(dir, { recursive: true });
    } else {
      dir = path.dirname(sourcePath);
    }
    let outPath = path.join(dir, `${base}_${outputSuffix}${ext}`);
    if (!preview && fs.existsSync(outPath)) {
      let n = 2;
      while (fs.existsSync(path.join(dir, `${base}_${outputSuffix} (${n})${ext}`))) n++;
      outPath = path.join(dir, `${base}_${outputSuffix} (${n})${ext}`);
    }

    // 4. 生成色卡
    const result = await generateCard(sourcePath, {
      numColors,
      cropBars,
      cardWidth: w,
      cardHeight: h,
      background: bg,
      outputPath: outPath,
      outputFormat,
      template,
    });

    if (!result.success) {
      return { ok: false, error: result.error };
    }

    // 5. 导出辅助格式（配色规则 + CSS/SCSS/Tailwind/JSON）
    let extraFiles = [];
    const allColors = result.colors || [];
    if (allColors.length > 0 && exportPalettes) {
      const harmonies = exportHarmony && generateHarmonies
        ? generateHarmonies(allColors[0].rgb)
        : [];
      try {
        extraFiles = exportPalettes(sourcePath, outPath, allColors, harmonies, exportFormats);
      } catch (e) {
        console.error('[HuePick] exportPalettes error:', e.message);
      }
    }

    return {
      ok: true,
      cardPath: outPath,
      colors: result.colors,
      extraFiles,
    };
  } catch (err) {
    console.error('[HuePick] generate-card FAILED:', err.message, err.stack);
    return { ok: false, error: err.message || String(err) };
  }
});

/** 把本地路径转成 file:// URL（主进程生成最稳） */
ipcMain.handle('path-to-url', async (_evt, filePath) => {
  try {
    const { pathToFileURL } = require('url');
    return pathToFileURL(filePath).href;
  } catch (e) {
    return 'file:///' + filePath.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1');
  }
});

/** 用系统默认程序打开文件 */
ipcMain.handle('open-file', async (_evt, filePath) => {
  const { shell } = require('electron');
  await shell.openPath(filePath);
  return true;
});

/** 用资源管理器打开文件夹 */
ipcMain.handle('show-in-folder', async (_evt, filePath) => {
  const { shell } = require('electron');
  shell.showItemInFolder(filePath);
  return true;
});

/** 复制到剪贴板 */
ipcMain.handle('copy-text', async (_evt, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return true;
});

// ---------- 预览缓存管理 ----------
const PREVIEW_DIR = path.join(app.getPath('temp'), 'HuePick-preview');

function getPreviewCacheInfo() {
  if (!fs.existsSync(PREVIEW_DIR)) return { count: 0, size: 0 };
  let count = 0, size = 0;
  for (const f of fs.readdirSync(PREVIEW_DIR)) {
    const fp = path.join(PREVIEW_DIR, f);
    try { const st = fs.statSync(fp); if (st.isFile()) { count++; size += st.size; } } catch (_) {}
  }
  return { count, size };
}

ipcMain.handle('preview-cache-info', () => getPreviewCacheInfo());

ipcMain.handle('clear-preview-cache', () => {
  const info = getPreviewCacheInfo();
  try {
    if (fs.existsSync(PREVIEW_DIR)) {
      fs.rmSync(PREVIEW_DIR, { recursive: true, force: true });
    }
  } catch (_) { /* 部分文件可能被占用 */ }
  return info;
});
