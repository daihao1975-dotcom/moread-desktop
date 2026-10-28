#!/usr/bin/env python3
"""Build every MoRead icon from a vector mark drawn here: an open book under an ink drop.

The mark is plain geometry (no generated artwork), drawn white on a DingTalk-blue to Apple-green
diagonal gradient and cut to a continuous-corner square:

- build/icon-art.png           the mark alone, white on transparent, 1024 px (reference source)
- build/appicon.png            macOS grid: 824 px shape inset 100 px in a 1024 px canvas, with shadow
- build/windows/icon.ico       full-bleed shape, 16–256 px
- frontend/src/assets/icon.png full-bleed shape, 128 px, for the sidebar and About dialog
- build/darwin/AppIcon.icon     Icon Composer document; scripts/release.sh compiles it to Assets.car so
                               macOS 26 and later draw the icon edge to edge with the system mask
"""
import json
import pathlib
from PIL import Image, ImageChops, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parents[1]
TOP_LEFT, BOTTOM_RIGHT = (22, 119, 255), (52, 199, 89)  # #1677FF -> #34C759
MARK_SCALE = 0.80  # leaves breathing room between the mark and the icon edge
SUPERSAMPLE = 4


def gradient(size):
    """Diagonal gradient sampled from the artwork's own background."""
    ramp = Image.linear_gradient('L').resize((size, size))
    diagonal = ImageChops.add(ramp, ramp.rotate(90), scale=2)  # 0 at top-left, 255 at bottom-right
    start = Image.new('RGB', (size, size), TOP_LEFT)
    end = Image.new('RGB', (size, size), BOTTOM_RIGHT)
    return Image.composite(end, start, diagonal).convert('RGBA')


def squircle(size, exponent=5.0, supersample=4):
    """Anti-aliased superellipse mask, close to Apple's continuous-corner icon shape."""
    big = size * supersample
    mask = Image.new('L', (big, big), 0)
    draw = ImageDraw.Draw(mask)
    half = big / 2
    for row in range(big):
        y = abs((row + 0.5 - half) / half)
        if y >= 1:
            continue
        x = (1 - y ** exponent) ** (1 / exponent) * half
        draw.line([(half - x, row), (half + x - 1, row)], fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def _cubic(p0, p1, p2, p3, n=64):
    return [tuple(((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d) * SUPERSAMPLE
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


def _page(sign, top, bottom, edge_top, edge_bottom, width, gap):
    """One page in 1024-unit space: inner edge at the spine, curved top and bottom, straight outer edge."""
    inner, outer = 512 + sign * gap, 512 + sign * width
    return (_cubic((inner, top), (512 + sign * 120, top - 70), (512 + sign * 220, edge_top - 10), (outer, edge_top)) +
            _cubic((outer, edge_bottom), (512 + sign * 220, edge_bottom - 10), (512 + sign * 120, bottom - 70), (inner, bottom)))


def mark():
    """White book-and-ink-drop mark on transparent, 1024 px, vertically centred."""
    big = Image.new('L', (1024 * SUPERSAMPLE,) * 2, 0)
    draw = ImageDraw.Draw(big)
    for sign in (-1, 1):  # back pages, lower and wider: reads as the page stack
        draw.polygon(_page(sign, 474, 840, 426, 776, 318, 6), fill=150)
    for sign in (-1, 1):
        draw.polygon(_page(sign, 438, 804, 390, 740, 296, 14), fill=255)
    tip, cy, r = 184, 320, 74  # ink drop above the spine
    draw.polygon(_cubic((512, tip), (530, tip + 50), (512 + r, cy - 56), (512 + r, cy)) +
                 _cubic((512 + r, cy), (512 + r, cy + 1.33 * r), (512 - r, cy + 1.33 * r), (512 - r, cy)) +
                 _cubic((512 - r, cy), (512 - r, cy - 56), (494, tip + 50), (512, tip)), fill=255)
    art = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    art.putalpha(big.resize((1024, 1024), Image.LANCZOS))
    return art


_mark = None


def filled(size, masked=True):
    """The mark at MARK_SCALE, centred on the gradient."""
    global _mark
    _mark = _mark or mark()
    tile = gradient(size)
    glow = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    ImageDraw.Draw(glow).ellipse((size * .12, size * .08, size * .88, size * .84), fill=(255, 255, 255, 28))
    tile.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size / 9)))
    inner = round(size * MARK_SCALE)
    offset = (size - inner) // 2
    tile.alpha_composite(_mark.resize((inner, inner), Image.LANCZOS), (offset, offset))
    if masked:
        tile.putalpha(squircle(size))
    return tile


def mac_icon():
    canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    body = filled(824)
    shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shade = Image.new('RGBA', (824, 824), (0, 0, 0, 70))
    shade.putalpha(ImageChops.multiply(body.getchannel('A'), Image.new('L', (824, 824), 70)))
    shadow.paste(shade, (100, 112), shade)
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.alpha_composite(body, (100, 100))
    return canvas


if __name__ == '__main__':
    mark().save(root / 'build/icon-art.png', optimize=True)
    mac_icon().save(root / 'build/appicon.png', optimize=True)
    full = filled(1024)
    full.save(root / 'build/windows/icon.ico', sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
    full.resize((128, 128), Image.LANCZOS).save(root / 'frontend/src/assets/icon.png', optimize=True)
    bundle = root / 'build/darwin/AppIcon.icon'
    (bundle / 'Assets').mkdir(parents=True, exist_ok=True)
    square = filled(1024, masked=False).convert('RGB')
    square.save(bundle / 'Assets/art.png', optimize=True)
    (bundle / 'icon.json').write_text(json.dumps({
        'fill': {'solid': 'srgb:%.5f,%.5f,%.5f,1.00000' % tuple(c / 255 for c in TOP_LEFT)},
        'groups': [{'layers': [{'glass': False, 'image-name': 'art.png', 'name': 'art'}],
                    'shadow': {'kind': 'neutral', 'opacity': 0.5},
                    'translucency': {'enabled': False, 'value': 0.5}}],
        'supported-platforms': {'squares': ['macOS']},
    }, indent=2) + '\n')
    print('icons written')
