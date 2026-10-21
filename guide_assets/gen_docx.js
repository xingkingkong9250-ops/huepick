// 生成 HuePick 安装使用说明 DOCX
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require('docx');

const ASSETS = path.join(__dirname);
const OUT_PATH = path.join(__dirname, '..', '..', 'HuePick_安装使用说明_v1.2.0.docx');
const CJK = { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" };

const T = (text, opts = {}) => new TextRun({ text, font: CJK, ...opts });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 }, children: [T(text, { bold: true, size: 36 })] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [T(text, { bold: true, size: 30 })] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 }, children: [T(text, { bold: true, size: 26 })] });
const P = (text, opts = {}) => new Paragraph({ spacing: { after: 80 }, children: [T(text)], ...opts });
const IMG = (fname, w, h, caption) => {
  const children = [];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [
    new ImageRun({ type: fname.split('.').pop(), data: fs.readFileSync(path.join(ASSETS, fname)), transformation: { width: w, height: h }, altText: { title: caption, description: caption, name: fname } })
  ]}));
  if (caption) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [T(caption, { size: 20, color: "888888", italics: true })] }));
  return children;
};
const HR = () => new Paragraph({ spacing: { before: 200, after: 200 }, children: [T('─'.repeat(60), { color: "CCCCCC", size: 20 })] });

function makeTable(rows, colWidths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    rows: rows.map((row, ri) => new TableRow({
      cantSplit: true,
      children: row.map((cell, ci) => new TableCell({
        borders, width: { size: colWidths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { fill: "E8EEF4", type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [T(cell, { bold: ri === 0 })] })]
      }))
    }))
  });
}

const children = [];
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 200 }, children: [T('HuePick', { bold: true, size: 72 })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [T('色卡生成器 · 安装使用说明', { size: 36, color: "444444" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [T('v1.2.0', { size: 28, color: "666666" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [T('2026-10-20', { size: 24, color: "999999" })] }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 一、版本与系统要求
children.push(H1('一、版本与系统要求'));
children.push(makeTable([
  ['项目', '要求'],
  ['版本', 'v1.2.0'],
  ['操作系统', 'Windows 10 / Windows 11（64 位）'],
  ['磁盘空间', '安装约 94 MB'],
  ['预装环境', '无 —— Node.js、Electron、Skia 图形库已全部打包进安装包'],
], [2000, 7026]));

// 二、安装步骤
children.push(H1('二、安装步骤'));
['1. 双击 HuePick-Setup-1.2.0.exe 启动安装向导。',
 '2. 欢迎页 → 「下一步」。',
 '3. 选择安装位置（默认 C:\\Users\\<你的用户名>\\AppData\\Local\\Programs\\HuePick），建议保持默认。',
 '4. 附加任务：勾选「创建桌面快捷方式」（可选）→ 「下一步」。',
 '5. 点「安装」，等待进度条完成。',
 '6. 安装完成 → 勾选「运行 HuePick」→ 「完成」。'].forEach(t => children.push(P(t)));
children.push(P('提示：本安装包无需管理员权限。若 Windows SmartScreen 弹出「已保护你的电脑」，点「更多信息」→「仍要运行」即可。', { color: "555555", italics: true }));
children.push(P('便携版：也可直接使用 dist\\win-unpacked\\HuePick.exe，双击即用，无需安装。'));

// 三、启动与卸载
children.push(H1('三、启动与卸载'));
children.push(P('• 启动：开始菜单 →「HuePick」，或双击桌面快捷方式，或双击安装目录下的 HuePick.exe。'));
children.push(P('• 卸载：开始菜单 →「HuePick」→「卸载 HuePick」；也可在「设置 → 应用 → 已安装的应用」中找到卸载。'));

// 四、主界面图鉴
children.push(H1('四、主界面图鉴'));
children.push(P('启动后会看到 HuePick 的两栏布局 + 底栏：左栏文件区 · 右栏参数与预览 · 底部状态栏。'));
children.push(...IMG('ui_main.png', 700, 423, '图 4-1 主界面全景（彩色胶片 Logo + 中文「拾色」+ v1.2.0）'));
children.push(makeTable([
  ['区域', '功能'],
  ['① 左栏品牌区', '彩色胶片 Logo + 中文「拾色」+ 英文 HuePick（字号层级区分）'],
  ['② 左栏拖拽区', '单击=选图片（可多选）；区内"选择文件夹"链接=选文件夹；或直接拖入'],
  ['③ 左栏文件列表', '已加载的图片。支持 Windows 选择逻辑：单击/Ctrl 多选/Shift 连选/Ctrl+A/Delete/Esc'],
  ['④ 左栏底部按钮', '智能切换：无选中显示「清空列表」，有选中显示「删除选中 (N)」'],
  ['⑤ 右栏参数面板', '色数 / 模板 / 主题 / 裁切 / 格式 — 改任何一项自动刷新预览'],
  ['⑥ 预览区', '实时显示当前参数下的色卡效果'],
  ['⑦ 生成按钮', '点击后按当前参数批量生成色卡，输出到原图所在目录'],
  ['⑧ 日志面板', '显示处理进度与结果'],
  ['⑨ 底部状态栏', '左侧动态版本号 · 右侧实时状态（就绪/共 N 张/已选中 M/N/生成进度）'],
], [1800, 7226]));

// 五、快速上手
children.push(H1('五、快速上手（30 秒出第一张色卡）'));
['1. 拖图：把一张或多张图片拖到左栏虚线框内（或点击虚线框选择文件）。',
 '2. 看图：选一张图片 → 参数面板自动展开 → 预览区实时显示色卡。',
 '3. 调参：拖动色数滑块、切换模板/主题 —— 每次改动 350ms 后自动刷新预览。',
 '4. 生成：点「🚀 生成色卡」按钮，色卡输出到原图所在目录，文件名为「原名_色卡.jpg」。'].forEach(t => children.push(P(t)));

// 六、模板图鉴
children.push(H1('六、模板图鉴'));
children.push(P('HuePick v1.2.0 提供 6 种内置模板，覆盖从大屏展示到截图标注的全部场景。'));

children.push(H2('6.1 横版（默认）— 1920×1080'));
children.push(P('大图占 66% 画布，底部色块区自适应网格。适合做海报、桌面壁纸、作品集展示。'));
children.push(...IMG('card_landscape.jpg', 700, 394, '图 6-1 横版模板'));

children.push(H2('6.2 竖版 — 1080×1920'));
children.push(P('每行排布色块 + 占比 + HEX。适合手机屏、短视频封面。'));
children.push(...IMG('card_portrait.jpg', 400, 711, '图 6-2 竖版模板'));

children.push(H2('6.3 方版 — 1080×1080'));
children.push(P('正方形画布，自动网格换行。支持高色数自动折行，不会挤成一条。'));
children.push(...IMG('card_square_c6.jpg', 500, 500, '图 6-3a 方版 · 6 色'));
children.push(...IMG('card_square_c10.jpg', 500, 500, '图 6-3b 方版 · 10 色（自动换行）'));

children.push(H2('6.4 紧凑 — 1200×800'));
children.push(P('缩略图占比缩小到 45%，色块区更密。适合社交媒体、博客配图。'));
children.push(...IMG('card_compact.jpg', 600, 400, '图 6-4 紧凑模板'));

children.push(H2('6.5 缩略 — 800×450'));
children.push(P('最小截图模板，字体/间距自动缩至 800 宽级别。适合嵌入文档、Markdown。'));
children.push(...IMG('card_thumb.jpg', 600, 338, '图 6-5 缩略模板'));

children.push(H2('6.6 色板 — 1200×240（无图纯色块）'));
children.push(P('完全不显示原图，整条画布全部给色块信息。色块内置左上角占比 + 右下角 HEX，纯信息展示，适合快速贴到幻灯片或设计稿里。'));
children.push(...IMG('card_palette.jpg', 700, 140, '图 6-6 色板模板'));

// 七、参数详解
children.push(H1('七、参数详解'));
children.push(makeTable([
  ['参数', '默认', '可选值', '说明'],
  ['色数', '6', '3 ~ 12', '从原图提取几个主色，色数越多越精细'],
  ['模板', '横版', '横版 / 竖版 / 方版 / 紧凑 / 缩略 / 色板', '见第六节图鉴'],
  ['主题', '深色', '深色 / 浅色', '画布背景色 + 文字颜色自动适配'],
  ['裁切', '开启', '开关', '开启后自动裁除电影上下黑边，让主色提取更准'],
  ['格式', 'JPG', 'JPG（体积小）/ PNG（无损）', 'JPG 比 PNG 小 60~70%，PNG 保留色彩精度'],
], [1200, 800, 2500, 2526]));
children.push(P(''));
children.push(P('所有参数改动都会自动刷新预览（350ms 防抖），无需手动刷新。', { italics: true, color: "555555" }));

// 八、主题与格式
children.push(H1('八、主题与格式'));
children.push(H2('8.1 主题对比'));
children.push(P('同一张图、同一模板，深色与浅色主题：'));
children.push(...IMG('card_theme_dark.jpg', 700, 394, '图 8-1a 深色主题'));
children.push(...IMG('card_theme_light.jpg', 700, 394, '图 8-1b 浅色主题'));
children.push(H2('8.2 格式对比（方版 1080×1080）'));
children.push(makeTable([
  ['格式', '文件大小', '用途建议'],
  ['JPG（默认）', '~280 KB', '日常使用、分享、社交媒体。quality 0.92，肉眼几乎看不出压缩痕迹'],
  ['PNG', '~1400 KB', '需要精确还原色彩时使用，比如给设计师做取色参考、导入 Figma/Sketch'],
], [1800, 1800, 5426]));

// 九、输出命名规则
children.push(H1('九、输出命名规则'));
children.push(P('生成色卡时，文件名自动追加「_色卡」后缀：'));
children.push(makeTable([
  ['原图', '第一次生成', '冲突时自动编号'],
  ['森林日落.jpg', '森林日落_色卡.jpg', '森林日落_色卡 (2).jpg → (3) …'],
], [2500, 3000, 3526]));
children.push(P(''));
['• 预览图不会写到原图目录（落到系统临时目录，自动覆盖），不会污染你的文件夹。',
 '• 只有点「🚀 生成色卡」按钮才会正式落盘。',
 '• 不会覆盖已存在的色卡文件，自动顺着编号走。'].forEach(t => children.push(P(t)));

// 十、常见问题
children.push(H1('十、常见问题'));
children.push(P('Q1：拖完图没反应？'));
children.push(P('A：左栏会显示文件列表，列表选中后自动生成预览。如果列表是空的，说明拖拽没有触发 —— 确认图片是常见格式（JPG / PNG / WebP / BMP）。'));
children.push(P(''));
children.push(P('Q2：预览和生成的结果不一样？'));
children.push(P('A：预览和正式生成走的是同一条渲染链路，结果应该一致。唯一区别是：预览落临时目录，正式生成落原图目录。'));
children.push(P(''));
children.push(P('Q3：想批量处理多张图？'));
children.push(P('A：一次拖多张 → 点「🚀 生成色卡」按钮 → HuePick 会按当前参数逐张生成，全部输出到各自原图目录。日志面板会显示进度。'));
children.push(P(''));
children.push(P('Q4：生成的色卡里某些色块看起来太暗/太亮？'));
children.push(P('A：那是原图里的真实颜色。HuePick 的主色提取基于 K-means 聚类，不带任何主观滤镜。如果想调整视觉效果，建议后期在 PS/LR 里对原图先做统一调色再提取。'));
children.push(P(''));
children.push(P('Q5：安装时提示「已保护你的电脑」？'));
children.push(P('A：SmartScreen 对未签名程序的常规提示，点「更多信息」→「仍要运行」即可。'));

// 落款
children.push(HR());
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [T('HuePick v1.2.0 · 2026-10-20', { size: 22, color: "999999" })] }));

const doc = new Document({
  styles: {
    default: { document: { run: { font: CJK, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, font: CJK }, paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0, keepNext: false, keepLines: false } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: CJK }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: false, keepLines: false } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: CJK }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: false, keepLines: false } },
    ]
  },
  numbering: { config: [] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [T('HuePick v1.2.0 安装使用说明', { size: 18, color: "999999" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [T('第 ', { size: 18, color: "999999" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: CJK }), T(' 页', { size: 18, color: "999999" })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT_PATH, buffer);
  console.log('✓ DOCX:', OUT_PATH, Math.round(buffer.length / 1024), 'KB');
});
