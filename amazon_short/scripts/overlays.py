"""Info-graphic overlays (1080x1920 RGBA PNG) + their timing -> renders/overlays/*.png, overlays.json"""
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
R = '/home/user/code/amazon_short/'
OUT = R + 'renders/overlays/'; os.makedirs(OUT, exist_ok=True)
TL = json.load(open(R + 'scripts/timeline.json')); SH = {s['id']: s for s in TL['shots']}
F = lambda sz, w='Bold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/InterDisplay-{w}.otf', sz)
GOLD = (255, 214, 60); WHITE = (255, 255, 255)


def canvas(): return Image.new('RGBA', (1080, 1920), (0, 0, 0, 0))


def pill(im, box, r=36, fill=(10, 14, 12, 175)):
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), r, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(10)); im.alpha_composite(sh)
    d = ImageDraw.Draw(im); d.rounded_rectangle(box, r, fill=fill, outline=(255, 255, 255, 60), width=2)


def text_c(im, y, txt, font, fill=WHITE, stroke=0):
    d = ImageDraw.Draw(im); w = d.textlength(txt, font=font)
    d.text(((1080 - w) / 2, y), txt, font=font, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0))
    return w


items = []
def add(name, im, t0, t1):
    im.save(OUT + name + '.png'); items.append(dict(file=OUT + name + '.png', t0=round(t0, 3), t1=round(t1, 3)))


# heat & humidity (S11)
im = canvas(); pill(im, (150, 230, 930, 470))
d = ImageDraw.Draw(im)
# thermometer glyph
d.rounded_rectangle((215, 265, 255, 395), 20, outline=WHITE, width=6); d.ellipse((200, 375, 270, 445), fill=(230, 70, 50), outline=WHITE, width=6)
d.rectangle((226, 300, 244, 390), fill=(230, 70, 50))
d.text((310, 255), '30–35 °C', font=F(110), fill=GOLD)
d.text((314, 380), '80–100% HUMIDITY', font=F(52, 'SemiBold'), fill=WHITE)
add('heat', im, SH['S11']['start'] + 0.3, SH['S11']['end'] - 0.2)

for name, sid, txt, sub in [('night1', 'S22', 'NIGHT 1', None), ('day3', 'S24', 'DAY 3', None), ('day5', 'S31', 'DAY 5', None)]:
    im = canvas(); w = ImageDraw.Draw(im).textlength(txt, font=F(150)); pill(im, (540 - w / 2 - 60, 220, 540 + w / 2 + 60, 430), 50)
    text_c(im, 232, txt, F(150), GOLD)
    s0 = SH[sid]['start'] + (1.2 if sid == 'S22' else 0.15)
    add(name, im, s0, s0 + 2.6)

# microbes (S15)
im = canvas(); pill(im, (140, 230, 940, 520))
text_c(im, 250, 'INVISIBLE DANGER', F(70), GOLD)
text_c(im, 345, 'Giardia  ·  Cryptosporidium', F(54, 'SemiBold'))
text_c(im, 420, 'disease-causing bacteria', F(54, 'SemiBold'))
add('microbes', im, SH['S15']['start'] + 0.15, SH['S15']['end'] - 0.05)

# flow diagram legend (S20)
im = canvas(); pill(im, (120, 200, 960, 560))
text_c(im, 220, 'SMALL STREAM', F(68)); text_c(im, 300, '↓', F(60), GOLD); text_c(im, 365, 'BIG RIVER', F(68)); text_c(im, 445, '↓', F(60), GOLD)
text_c(im, 485, 'PEOPLE & BOATS', F(60), GOLD)
add('flow', im, SH['S20']['start'] + 0.4, SH['S20']['end'] - 0.1)

# snake ID (S27)
im = canvas(); pill(im, (150, 230, 930, 470))
text_c(im, 250, 'FER-DE-LANCE', F(96), GOLD)
text_c(im, 372, 'Bothrops atrox  ·  highly venomous', F(46, 'Medium'))
add('snake', im, SH['S27']['start'] + 0.2, SH['S27']['end'] - 0.1)

# Juliane Koepcke card (S33)
im = canvas(); pill(im, (110, 200, 970, 600))
text_c(im, 225, 'TRUE STORY', F(48, 'SemiBold'), GOLD)
text_c(im, 290, 'Juliane Koepcke, 17', F(80))
text_c(im, 400, 'LANSA Flight 508 · Peru · Dec 1971', F(44, 'Medium'))
text_c(im, 470, 'Followed a creek downstream', F(48, 'SemiBold'))
text_c(im, 530, 'Rescued after 11 days', F(48, 'SemiBold'), GOLD)
add('juliane', im, TL['vo']['L15'] + 0.3, SH['S34']['start'] + 1.0)

# closing safety line (S34 tail)
im = canvas(); pill(im, (110, 220, 970, 520))
text_c(im, 245, 'BEFORE ANY HIKE:', F(56, 'SemiBold'), GOLD)
text_c(im, 320, 'tell someone your route', F(64))
text_c(im, 405, 'and when you will be back.', F(64))
add('tip', im, SH['S34']['start'] + 1.6, TL['total'])
json.dump(items, open(OUT + 'overlays.json', 'w'), indent=1)
print(len(items), 'overlays')
