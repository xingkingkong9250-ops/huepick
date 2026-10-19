# Changelog

所有重要变更会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-10-19

### Changed - **BREAKING**
- **完全移除 Python 依赖**：插件不再需要安装 Python 或 Pillow
- 取色算法从 Pillow `quantize(MEDIANCUT)` 改为自研 MMCQ（Modified Median Cut Quantization），与 Color Thief 同源
- 渲染引擎从 Pillow 改为 skia-canvas，文字排版基于系统字体栈（微软雅黑 / 苹方 / Noto Sans CJK）
- 图像处理底层从 Pillow 改为 sharp，支持更多格式且性能更好

### Added
- 无趣像素过滤（接近纯黑/纯白/纯灰的像素不参与主色计算），主色更准确
- 批处理时显示逐张进度 `（当前/总数）文件名`
- 新增模块：`src/core/types.ts` / `imageLoader.ts` / `paletteExtractor.ts` / `cardRenderer.ts` / `src/utils/fileNaming.ts`

### Removed
- 删除 `python/color_card_tool.py` 及整个 `python/` 目录
- 删除配置项 `huepick.pythonPath`（不再需要）

### Performance
- 单张色卡生成从 1~2 秒（Python 启动开销）降至 50~150 毫秒
- 批量处理 100 张图：从 ~3 分钟降至 ~10 秒

## [0.2.0] - 2026-10-19

### Added
- 初始化 Git 仓库，建立工程化基线
- 补全 `.vscode/launch.json` 与 `.vscode/tasks.json`，支持 F5 调试
- 新增 `LICENSE`（MIT）与 `CHANGELOG.md`
- `package.json` 增加 `license`、`keywords`、`icon`、`galleryBanner` 字段

### Fixed
- `outputToSourceDir` 配置项此前声明但未生效；现在关闭时会弹出输出目录选择框
- `extension.ts` 现在校验目标路径存在性、文件协议、扩展名白名单
- `extension.ts` 现在能识别部分失败的批处理（成功 N / 失败 M 分开提示）
- 提升 `maxBuffer` 至 32 MB，避免大批量扫描时 stdout 被截断

## [0.1.0] - 2026-10-19

### Added
- 首个可用版本
- 单图取色 / 资源管理器右键批量 / 命令面板选文件夹
- 自动裁电影黑边（可关闭）
- 主色数量 3~12 可配
- 输出与原图同目录，文件名自动插入 `_色卡_` 后缀
