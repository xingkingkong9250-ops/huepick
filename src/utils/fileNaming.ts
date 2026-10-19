import * as path from 'path';
import * as fs from 'fs';

/** 支持的图片扩展名 */
export const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

/**
 * 判断路径是否为受支持的图片文件
 */
export function isImageFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  return stat.isFile() && IMAGE_EXTS.has(path.extname(filePath).toLowerCase());
}

/**
 * 生成输出文件名。
 * 规则：在扩展名前插入后缀；若文件名含 'ZZO' 标识，则插到 ZZO 前以保持命名规范。
 *
 * 例：
 *   "a.png" + "色卡" → "a_色卡.png"
 *   "a_ZZO.png" + "色卡" → "a_色卡_ZZO.png"
 */
export function buildOutputName(sourceName: string, suffix: string): string {
  const ext = path.extname(sourceName);
  const base = path.basename(sourceName, ext);
  if (base.includes('ZZO')) {
    return base.replace('ZZO', `${suffix}_ZZO`) + ext;
  }
  return `${base}_${suffix}${ext}`;
}

/**
 * 递归收集目录下所有图片文件（排除已生成色卡，防止套娃）
 */
export function collectImages(targetPath: string, suffix: string): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTS.has(ext) && !entry.name.includes(suffix)) {
          files.push(fullPath);
        }
      }
    }
  };

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (isImageFile(targetPath)) files.push(targetPath);
  } else if (stat.isDirectory()) {
    walk(targetPath);
  }

  return files.sort();
}

/**
 * 解析单张图片的完整输出路径
 */
export function resolveOutputPath(sourcePath: string, suffix: string, outputDir?: string): string {
  const dir = outputDir ?? path.dirname(sourcePath);
  const name = buildOutputName(path.basename(sourcePath), suffix);
  return path.join(dir, name);
}
