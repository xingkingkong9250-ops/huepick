# tools/

工具脚本目录（不参与打包，仅开发/文档生成用）。

## 现有工具

无（待迁移）

## 规划中的迁移

- `guide_assets/gen_docx.js` → `tools/gen-docx.js`（DOCX 文档生成）
- 未来：版本号批量同步、截图自动化、CHANGELOG 生成

## 使用

工具脚本均在项目根目录运行：

```powershell
node tools/xxx.js
```
