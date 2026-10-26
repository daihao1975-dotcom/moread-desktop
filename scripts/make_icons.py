#!/usr/bin/env python3
"""Build every MoRead icon from build/icon-art.png.

The artwork has soft, irregular edges. macOS 26 places icons that do not follow the standard
rounded-square template on a light plate and shrinks them, so the artwork is laid on a matching
blue-to-aqua gradient and cut to a continuous-corner square:

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
ART = root / 'build/icon-art.png'
TOP_LEFT, BOTTOM_RIGHT = (1, 120, 253), (6, 238, 220)
ART_SCALE = 0.84  # leaves breathing room between the character and the icon edge


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


def character():
    """Lift the character off the artwork's own blue-to-aqua plate with a soft colour key."""
    art = Image.open(ART).convert('RGBA')
    pixels = art.load()
    for y in range(art.height):
        for x in range(art.width):
            r, g, b, a = pixels[x, y]
            plate = min(1.0, max(0.0, (min(g, b) - r - 40) / 50), max(0.0, (max(g, b) - 165) / 50))
            pixels[x, y] = (r, g, b, round(a * (1 - plate)))
    alpha = art.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    art.putalpha(alpha)
    return art


_figure = None


def filled(size, masked=True):
    """The character at ART_SCALE, centred on the gradient sampled from the original plate."""
    global _figure
    _figure = _figure or character()
    tile = gradient(size)
    glow = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    ImageDraw.Draw(glow).ellipse((size * .12, size * .08, size * .88, size * .84), fill=(255, 255, 255, 46))
    tile.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size / 9)))
    inner = round(size * ART_SCALE)
    figure = _figure.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    tile.alpha_composite(figure, (offset, size - inner + round(size * 0.015)))  # the cut-off sleeves sit on the bottom edge
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
