// HuePick 渲染进程 —— 交互逻辑
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
const listEl = $('#file-list');
const previewEl = $('#preview');

// selected: Set<number>，多选；lastClickedIdx: Shift 锚点 + 预览目标
const state = { files: [], selected: new Set(), lastClickedIdx: -1 };

// ============ 日志 & 底栏状态 ============
function log(msg, cls = 'info') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[HuePick.${cls}] ${msg}`);
}

function setStatus(text) {
  const el = $('#status-text');
  if (el) el.textContent = text;
}

function updateStatusBar() {
  const n = state.files.length;
  const sel = state.selected.size;
  if (n === 0) setStatus('就绪');
  else if (sel === 0) setStatus(`共 ${n} 张图片`);
  else setStatus(`已选中 ${sel} / ${n} 张`);
}

// ============ 路径解析 ============
const EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
function isImagePath(p) { return EXTS.some(e => p.toLowerCase().endsWith(e)); }

/** File → 真实路径，Electron 专用 */
function getFilePath(file) {
  if (window.huepick && window.huepick.getPathForFile) {
    const p = window.huepick.getPathForFile(file);
    if (p && typeof p === 'string' && p.length > 0) return p;
  }
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
          if (entries.length === 0) { resolve(all); return; }
          for (const e of entries) all.push(...await readEntry(e));
          readAll();
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

  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const p = getFilePath(files[i]);
      if (p && isImagePath(p)) set.add(p);
    }
  }

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
          if (p && isImagePath(p)) set.add(p);
        }
      } else if (entry.isDirectory) {
        const sub = await readEntry(entry);
        for (const f of sub) {
          const p = getFilePath(f);
          if (p && isImagePath(p)) set.add(p);
        }
      }
    }
  }

  return [...set];
}

// ============ 文件列表 & 选择逻辑（Windows 风格） ============
function addPaths(paths) {
  const existing = new Set(state.files);
  let added = 0;
  paths.forEach(p => {
    if (!existing.has(p)) { state.files.push(p); added++; }
  });
  if (added > 0) {
    log(`+${added} 张图片`, 'ok');
    // 首次添加自动选中第一张
    if (state.selected.size === 0 && state.files.length > 0) {
      state.selected.add(0);
      state.lastClickedIdx = 0;
    }
  }
  renderList();
  triggerPreviewDebounced();
}

/**
 * 点击文件项 —— Windows 资源管理器选择逻辑
 *  普通单击：单选
 *  Ctrl+单击：切换选中（多选）
 *  Shift+单击：从锚点连续选中
 *  Ctrl+Shift+单击：从锚点连续加入选中
 */
function handleItemClick(i, e) {
  const hasCtrl = e.ctrlKey || e.metaKey;
  const hasShift = e.shiftKey;

  if (hasShift && state.lastClickedIdx >= 0) {
    // Shift 连选
    const [a, b] = [Math.min(state.lastClickedIdx, i), Math.max(state.lastClickedIdx, i)];
    if (!hasCtrl) state.selected.clear();
    for (let k = a; k <= b; k++) state.selected.add(k);
  } else if (hasCtrl) {
    // Ctrl 切换
    if (state.selected.has(i)) state.selected.delete(i);
    else state.selected.add(i);
    state.lastClickedIdx = i;
  } else {
    // 普通单选
    state.selected.clear();
    state.selected.add(i);
    state.lastClickedIdx = i;
  }

  renderList();
  triggerPreviewDebounced();
}

/** 删除当前选中项；若无选中则清空全部 */
function removeSelected() {
  if (state.selected.size > 0) {
    const idxs = [...state.selected].sort((a, b) => b - a); // 倒序删除避免索引漂移
    idxs.forEach(i => state.files.splice(i, 1));
    log(`已删除 ${idxs.length} 张图片`, 'info');
  } else {
    state.files = [];
    log('已清空列表', 'info');
  }
  state.selected.clear();
  state.lastClickedIdx = -1;
  renderList();
  showPreviewEmpty();
}

function renderList() {
  listEl.innerHTML = '';
  state.files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item' + (state.selected.has(i) ? ' selected' : '');
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
      // ✕ 单项删除，不影响选中状态
      if (e.target.classList.contains('file-remove')) {
        const removedIdx = parseInt(e.target.dataset.i);
        state.files.splice(removedIdx, 1);
        // 修正选中索引
        const newSel = new Set();
        state.selected.forEach(idx => {
          if (idx < removedIdx) newSel.add(idx);
          else if (idx > removedIdx) newSel.add(idx - 1);
        });
        state.selected = newSel;
        if (state.lastClickedIdx === removedIdx) state.lastClickedIdx = -1;
        else if (state.lastClickedIdx > removedIdx) state.lastClickedIdx--;
        renderList();
        triggerPreviewDebounced();
        return;
      }
      handleItemClick(i, e);
    });
    listEl.appendChild(div);
  });
  $('#drop').style.display = state.files.length === 0 ? 'block' : 'none';

  // 更新清除按钮文本
  const btn = $('#btn-clear');
  btn.textContent = state.selected.size > 0
    ? `删除选中 (${state.selected.size})`
    : '清空列表';
  btn.disabled = state.files.length === 0;

  updateStatusBar();
}

// ============ 键盘：Ctrl+A / Delete / Esc ============
listEl.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    state.selected = new Set(state.files.map((_, i) => i));
    renderList();
    triggerPreviewDebounced();
  } else if (e.key === 'Delete') {
    e.preventDefault();
    removeSelected();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    state.selected.clear();
    state.lastClickedIdx = -1;
    renderList();
  }
});

// ============ 点击列表外空白 → 清空选中 ============
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('#file-list') || e.target.closest('.clear-btn') || e.target.closest('.dropzone')) return;
  if (state.selected.size === 0) return;
  state.selected.clear();
  state.lastClickedIdx = -1;
  renderList();
  updateStatusBar();
});

// ============ 拖拽（统一 document 接收，#drop 仅视觉提示） ============
const dropEl = $('#drop');

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

// ============ 拖拽区点击 = 选图片 / 选文件夹 ============
dropEl.addEventListener('click', async () => {
  const paths = await window.huepick.pickFiles();
  if (paths && paths.length > 0) addPaths(paths);
});
$('#link-select').addEventListener('click', async (e) => {
  e.stopPropagation();
  const paths = await window.huepick.pickFiles();
  if (paths && paths.length > 0) addPaths(paths);
});
$('#link-folder').addEventListener('click', async (e) => {
  e.stopPropagation();
  const result = await window.huepick.pickFolder();
  if (result && result.files.length > 0) addPaths(result.files);
});

// ============ 清除按钮（智能：选中 → 删除选中；无选中 → 清空） ============
$('#btn-clear').addEventListener('click', removeSelected);

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
    outputFormat: $('#p-format').value,
    exportFormats: [],
    exportHarmony: false,
  };
}

// ============ 预览目标（选中项中最后一次点击的那个） ============
function getPreviewTarget() {
  if (state.lastClickedIdx >= 0 && state.lastClickedIdx < state.files.length) {
    return state.files[state.lastClickedIdx];
  }
  if (state.selected.size > 0) {
    return state.files[[...state.selected][0]];
  }
  return state.files[0] || null;
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
  const f = getPreviewTarget();
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
  $('#btn-generate').textContent = '⏳ 生成中…';
  setStatus('正在生成色卡…');

  const outputs = [];
  for (let i = 0; i < state.files.length; i++) {
    const f = state.files[i];
    const name = f.split(/[\\/]/).pop();
    log(`(${i + 1}/${state.files.length}) ${name}`, 'info');
    setStatus(`正在生成 (${i + 1}/${state.files.length}) ${name}`);
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
  $('#btn-generate').textContent = '生成色卡';

  if (outputs.length > 0) {
    showPreview(outputs[0]);
    log(`完成：${outputs.length}/${state.files.length} 成功`, 'ok');
    setStatus(`已生成 ${outputs.length}/${state.files.length} 张色卡`);
  } else {
    log('全部失败，请检查 DevTools Console', 'err');
    setStatus('生成失败');
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
log('HuePick 桌面版就绪', 'ok');

// 参数变化 → debounce 自动刷新预览
const previewTriggers = ['#p-colors', '#p-template', '#p-theme', '#p-crop', '#p-format'];
previewTriggers.forEach(sel => {
  const el = document.querySelector(sel);
  if (!el) return;
  el.addEventListener('change', triggerPreviewDebounced);
  el.addEventListener('input', triggerPreviewDebounced);
});

// 版本号：从主进程 IPC 拉取（单一来源），写到底栏
document.addEventListener('DOMContentLoaded', async () => {
  const el = document.getElementById('ver');
  if (!el) return;
  try {
    const v = await window.huepick.getVersion();
    if (v) el.textContent = 'v' + v;
  } catch (_) { /* keep HTML fallback */ }
  refreshCacheSize();
});

// ============ 预览缓存管理 ============
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

async function refreshCacheSize() {
  try {
    const info = await window.huepick.getPreviewCacheInfo();
    const el = document.getElementById('cache-size');
    if (el) el.textContent = info.count > 0 ? formatSize(info.size) : '0 B';
    const btn = document.getElementById('btn-clear-cache');
    if (btn) btn.title = info.count > 0
      ? `清理 ${info.count} 张预览缓存（${formatSize(info.size)}）`
      : '预览缓存为空';
  } catch (_) {}
}

document.getElementById('btn-clear-cache').addEventListener('click', async () => {
  try {
    const before = await window.huepick.getPreviewCacheInfo();
    if (before.count === 0) {
      log('预览缓存为空，无需清理', 'info');
      return;
    }
    const info = await window.huepick.clearPreviewCache();
    log(`已清理 ${info.count} 张预览缓存（${formatSize(info.size)}）`, 'ok');
    refreshCacheSize();
  } catch (err) {
    log('清理失败：' + err.message, 'err');
  }
});

// 全局错误捕获
window.addEventListener('error', (e) => {
  log(`[JS ERROR] ${e.message} @ ${e.filename}:${e.lineno}`, 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  log(`[PROMISE] ${e.reason?.message || e.reason}`, 'err');
});
