# -*- coding: utf-8 -*-
"""生成应用图标 icon.png (1024x1024)：蓝天底、白云、大写 ABC 与小星星。"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024
img = Image.new('RGB', (S, S), '#4FC3F7')
d = ImageDraw.Draw(img)

# 背景渐变（逐行填充）
top = (79, 195, 247)
bot = (179, 229, 252)
for y in range(S):
    t = y / S
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    d.line([(0, y), (S, y)], fill=(r, g, b))

# 白云
def cloud(cx, cy, s):
    d.ellipse([cx - 130 * s, cy - 40 * s, cx + 130 * s, cy + 45 * s], fill='white')
    d.ellipse([cx - 70 * s, cy - 90 * s, cx + 60 * s, cy + 10 * s], fill='white')

cloud(250, 210, 1.0)
cloud(800, 160, 0.7)

# 底部草地
d.ellipse([-200, 800, 1224, 1250], fill=(140, 214, 120))

# 大写ABC色块
def find_font(size):
    for p in [r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\arial.ttf',
              r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

colors = {'A': '#FF7043', 'B': '#FFB300', 'C': '#66BB6A'}
x = 250
for ch in 'ABC':
    d.rounded_rectangle([x, 380, x + 190, 570], radius=36, fill=colors[ch])
    f = find_font(110)
    bb = d.textbbox((0, 0), ch, font=f)
    d.text((x + 95 - (bb[2] - bb[0]) / 2, 475 - (bb[3] - bb[1]) / 2 - 10), ch,
           font=f, fill='white')
    x += 200

# 星星
def star(cx, cy, R, color):
    import math
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        r = R if i % 2 == 0 else R * 0.45
        pts.append((cx + r * math.cos(ang), cy - r * math.sin(ang)))
    d.polygon(pts, fill=color)

star(512, 720, 90, '#FFD54F')
star(200, 700, 55, '#FFF176')
star(830, 690, 55, '#FF8A65')

img.save(os.path.join(BASE, 'icon.png'))
print('图标已生成:', os.path.join(BASE, 'icon.png'))
