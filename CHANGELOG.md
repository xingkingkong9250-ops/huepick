# Changelog

所有重要变更会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
