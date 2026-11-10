# 生成美术哲学的色板图 docs/art-palette.png
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1600, 1230
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'  # 换成本机任意一款中文字体
f = lambda s: ImageFont.truetype(FONT, s)
INK = (10, 15, 26)
img = Image.new('RGB', (W, H), INK)
d = ImageDraw.Draw(img)
hx = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def title(y, text, sub=''):
    d.text((60, y), text, font=f(30), fill=(244, 239, 224))
    if sub: d.text((60 + d.textlength(text, font=f(30)) + 22, y + 9), sub, font=f(19), fill=(150, 165, 160))
    d.line((60, y + 46, W - 60, y + 46), fill=(227, 194, 122), width=1)

def swatch(x, y, w, h, col, name, code=None, r=8):
    d.rounded_rectangle((x, y, x + w, y + h), r, fill=hx(col), outline=(60, 70, 80))
    d.text((x, y + h + 6), name, font=f(17), fill=(232, 228, 216))
    d.text((x, y + h + 28), code or col, font=f(14), fill=(140, 150, 150))

def glow(layer, cx, cy, rad, col, a=150):
    g = Image.new('RGBA', (rad * 2, rad * 2), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    for i in range(rad, 0, -2):
        k = 1 - i / rad
        gd.ellipse((rad - i, rad - i, rad + i, rad + i), fill=col + (int(a * k * k),))
    layer.alpha_composite(g, (cx - rad, cy - rad))

d.text((60, 36), '凡人问道 · 色板', font=f(44), fill=(244, 239, 224))
d.text((60, 92), '凡尘为底，灵光点睛 —— 凡尘低饱和、不发光；饱和度与亮度只发给灵力。', font=f(22), fill=(227, 194, 122))

# ---------- 凡尘底色 ----------
y = 150; title(y, '凡尘 · 底色', '低饱和、哑光、不自发光。每章一组，最右一格是该章唯一的补光色')
chapters = [
    ('一 神手谷 · 灯火', [('#5b6a61', '石板'), ('#cfc8b4', '粉墙'), ('#343a47', '黛瓦'), ('#5a3d2c', '木'), ('#070b18', '夜')], '#ffd696', '灯笼'),
    ('二 血色禁地 · 灵光', [('#62533f', '赭土'), ('#7a5a4c', '崖壁'), ('#574236', '岩顶'), ('#47131f', '血沼'), ('#0d0507', '赤雾')], '#ff8a8a', '灵菇'),
    ('三 燕翎堡 · 鬼火', [('#55525f', '城砖'), ('#575463', '墙面'), ('#302e3a', '垛口'), ('#6a1420', '魔旗'), ('#06040c', '烬夜')], '#82ffaa', '鬼火'),
    ('四 虚天殿 · 寒光', [('#62788a', '寒玉'), ('#2b4162', '殿壁'), ('#8ea4b4', '玉顶'), ('#d9b45a', '金线'), ('#040913', '虚空')], '#96dcff', '冰焰'),
]
cx0 = 60
for name, cols, lamp, lname in chapters:
    d.text((cx0, y + 62), name, font=f(20), fill=(232, 228, 216))
    for i, (c, n) in enumerate(cols):
        swatch(cx0 + i * 54, y + 96, 48, 64, c, n, ' ')
    lx = cx0 + 5 * 54 + 10
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); glow(lay, lx + 24, y + 128, 46, hx(lamp), 170); img.paste(lay, (0, 0), lay)
    d.ellipse((lx + 8, y + 112, lx + 40, y + 144), fill=hx(lamp))
    d.text((lx, y + 166), lname, font=f(17), fill=hx(lamp))
    cx0 += 372

# ---------- 清 / 浊 ----------
def orb_row(y, items, kind):
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    x = 60
    for col, name in items:
        c = hx(col); cx, cy = x + 96, y + 50
        glow(lay, cx - 26, cy, 52 if kind == 'q' else 44, c, 150 if kind == 'q' else 110)
        if kind == 'q':   # 清：白芯、细长、锋利
            ld.polygon([(cx - 78, cy), (cx - 6, cy - 5), (cx - 6, cy + 5)], fill=c + (120,))
            ld.polygon([(cx + 44, cy), (cx + 4, cy - 9), (cx - 16, cy), (cx + 4, cy + 9)], fill=(240, 255, 250, 255), outline=c + (255,))
            ld.ellipse((cx - 44, cy - 15, cx - 14, cy + 15), fill=c + (255,)); ld.ellipse((cx - 37, cy - 8, cx - 21, cy + 8), fill=(255, 255, 255, 255))
        else:             # 浊：暗芯、团状、厚边
            dark = tuple(int(v * 0.12) for v in c)
            ld.ellipse((cx - 52, cy - 24, cx - 4, cy + 24), fill=c + (255,)); ld.ellipse((cx - 43, cy - 15, cx - 13, cy + 15), fill=dark + (255,))
            ld.ellipse((cx + 8, cy - 9, cx + 26, cy + 9), fill=c + (255,)); ld.ellipse((cx + 13, cy - 4, cx + 21, cy + 4), fill=dark + (255,))
            ld.ellipse((cx + 32, cy - 2, cx + 42, cy + 8), fill=c + (200,))
        x += 246
    img.paste(lay, (0, 0), lay)
    x = 60
    for col, name in items:
        d.text((x + 8, y + 100), name, font=f(20), fill=(232, 228, 216)); d.text((x + 8, y + 127), col, font=f(15), fill=(140, 150, 150)); x += 246

y = 400; title(y, '灵光 · 清（我方）', '白芯、细、直、锋利、长拖尾。同色相时靠芯分敌我')
orb_row(y + 56, [('#6effc8', '青 · 飞剑'), ('#b8ff7a', '竹青 · 蜂云剑'), ('#ffe36a', '辟邪金 · 神雷'), ('#eafff6', '月白 · 剑芯'), ('#8fd8ff', '冰蓝 · 冰锥'), ('#ff9a3c', '丹火 · 火弹')], 'q')
y = 620; title(y, '灵光 · 浊（敌方）', '暗芯、团、钩、滴、厚边、短尾')
orb_row(y + 56, [('#e8305a', '血 · 血灵大法'), ('#9ac832', '尸火 · 尸道'), ('#9a78ff', '幽紫 · 鬼道'), ('#5a6ea0', '墨毒 · 墨蛟'), ('#ff7a2a', '妖橙 · 妖兽'), ('#c8a078', '浊土 · 凡铁')], 'z')

# ---------- 朱砂 / 明度三层 / 界面 ----------
y = 840; title(y, '朱砂 · 预警', '专用色：所有会伤人的落点、冲锋线、禁制，只用这一个红')
lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay); zc = hx('#ff4a32')
ld.ellipse((70, y + 66, 250, y + 156), fill=zc + (46,), outline=zc + (235,), width=3); ld.ellipse((120, y + 91, 200, y + 131), fill=zc + (80,))
ld.polygon([(290, y + 96), (600, y + 82), (600, y + 142), (290, y + 126)], fill=zc + (46,), outline=zc + (220,))
img.paste(lay, (0, 0), lay)
d.text((640, y + 84), '朱砂  #ff4a32', font=f(22), fill=zc); d.text((640, y + 116), '圈 = 落点　带 = 冲锋 / 火墙', font=f(17), fill=(150, 165, 160))

d.text((960, y + 62), '明度三层（去色后仍要分得开）', font=f(20), fill=(232, 228, 216))
for i, (lab, v0, v1) in enumerate([('底 · 凡尘', 38, 102), ('形 · 角色', 102, 178), ('光 · 灵力', 204, 255)]):
    bx = 960 + i * 196
    for k in range(180): d.line((bx + k, y + 96, bx + k, y + 132), fill=(int(v0 + (v1 - v0) * k / 180),) * 3)
    d.text((bx, y + 138), lab, font=f(17), fill=(200, 205, 200))

y = 1030; title(y, '界面 · 器物', '墨底、琥珀金线、楷体；图标是印章，卡片是玉简，预警与禁制是符箓')
for i, (c, n) in enumerate([('#0a101a', '墨'), ('#e3c27a', '琥珀金'), ('#e8e4d8', '宣纸白'), ('#7fe0c0', '青（主角）'), ('#9fc2b4', '寻常'), ('#8eb4ff', '珍品'), ('#ffcf5e', '至宝'), ('#e0484a', '气血'), ('#3a78d8', '法力')]):
    swatch(60 + i * 166, y + 64, 140, 48, c, n)
import os; img.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'art-palette.png'), optimize=True)
print('saved', img.size)
