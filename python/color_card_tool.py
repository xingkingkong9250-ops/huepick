# -*- coding: utf-8 -*-
"""
color_card_tool.py — 电影光影截图色卡生成工具
================================================

功能：
  读取一张或多张图片，提取主色，生成一张带原图缩略 + 色块 + HEX 标注的色卡图。

典型用法（命令行）：
  # 处理单张图片，输出到同目录
  python color_card_tool.py "D:\\shots\\《沙丘》_黎明前_01_ZZO.png"

  # 批量处理整个目录（递归扫描所有 png/jpg/jpeg）
  python color_card_tool.py "D:\\shots"

  # 指定色块数量、输出目录、自定义后缀
  python color_card_tool.py "D:\\shots" --colors 8 --output "D:\\cards" --suffix "色卡"

  # 不自动裁黑边（保留完整原图比例）
  python color_card_tool.py "D:\\shots" --no-crop

作为模块被 Trae 插件 / AI 调用时：
  from color_card_tool import generate_card
  generate_card("xxx.png", "xxx_色卡.png", num_colors=6)

依赖：
  pip install Pillow
  （不需要 numpy，纯 Pillow 实现）
"""

import os
import sys
import argparse
from PIL import Image, ImageDraw, ImageFont

# ---------- 默认参数 ----------
DEFAULT_NUM_COLORS = 6
DEFAULT_OUTPUT_SIZE = (1920, 1080)   # 色卡画布尺寸
DEFAULT_BG = (24, 24, 26)           # 色卡背景色（深灰）
DEFAULT_PADDING = 40
DEFAULT_SUFFIX = "色卡"              # 输出文件名插入的后缀
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

# ---------- 字体（Windows 默认字体，跨平台可改） ----------
def _pick_font(bold=False, size=24):
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


# ---------- 核心工具函数 ----------
def crop_black_bars(img, thresh=12):
    """裁除上下近纯黑的电影黑边。返回裁剪后的图。"""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    top = 0
    for y in range(h):
        if any(px[x, y] > thresh for x in range(0, w, 4)):
            top = y
            break
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        if any(px[x, y] > thresh for x in range(0, w, 4)):
            bottom = y
            break
    if bottom <= top:
        return img
    return img.crop((0, top, w, bottom + 1))


def extract_palette(img, n=6):
    """
    从图片提取 n 个主色，按像素占比降序。
    返回: [(hex_str, rgb_tuple, ratio_float), ...]
    """
    small = img.convert("RGB").resize((160, 90))
    quant = small.quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
    palette = quant.getpalette()[: n * 3]
    hist = quant.histogram()
    total = sum(hist[:n])
    colors = []
    for i in range(n):
        r, g, b = palette[i * 3 : i * 3 + 3]
        ratio = hist[i] / total if total else 0
        colors.append((f"#{r:02X}{g:02X}{b:02X}", (r, g, b), ratio))
    colors.sort(key=lambda c: -c[2])
    return colors


def _text_color_for(bg_rgb):
    """根据色块亮度决定叠加文字用黑还是白。"""
    r, g, b = bg_rgb
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (15, 15, 15) if lum > 140 else (245, 245, 245)


def _fit_image(img, max_w, max_h):
    iw, ih = img.size
    scale = min(max_w / iw, max_h / ih)
    return img.resize((int(iw * scale), int(ih * scale)), Image.LANCZOS)


# ---------- 主入口：生成单张色卡 ----------
def generate_card(src_path, out_path, num_colors=DEFAULT_NUM_COLORS,
                  crop_bars=True, out_size=DEFAULT_OUTPUT_SIZE,
                  bg=DEFAULT_BG, title_text=None):
    """
    为单张图片生成色卡。

    参数:
        src_path    : 原图路径
        out_path    : 色卡输出路径（含文件名）
        num_colors  : 提取几个主色，默认 6
        crop_bars   : 是否自动裁除电影黑边，默认 True
        out_size    : 色卡画布 (w, h)
        bg          : 色卡背景色
        title_text  : 顶部标题，默认用文件名（去后缀）

    返回:
        out_path（生成成功）或 None（失败时抛异常）
    """
    src = Image.open(src_path)

    # 处理透明 PNG
    if src.mode in ("RGBA", "LA") or (src.mode == "P" and "transparency" in src.info):
        src = src.convert("RGBA")
        bg_img = Image.new("RGB", src.size, (0, 0, 0))
        bg_img.paste(src, mask=src.split()[-1])
        src = bg_img
    else:
        src = src.convert("RGB")

    work = crop_black_bars(src) if crop_bars else src
    palette = extract_palette(work, num_colors)

    W, H = out_size
    P = DEFAULT_PADDING
    card = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(card)

    f_title = _pick_font(bold=True, size=30)
    f_hex = _pick_font(size=26)
    f_ratio = _pick_font(size=18)

    title = title_text or os.path.splitext(os.path.basename(src_path))[0]
    draw.text((P, 18), title, font=f_title, fill=(235, 235, 235))

    # 上方原图缩略区
    img_area_top = 70
    img_area_bottom = int(H * 0.66)
    img_area_h = img_area_bottom - img_area_top
    thumb = _fit_image(work, W - P * 2, img_area_h)
    tw, th = thumb.size
    card.paste(thumb, (P, img_area_top + (img_area_h - th) // 2))

    # 分隔线
    sep_y = img_area_bottom + 10
    draw.line([(P, sep_y), (W - P, sep_y)], fill=(60, 60, 64), width=2)

    # 下方色块区
    sw_top = sep_y + 25
    sw_bottom = H - 50
    sw_h = sw_bottom - sw_top
    gap = 16
    avail_w = W - P * 2
    sw_w = (avail_w - gap * (num_colors - 1)) // num_colors

    for i, (hex_c, rgb, ratio) in enumerate(palette):
        x0 = P + i * (sw_w + gap)
        y0 = sw_top
        x1 = x0 + sw_w
        y1 = y0 + sw_h - 50
        draw.rectangle([x0, y0, x1, y1], fill=rgb, outline=(80, 80, 84), width=1)
        tc = _text_color_for(rgb)
        draw.text((x0 + 10, y0 + 8), f"{ratio*100:.1f}%", font=f_ratio, fill=tc)
        draw.text((x0, y1 + 10), hex_c, font=f_hex, fill=(235, 235, 235))

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    card.save(out_path, "PNG", optimize=True)
    return out_path


# ---------- 批量处理 ----------
def _build_out_name(src_name, suffix):
    """在文件名末尾（扩展名前）插入后缀。
    例: 'a_ZZO.png' + '色卡' -> 'a_色卡_ZZO.png'
    若文件名里含 'ZZO' 标识，则插到 ZZO 前，保持命名规范一致。
    """
    base, ext = os.path.splitext(src_name)
    if "ZZO" in base:
        return base.replace("ZZO", f"{suffix}_ZZO") + ext
    return f"{base}_{suffix}{ext}"


def process_path(target, colors=DEFAULT_NUM_COLORS, output_dir=None,
                 suffix=DEFAULT_SUFFIX, crop_bars=True):
    """
    处理一个路径：单张图片或整个目录（递归）。
    返回成功生成的文件数。
    """
    if os.path.isfile(target):
        files = [target]
    elif os.path.isdir(target):
        files = []
        for dp, _, fs in os.walk(target):
            for f in fs:
                if os.path.splitext(f)[1].lower() in IMAGE_EXTS and suffix not in f:
                    files.append(os.path.join(dp, f))
        files.sort()
    else:
        raise FileNotFoundError(target)

    ok = 0
    for fp in files:
        d = output_dir or os.path.dirname(fp)
        out_name = _build_out_name(os.path.basename(fp), suffix)
        out_path = os.path.join(d, out_name)
        try:
            generate_card(fp, out_path, num_colors=colors, crop_bars=crop_bars)
            ok += 1
            print(f"[OK] {out_path}")
        except Exception as e:
            print(f"[FAIL] {fp}: {e}", file=sys.stderr)
    print(f"完成：成功 {ok}/{len(files)}")
    return ok


# ---------- CLI ----------
def main():
    ap = argparse.ArgumentParser(description="电影光影截图色卡生成工具")
    ap.add_argument("path", help="图片文件或包含图片的目录路径")
    ap.add_argument("--colors", type=int, default=DEFAULT_NUM_COLORS,
                    help=f"主色数量，默认 {DEFAULT_NUM_COLORS}")
    ap.add_argument("--output", default=None, help="输出目录，默认与原图同目录")
    ap.add_argument("--suffix", default=DEFAULT_SUFFIX,
                    help=f"输出文件名插入的后缀，默认 '{DEFAULT_SUFFIX}'")
    ap.add_argument("--no-crop", action="store_true", help="不自动裁除电影黑边")
    args = ap.parse_args()

    process_path(args.path, colors=args.colors, output_dir=args.output,
                 suffix=args.suffix, crop_bars=not args.no_crop)


if __name__ == "__main__":
    main()
