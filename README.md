# 拾色 HuePick

> 分析任意图片的主色，一键生成带 HEX 标注的专业色卡图。
> 适用场景：电影光影截图、原画、插画、摄影、概念设计、配色研究。

## 功能

- **单图取色**：在编辑器中打开图片，右键或命令面板一键生成色卡
- **批量处理**：右键文件夹，递归扫描所有图片批量生成
- **自动裁黑边**：电影截图自动裁除上下黑边（原画/插画自动跳过）
- **6~12 色可配**：提取主色数量可在设置里调整
- **输出规范**：色卡图与原图同目录，文件名自动插入 `_色卡_` 后缀

## 色卡样例

每张色卡图（1920×1080 PNG）包含：
- 上方：原图缩略
- 下方：N 个主色块，按画面占比排序，标注 **百分比** 与 **HEX 色值**

## 工程结构

```
huepick/
├── package.json            # Trae / VS Code 插件清单
├── tsconfig.json
├── src/
│   └── extension.ts        # 插件入口（调用 Python 脚本）
├── python/
│   └── color_card_tool.py  # 色卡生成核心（纯 Pillow，无 numpy）
└── media/                  # 图标等资源
```

## 开发与调试

### 1. 安装依赖
```bash
cd C:\AI_Programming\APP\huepick
npm install
```

### 2. 准备 Python 环境
插件依赖 Pillow：
```bash
pip install Pillow
```

### 3. 在 Trae 中调试
- 用 Trae 打开本目录
- 按 `F5` 启动扩展开发宿主
- 在新窗口里打开任意图片 → 右键 → **拾色 HuePick：为此图片生成色卡**

### 4. 打包发布
```bash
npm run package       # 生成 .vsix
```
然后在 Trae 里「从 VSIX 安装」即可。

## 配置项

| 配置 | 默认 | 说明 |
|------|------|------|
| `huepick.pythonPath` | `python` | Python 解释器路径 |
| `huepick.numColors` | `6` | 主色数量（3~12） |
| `huepick.cropBlackBars` | `true` | 自动裁电影黑边 |
| `huepick.outputSuffix` | `色卡` | 输出文件名插入的后缀 |
| `huepick.outputToSourceDir` | `true` | 输出到原图同目录 |

## 命令一览

| 命令 | 触发方式 |
|------|----------|
| 为当前图片生成色卡 | 编辑器右键 / 命令面板 |
| 为此图片/文件夹批量生成色卡 | 资源管理器右键 |
| 选择文件夹批量生成色卡 | 命令面板 |
