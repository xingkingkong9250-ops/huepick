// HuePick 渲染进程 —— 交互逻辑
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
const listEl = $('#file-list');
const previewEl = $('#preview');

const state = { files: [], selectedIdx: -1 };

// ============ 日志 ============
function log(msg, cls = 'info') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[HuePick.${cls}] ${msg}`);
}

// ============ 路径解析 ============
const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
function isImagePath(p) { return EXTS.some(e => p.toLowerCase().endsWith(e)); }

/** File → 真实路径，Electron 专用 */
function getFilePath(file) {
  // 优先用 Electron 官方 API（最可靠）
  if (window.huepick && window.huepick.getPathForFile) {
    const p = window.huepick.getPathForFile(file);
    if (p && typeof p === 'string' && p.length > 0) return p;
  }
  // 回退：Electron 早期版本扩展的 File.path
  if (file.path && typeof file.path === 'string' && file.path.length > 0) return file.path;
  return null;
}

/** 递归遍历拖拽目录 */
function readEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => resolve([f]), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readAll = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          for (const e of entries) {
            const sub = await readEntry(e);
            all.push(...sub);
          }
          readAll(); // 继续读（目录可能分多次返回）
        }, () => resolve(all));
      };
      readAll();
    } else {
      resolve([]);
    }
  });
}

/** 从拖拽事件拿到所有真实路径（多路径合并去重） */
async function pathsFromDrag(e) {
  const set = new Set();
  const items = e.dataTransfer.items;
  const files = e.dataTransfer.files;

  console.log('[HuePick.drag] items:', items?.length, 'files:', files?.length);

  // 路径 1：dataTransfer.files + webUtils.getPathForFile
  // Electron 官方推荐，对多选图片最稳；但无法区分文件夹 vs 文件
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const p = getFilePath(files[i]);
      if (p && isImagePath(p)) { set.add(p); console.log('[HuePick.drag.file]', p); }
    }
  }

  // 路径 2：items + webkitGetAsEntry（能处理文件夹递归）
  // Chromium 在 Electron 里对多文件场景常只返回第一个 item 的 entry，
  // 所以这条路径必须和路径 1 合并，不能互相遮挡
  if (items && items.length > 0 && items[0].webkitGetAsEntry) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (!entry) continue;
      if (entry.isFile) {
        const f = await new Promise((res) => entry.file ? entry.file(res) : res(null));
        if (f) {
          const p = getFilePath(f);
          if (p && isImagePath(p)) { set.add(p); console.log('[HuePick.drag.entry] file:', p); }
        }
      } else if (entry.isDirectory) {
        const sub = await readEntry(entry);
        for (const f of sub) {
          const p = getFilePath(f);
          if (p && isImagePath(p)) { set.add(p); console.log('[HuePick.drag.entry] dir:', p); }
        }
      }
    }
  }

  const result = [...set];
  console.log('[HuePick.drag] =>', result.length, 'unique paths');
  return result;
}

// ============ 文件列表 ============
function addPaths(paths) {
  const existing = new Set(state.files);
  let added = 0;
  paths.forEach(p => {
    if (!existing.has(p)) { state.files.push(p); added++; }
  });
  if (added > 0) {
    log(`+${added} 张图片`, 'ok');
    // 首次添加时自动选中第一张，触发预览
    if (state.selectedIdx < 0 || state.selectedIdx >= state.files.length) {
      state.selectedIdx = 0;
    }
  }
  renderList();
  triggerPreviewDebounced();
}

function renderList() {
  listEl.innerHTML = '';
  state.files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item' + (i === state.selectedIdx ? ' selected' : '');
    const encodedPath = encodeURI(f).replace(/%5C/g, '/');
    div.innerHTML = `
      <img class="file-thumb" src="file:///${encodedPath}" />
      <div class="file-meta">
        <div class="file-name">${f.split(/[\\/]/).pop()}</div>
        <div class="file-path">${f}</div>
      </div>
      <button class="file-remove" title="移除" data-i="${i}">✕</button>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('file-remove')) {
        state.files.splice(i, 1);
        if (state.selectedIdx >= state.files.length) state.selectedIdx = state.files.length - 1;
        renderList();
        triggerPreviewDebounced();
        return;
      }
      state.selectedIdx = i;
      renderList();
      triggerPreviewDebounced();
    });
    listEl.appendChild(div);
  });
  $('#drop').style.display = state.files.length === 0 ? 'block' : 'none';
}

// ============ 拖拽（统一 document 接收，#drop 仅视觉提示） ============
const dropEl = $('#drop');

// 所有元素默认拦截（Electron 允许原生文件拖拽）
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropEl.classList.add('dragover');
});
document.addEventListener('dragleave', () => {
  dropEl.classList.remove('dragover');
});

async function onDrop(e) {
  e.preventDefault();
  dropEl.classList.remove('dragover');
  const paths = await pathsFromDrag(e);
  if (paths.length > 0) {
    addPaths(paths);
  } else {
    log('未识别到图片（仅支持 PNG/JPG/WEBP/BMP/TIFF）', 'err');
  }
}
document.addEventListener('drop', onDrop);

// ============ 按钮 ============
$('#btn-files').addEventListener('click', async () => {
  const paths = await window.huepick.pickFiles();
  if (paths && paths.length > 0) addPaths(paths);
});
$('#btn-folder').addEventListener('click', async () => {
  const result = await window.huepick.pickFolder();
  if (result && result.files.length > 0) addPaths(result.files);
});
$('#btn-clear').addEventListener('click', () => {
  state.files = [];
  state.selectedIdx = -1;
  renderList();
  showPreviewEmpty();
  log('已清空', 'info');
});

function showPreviewEmpty() {
  const d = document.createElement('div');
  d.className = 'preview-empty';
  d.innerHTML = '<div class="pe-icon">🎯</div><div>选择图片后自动生成预览</div>';
  previewEl.innerHTML = '';
  previewEl.appendChild(d);
}

// ============ 生成 payload ============
function readPayload() {
  return {
    numColors: parseInt($('#p-colors').value),
    cropBars: $('#p-crop').checked,
    template: $('#p-template').value,
    theme: $('#p-theme').value,
    outputFormat: $('#p-format').value,  // 'jpg' | 'png'
    exportFormats: [],
    exportHarmony: false,
  };
}

// ============ 单文件预览生成（debounce） ============
let previewDebounce = null;
async function generatePreview(targetFile) {
  if (!targetFile) { showPreviewEmpty(); return; }
  log(`预览：${targetFile.split(/[\\/]/).pop()}`, 'info');
  try {
    const r = await window.huepick.generateCard({ ...readPayload(), sourcePath: targetFile, preview: true });
    if (r.ok) showPreview(r);
    else log(`预览失败：${r.error}`, 'err');
  } catch (e) {
    log(`预览异常：${e.message}`, 'err');
  }
}
function triggerPreviewDebounced() {
  const f = state.files[state.selectedIdx >= 0 ? state.selectedIdx : 0];
  if (!f) return;
  if (previewDebounce) clearTimeout(previewDebounce);
  previewDebounce = setTimeout(() => generatePreview(f), 350);
}

// ============ 生成 ============
$('#btn-generate').addEventListener('click', async () => {
  if (state.files.length === 0) { log('请先添加图片', 'err'); return; }

  const payload = readPayload();

  const btn = $('#btn-generate');
  btn.disabled = true;
  $('#gen-text').textContent = '⏳ 生成中…';

  const outputs = [];
  for (let i = 0; i < state.files.length; i++) {
    const f = state.files[i];
    const name = f.split(/[\\/]/).pop();
    log(`(${i + 1}/${state.files.length}) ${name}`, 'info');
    try {
      const r = await window.huepick.generateCard({ ...payload, sourcePath: f });
      if (r.ok) {
        outputs.push(r);
        log(`  ✓ ${name}`, 'ok');
        log(`    色卡: ${r.cardPath}`, 'info');
        r.extraFiles.forEach(ef => log(`    + ${ef.split(/[\\/]/).pop()}`, 'info'));
      } else {
        log(`  ✗ ${r.error}`, 'err');
      }
    } catch (e) {
      log(`  ✗ 异常: ${e.message || e}`, 'err');
    }
  }

  btn.disabled = false;
  $('#gen-text').textContent = '🚀 生成色卡';

  if (outputs.length > 0) {
    showPreview(outputs[0]);
    log(`完成：${outputs.length}/${state.files.length} 成功`, 'ok');
  } else {
    log('全部失败，请检查 DevTools Console', 'err');
  }
});

// ============ 预览 ============
async function showPreview(result) {
  previewEl.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'preview-card';

  const img = document.createElement('img');
  img.alt = '色卡预览';
  const cacheBuster = `?t=${Date.now()}`;
  try {
    img.src = await window.huepick.pathToUrl(result.cardPath) + cacheBuster;
  } catch {
    img.src = 'file:///' + result.cardPath.replace(/\\/g, '/') + cacheBuster;
  }

  img.onerror = () => log('预览图加载失败：' + result.cardPath, 'err');

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.innerHTML = `
    <button id="act-open">打开</button>
    <button id="act-folder">定位到文件夹</button>
  `;
  actions.querySelector('#act-open').onclick = () => window.huepick.openFile(result.cardPath);
  actions.querySelector('#act-folder').onclick = () => window.huepick.showInFolder(result.cardPath);

  card.appendChild(img);
  card.appendChild(actions);

  if (result.colors && result.colors.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'colors-strip';
    result.colors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      chip.style.background = c.hex;
      chip.title = `${c.hex}  占比 ${(c.ratio * 100).toFixed(1)}%`;
      chip.onclick = async () => {
        await window.huepick.copyText(c.hex);
        log(`已复制 ${c.hex}`, 'ok');
      };
      const lbl = document.createElement('span');
      lbl.className = 'hex';
      lbl.textContent = c.hex;
      chip.appendChild(lbl);
      strip.appendChild(chip);
    });
    card.appendChild(strip);
  }

  previewEl.appendChild(card);
}

// ============ 初始化 ============
renderList();
showPreviewEmpty();
log('HuePick 桌面版就绪（DevTools 已打开）', 'ok');

// 参数变化 → debounce 自动刷新预览
const previewTriggers = ['#p-colors', '#p-template', '#p-theme', '#p-crop'];
previewTriggers.forEach(sel => {
  const el = document.querySelector(sel);
  if (!el) return;
  el.addEventListener('change', triggerPreviewDebounced);
  el.addEventListener('input', triggerPreviewDebounced); // number 滑块
});

// 版本号从 package.json 动态读取
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('ver');
  if (el && window.huepick?.version) el.textContent = 'v' + window.huepick.version;
});

// 全局错误捕获
window.addEventListener('error', (e) => {
  log(`[JS ERROR] ${e.message} @ ${e.filename}:${e.lineno}`, 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  log(`[PROMISE] ${e.reason?.message || e.reason}`, 'err');
});
