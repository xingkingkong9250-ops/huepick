# 拾色 HuePick

> 分析任意图片的主色，一键生成带 HEX 与占比标注的专业色卡图。
> 适用场景：电影光影截图、原画、插画、摄影、概念设计、配色研究。
>
> **v0.3.0 起纯 Node 实现，无需 Python / Pillow 环境。**
> **v0.4.0 起支持配色方案生成与多格式导出（CSS / SCSS / Tailwind / JSON）。**
> **v0.5.0 起支持交互式参数选择、可取消批量与中英双语界面。**

## 功能

- **单图取色**：在编辑器中打开图片，右键或命令面板一键生成色卡
- **批量处理**：右键文件夹，递归扫描所有图片批量生成
- **交互式参数选择**：每次运行可选择「使用当前设置」一键直出，或临时覆盖模板/色数/主题/导出格式
- **可取消批量**：批量处理中可随时取消，已完成的色卡保留
- **自动裁黑边**：电影截图自动裁除上下黑边（原画/插画自动跳过）
- **6~12 色可配**：提取主色数量可在设置里调整
- **色卡模板**：横版 1920×1080 / 竖版 1080×1920 / 方版 1080×1080 / 自定义尺寸
- **深浅主题**：深色 / 浅色两套配色，文字与分隔线自动适配
- **配色方案**：基于第一主色自动生成互补色 / 类似色 / 三原色 / 分裂互补 / 单色系
- **多格式导出**：CSS Variables、SCSS、Tailwind config、JSON，与色卡同目录输出
- **中英双语**：命令标题、配置说明与运行时提示自动跟随编辑器语言
- **输出规范**：色卡图与原图同目录，文件名自动插入 `_色卡_` 后缀
- **零外部依赖**：纯 Node 实现，基于 sharp + skia-canvas，开箱即用

## 安装

获取 `huepick-<版本>.vsix` 后，在 Trae / VS Code 中：

- 命令面板执行 **Extensions: Install from VSIX…**，选择该文件；或
- 命令行 `code --install-extension huepick-<版本>.vsix`

> 本扩展含原生模块（sharp / skia-canvas），请安装与编辑器平台匹配的构建产物（Windows x64 / macOS / Linux）。

## 色卡样例

每张色卡图包含：
- 上方：原图缩略（黑边已自动裁除，水平居中）
- 下方：N 个主色块，按画面占比排序，标注 **百分比** 与 **HEX 色值**
  - 横版/方版：色块横排
  - 竖版：色块竖排，右侧标注 HEX

## 技术架构

```
huepick/
├── package.json              # Trae / VS Code 插件清单
├── package.nls.json          # 清单文案（英文，默认）
├── package.nls.zh-cn.json    # 清单文案（简体中文）
├── tsconfig.json
├── src/
│   ├── extension.ts          # 插件入口、命令注册、进度/取消 UI
│   ├── core/
│   │   ├── types.ts              # 共享类型（ColorInfo / CardOptions / HarmonyScheme …）
│   │   ├── presets.ts            # 模板尺寸、主题背景色、画布钳制
│   │   ├── imageLoader.ts        # sharp 图片加载、透明合成、裁黑边
│   │   ├── paletteExtractor.ts   # MMCQ 主色提取（Color Thief 同款算法）
│   │   ├── colorHarmony.ts       # 配色规则（互补/类似/三色/分裂互补/单色）
│   │   ├── exporter.ts           # CSS / SCSS / Tailwind / JSON 导出
│   │   └── cardRenderer.ts       # skia-canvas 色卡渲染（横/竖/方版自适应）
│   ├── utils/
│   │   ├── fileNaming.ts         # 输出文件名规则、目录递归扫描
│   │   ├── runOptions.ts         # 交互式参数选择（QuickPick 流程）
│   │   └── i18n.ts               # 运行时中英文文案
│   └── test/
│       └── huepick.test.ts       # 单元 + 端到端测试（node:test）
└── media/
    └── icon.png              # 插件图标
```

**核心管线**：

```
图片文件 → sharp 加载 → 裁黑边 → MMCQ 提取主色 → 配色方案生成
        → skia-canvas 渲染 → PNG 色卡
        → 多格式导出 → CSS / SCSS / Tailwind / JSON
```

## 开发与调试

### 1. 安装依赖
```bash
cd C:\AI_Programming\APP\HuePick
npm install
```

### 2. 在 Trae 中调试
- 用 Trae 打开本目录
- 按 `F5` 启动扩展开发宿主
- 在新窗口里打开任意图片 → 右键 → **拾色 HuePick：为当前图片生成色卡**

### 3. 运行测试
```bash
npm test              # 编译 + 运行单元与端到端测试（node:test）
```
覆盖主色提取、配色规则、导出格式、文件名规则、裁黑边，以及三种模板 × 两种主题的
skia-canvas 实际渲染与尺寸校验。

### 4. 打包发布
```bash
npm run package       # 生成 huepick-<版本>.vsix
```
然后在 Trae 里「从 VSIX 安装」即可。

## 配置项

| 配置 | 默认 | 说明 |
|------|------|------|
| `huepick.numColors` | `6` | 主色数量（3~12） |
| `huepick.cropBlackBars` | `true` | 自动裁电影黑边 |
| `huepick.outputSuffix` | `色卡` | 输出文件名插入的后缀 |
| `huepick.outputToSourceDir` | `true` | 输出到原图同目录 |
| `huepick.template` | `landscape` | 色卡模板：`landscape` / `portrait` / `square` / `custom` |
| `huepick.customWidth` | `1920` | 自定义画布宽度（template=custom 时生效，400~4096） |
| `huepick.customHeight` | `1080` | 自定义画布高度（template=custom 时生效，400~4096） |
| `huepick.theme` | `dark` | 色卡主题：`dark` / `light` |
| `huepick.exportFormats` | `["css"]` | 同步导出的配色格式：`css` / `scss` / `tailwind` / `json` |
| `huepick.exportHarmony` | `true` | 导出时是否包含配色方案（互补/类似/三色/分裂互补/单色） |

## 导出文件

生成色卡的同时，会在同目录输出 `{原图名}_palette.*` 文件：

| 格式 | 文件名示例 | 内容 |
|------|-----------|------|
| CSS | `a_palette.css` | `:root` 作用域 CSS 变量 |
| SCSS | `a_palette.scss` | SCSS 变量 |
| Tailwind | `a_palette.tailwind.js` | `theme.extend.colors` 配置片段 |
| JSON | `a_palette.json` | 结构化数据（含占比与全部配色方案） |

导出格式留空数组（`[]`）可关闭导出，仅生成色卡图。

## 命令一览

| 命令 | 触发方式 |
|------|----------|
| 为当前图片生成色卡 | 编辑器右键 / 命令面板 |
| 为此图片/文件夹批量生成色卡 | 资源管理器右键 |
| 选择文件夹批量生成色卡 | 命令面板 |

## 算法说明

### 主色提取：MMCQ

主色提取采用 **MMCQ（Modified Median Cut Quantization）** 算法，与 Color Thief 同源：
1. 对图片采样约 1 万像素
2. 过滤接近纯黑/纯白/纯灰的"无趣"像素（避免污染配色）
3. 将颜色量化到 5bit/通道 空间，构建直方图
4. 用优先队列按体积进行 Median Cut，直到达到目标色数
5. 每个色箱取加权平均作为代表色

相比 Python 版的 `Image.quantize(MEDIANCUT)`：
- 增加无趣像素过滤，主色更准确
- 全程 TypeScript 实现，无跨进程开销
- 单次取色耗时约 50~150ms（原 Python 方案 1~2s 启动开销）

### 配色方案：HSL 色彩理论

以第一主色为基准，在 HSL 空间做色相旋转生成经典配色：

| 方案 | 规则 |
|------|------|
| 互补色 | 基准色 + 色相 +180° |
| 类似色 | 基准色 ±30° |
| 三原色 | 基准色 +120° / +240° |
| 分裂互补 | 基准色 +150° / +210° |
| 单色系 | 同色相，明度/饱和度变化 |

## License

MIT © HuePick Studio
