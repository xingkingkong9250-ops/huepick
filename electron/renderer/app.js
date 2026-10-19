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

/** 从拖拽事件拿到所有真实路径 */
async function pathsFromDrag(e) {
  const paths = [];
  const items = e.dataTransfer.items;
  const files = e.dataTransfer.files;

  console.log('[HuePick.drag] items.length:', items?.length, 'files.length:', files?.length);

  // 路径 A：优先 items + webkitGetAsEntry（能处理文件夹）
  if (items && items.length > 0 && items[0].webkitGetAsEntry) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (!entry) continue;
      console.log('[HuePick.drag] item', i, 'kind=', item.kind, 'entry.isFile=', entry.isFile, 'entry.name=', entry.name);
      const f = await new Promise((resolve) => entry.file ? entry.file(resolve, () => resolve(null)) : resolve(null));
      if (!f) continue;
      const p = getFilePath(f);
      console.log('[HuePick.drag]   resolved path:', p);
      if (p && isImagePath(p)) paths.push(p);
    }
    return paths;
  }

  // 路径 B：回退 files（多文件拖拽场景）
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const p = getFilePath(files[i]);
      console.log('[HuePick.drag] file', i, 'path:', p);
      if (p && isImagePath(p)) paths.push(p);
    }
  }
  return paths;
}

// ============ 文件列表 ============
function addPaths(paths) {
  const existing = new Set(state.files);
  let added = 0;
  paths.forEach(p => {
    if (!existing.has(p)) { state.files.push(p); added++; }
  });
  if (added > 0) log(`+${added} 张图片`, 'ok');
  renderList();
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
        return;
      }
      state.selectedIdx = i;
      renderList();
    });
    listEl.appendChild(div);
  });
  $('#drop').style.display = state.files.length === 0 ? 'block' : 'none';
}

// ============ 拖拽 ============
const dropEl = $('#drop');

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

['dragenter', 'dragover'].forEach(ev => {
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.remove('dragover');
  });
});
dropEl.addEventListener('drop', onDrop);

// 整个窗口接收拖拽
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', (e) => {
  // 如果 drop 在文件列表或其他控件上已经处理过了就不再处理
  if (e.defaultPrevented) return;
  onDrop(e);
});

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
  d.innerHTML = '<div class="pe-icon">🎯</div><div>选择图片后点击生成</div>';
  previewEl.innerHTML = '';
  previewEl.appendChild(d);
}

// ============ 生成 ============
$('#btn-generate').addEventListener('click', async () => {
  if (state.files.length === 0) { log('请先添加图片', 'err'); return; }

  const payload = {
    numColors: parseInt($('#p-colors').value),
    cropBars: $('#p-crop').checked,
    template: $('#p-template').value,
    theme: $('#p-theme').value,
    exportFormats: [...document.querySelectorAll('.p-fmt:checked')].map(c => c.value),
    exportHarmony: $('#p-harmony').checked,
  };

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

  // 用主进程生成 URL 最稳
  try {
    img.src = await window.huepick.pathToUrl(result.cardPath);
  } catch {
    img.src = 'file:///' + result.cardPath.replace(/\\/g, '/');
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

// 禁用窗口跳转
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

// 全局错误捕获
window.addEventListener('error', (e) => {
  log(`[JS ERROR] ${e.message} @ ${e.filename}:${e.lineno}`, 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  log(`[PROMISE] ${e.reason?.message || e.reason}`, 'err');
});
