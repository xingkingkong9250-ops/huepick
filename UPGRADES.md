# HuePick 升级开发项（待用户实际试用反馈后按需释放）

## 核心导出格式（功能已实现，UI 隐藏）

- [ ] CSS Variables 导出（`exportPalettes(fmt="css")`）
- [ ] SCSS 变量导出（`exportPalettes(fmt="scss")`）
- [ ] Tailwind config 导出（`exportPalettes(fmt="tailwind")`）
- [ ] JSON 原始色板导出（`exportPalettes(fmt="json")`）
- [ ] 配色规则生成与导出（`generateHarmonies()`：互补/类似/三原/分裂互补/单色，5 套规则）

## 进阶功能（架构预留，待开发）

### 后期滤镜链
- [ ] 基于主色生成 DaVinci Resolve 调色预设（.drt / .cube LUT）
- [ ] 基于主色生成 Premiere / After Effects Lumetri 预设（.xmp）
- [ ] 基于主色生成 Lightroom / Camera Raw 预设（.xmp）
- [ ] 主色 → 滤镜参数映射：色温、色调、饱和度、对比度、曲线锚点

### 设计协作流
- [ ] ASE（Adobe Swatch Exchange）格式导出（Figma/Illustrator/Photoshop 直接导入）
- [ ] CLR（macOS Color List）格式导出
- [ ] 色板二维码 / 短链分享（在线色板托管）
- [ ] Figma / Sketch / Adobe Express 插件联动

### 进阶取色
- [ ] k-means 聚类算法可选模式（当前固定 MMCQ）
- [ ] 按色相/明度/饱和度过滤色群
- [ ] 忽略图片边框/Logo/水印区域采样
- [ ] 相似度聚类合并（近色合并为统一色板）

### 界面升级
- [ ] 侧边栏 Webview 实时预览色卡（VS Code 壳已有，Electron 壳需重建）
- [ ] 点击 HEX 自动复制 + 迷你 Toast 反馈
- [ ] 拖拽多选文件夹递归收集（当前只单层目录）
- [ ] 色卡模板在线市场 / 用户自定义模板导入导出
