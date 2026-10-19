import * as vscode from 'vscode';

/**
 * 运行时国际化（i18n）
 *
 * 根据 VS Code 界面语言返回中/英文用户提示。清单层（package.json 的
 * displayName / description / 命令标题 / 配置描述）由 package.nls*.json 处理，
 * 本模块只负责运行时弹窗、进度条、快速选择等动态文案。
 */

type Lang = 'zh' | 'en';

/** 文案键名 */
export type MessageKey =
  | 'brand'
  | 'targetNotExist'
  | 'pickOutputDir'
  | 'noImages'
  | 'progressTitle'
  | 'resultPartial'
  | 'resultDone'
  | 'exportNote'
  | 'openImageFirst'
  | 'unsupportedFormat'
  | 'chooseFolder'
  | 'paramsTitle'
  | 'useCurrent'
  | 'customParams'
  | 'templateTitle'
  | 'colorsTitle'
  | 'themeTitle'
  | 'exportTitle'
  | 'customSizeWidth'
  | 'customSizeHeight'
  | 'templateLandscape'
  | 'templatePortrait'
  | 'templateSquare'
  | 'templateCustom'
  | 'themeDark'
  | 'themeLight'
  | 'resultCancelled';

const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  zh: {
    brand: '拾色 HuePick',
    targetNotExist: '目标路径不存在：{0}',
    pickOutputDir: '选择色卡输出目录',
    noImages: '未找到任何可处理的图片。',
    progressTitle: '正在生成色卡…',
    resultPartial: '成功 {0} 张，失败 {1} 张{2}（详见控制台）。',
    resultDone: '完成，生成 {0} 张色卡{1}。',
    exportNote: '，导出配色文件 {0} 个',
    openImageFirst: '请先在编辑器中打开一张图片。',
    unsupportedFormat: '当前文件不是受支持的图片格式。',
    chooseFolder: '选择包含图片的文件夹',
    paramsTitle: '生成参数',
    useCurrent: '使用当前设置',
    customParams: '自定义本次参数…',
    templateTitle: '选择色卡模板',
    colorsTitle: '选择主色数量',
    themeTitle: '选择色卡主题',
    exportTitle: '选择导出格式（可多选，留空则不导出）',
    customSizeWidth: '自定义画布宽度（400~4096）',
    customSizeHeight: '自定义画布高度（400~4096）',
    templateLandscape: '横版 1920×1080',
    templatePortrait: '竖版 1080×1920',
    templateSquare: '方版 1080×1080',
    templateCustom: '自定义尺寸…',
    themeDark: '深色',
    themeLight: '浅色',
    resultCancelled: '已取消，本次完成 {0} 张{1}。',
  },
  en: {
    brand: 'HuePick',
    targetNotExist: 'Target path does not exist: {0}',
    pickOutputDir: 'Select color card output directory',
    noImages: 'No processable images found.',
    progressTitle: 'Generating color cards…',
    resultPartial: 'Success {0}, failed {1}{2} (see console for details).',
    resultDone: 'Done. Generated {0} color card(s){1}.',
    exportNote: ', exported {0} palette file(s)',
    openImageFirst: 'Please open an image in the editor first.',
    unsupportedFormat: 'The current file is not a supported image format.',
    chooseFolder: 'Select a folder containing images',
    paramsTitle: 'Generation parameters',
    useCurrent: 'Use current settings',
    customParams: 'Customize parameters for this run…',
    templateTitle: 'Select card template',
    colorsTitle: 'Select number of colors',
    themeTitle: 'Select card theme',
    exportTitle: 'Select export formats (multi-select, empty = none)',
    customSizeWidth: 'Custom canvas width (400~4096)',
    customSizeHeight: 'Custom canvas height (400~4096)',
    templateLandscape: 'Landscape 1920×1080',
    templatePortrait: 'Portrait 1080×1920',
    templateSquare: 'Square 1080×1080',
    templateCustom: 'Custom size…',
    themeDark: 'Dark',
    themeLight: 'Light',
    resultCancelled: 'Cancelled. Completed {0} card(s){1}.',
  },
};

/** 当前界面语言 */
function currentLang(): Lang {
  const lang = (vscode.env.language || 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 取当前语言的文案，并将 {0}/{1}… 占位符替换为参数。
 */
export function t(key: MessageKey, ...params: Array<string | number>): string {
  let text = MESSAGES[currentLang()][key] ?? MESSAGES.en[key] ?? key;
  params.forEach((p, i) => {
    text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), String(p));
  });
  return text;
}
