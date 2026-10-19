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
}

// ============ 文件列表 ============
function addFiles(paths) {
  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
  const valid = paths.filter(p => exts.some(e => p.toLowerCase().endsWith(e)));
  const existing = new Set(state.files);
  valid.forEach(p => { if (!existing.has(p)) state.files.push(p); });
  renderList();
}

function renderList() {
  listEl.innerHTML = '';
  state.files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item' + (i === state.selectedIdx ? ' selected' : '');
    div.innerHTML = `
      <div class="file-thumb" style="background-image:url('file:///${encodeURIComponent(f).replace(/%5C/g, '/')}')"></div>
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
dropEl.addEventListener('drop', async (e) => {
  const files = [...e.dataTransfer.files].map(f => f.path);
  if (files.length > 0) addFiles(files);
});

// 支持拖拽到整个窗口（非拖拽区也能接收）
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...e.dataTransfer.files].map(f => f.path);
  if (files.length > 0) addFiles(files);
});

// ============ 按钮 ============
$('#btn-files').addEventListener('click', async () => {
  const paths = await window.huepick.pickFiles();
  if (paths) addFiles(paths);
});
$('#btn-folder').addEventListener('click', async () => {
  const result = await window.huepick.pickFolder();
  if (result) addFiles(result.files);
});
$('#btn-clear').addEventListener('click', () => {
  state.files = [];
  state.selectedIdx = -1;
  renderList();
  previewEl.innerHTML = '';
  previewEl.appendChild(emptyPreview());
  log('已清空', 'info');
});

function emptyPreview() {
  const d = document.createElement('div');
  d.className = 'preview-empty';
  d.innerHTML = '<div class="pe-icon">🎯</div><div>选择图片后点击生成</div>';
  return d;
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
    log(`(${i + 1}/${state.files.length}) ${f.split(/[\\/]/).pop()}`, 'info');
    const r = await window.huepick.generateCard({ ...payload, sourcePath: f });
    if (r.ok) {
      outputs.push(r);
      log(`  ✓ 色卡: ${r.cardPath.split(/[\\/]/).pop()}`, 'ok');
      r.extraFiles.forEach(ef => log(`  + ${ef.split(/[\\/]/).pop()}`, 'info'));
    } else {
      log(`  ✗ ${r.error}`, 'err');
    }
  }

  btn.disabled = false;
  $('#gen-text').textContent = '🚀 生成色卡';

  // 预览第一张
  if (outputs.length > 0) showPreview(outputs[0]);
  log(`完成：${outputs.length} 张成功`, 'ok');
});

// ============ 预览 ============
function showPreview(result) {
  previewEl.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'preview-card';

  const img = document.createElement('img');
  img.src = `file:///${result.cardPath.replace(/\\/g, '/')}`;

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

  // 主色色块
  if (result.colors && result.colors.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'colors-strip';
    result.colors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      chip.style.background = c.hex;
      chip.title = `${c.hex}  占比 ${(c.ratio * 100).toFixed(1)}%`;
      chip.onclick = () => {
        window.huepick.copyText(c.hex);
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
previewEl.appendChild(emptyPreview());
log('HuePick 桌面版就绪', 'ok');

// 禁用窗口跳转（拖拽文件进来时防止浏览器尝试打开）
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
