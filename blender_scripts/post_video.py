"""Finishing: upscale, grade, transitions, overlays, word-highlighted captions -> piped to ffmpeg."""
import json, glob, os, sys, math, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
sys.path.insert(0, '/opt/work'); sys.path.insert(0, '/opt/work/scripts')
from vo_lines import LINES
from post_audio_cfg import VO_START

W, H, FPS = 1080, 1920, 30
FR = '/opt/work/frames'
FONT = '/opt/assets/fonts/'
LAST = int(sys.argv[1]) if len(sys.argv) > 1 else 3631
FIRST = int(sys.argv[2]) if len(sys.argv) > 2 else 1
OUT = sys.argv[3] if len(sys.argv) > 3 else '/opt/work/final_video.mp4'

def font(name, size, var=None):
    f = ImageFont.truetype(FONT + name, size)
    if var:
        try: f.set_variation_by_name(var)
        except Exception: pass
    return f

# ------------------------------------------------------------------ shot table
cams = []
overlays = []
for j in sorted(glob.glob('/opt/work/groups/G*.json')):
    d = json.load(open(j)); cams += d['cams']; overlays += d['overlays']
cams.sort(key=lambda c: c[1])
TRANS = json.load(open('/opt/work/transitions.json'))
TR = {t['frame']: t for t in TRANS}

def shot_at(f):
    cur = None
    for n, a, b in cams:
        if a <= f: cur = n
    return cur

GRADE = {
    'CAM_S03a': 'sepia', 'CAM_S03b': 'sepia', 'CAM_S05': 'memory', 'CAM_S06a': 'memory', 'CAM_S06b': 'memory',
    'CAM_S13': 'night', 'CAM_S19': 'cold', 'CAM_S20': 'warm_end', 'CAM_S10': 'morning',
}

# ------------------------------------------------------------------ captions
words_json = json.load(open('/opt/work/vo/words.json'))
CAPS = []   # (t0, t1, [ (word, wt0, wt1) ])
for key, txt in LINES:
    ws = words_json[key]
    base = VO_START[key]
    script = txt.replace('—', ' ').split()
    if len(ws) == len(script):
        timed = [(script[i], base + ws[i][1], base + ws[i][2]) for i in range(len(script))]
    else:
        t0, t1 = ws[0][1], ws[-1][2]
        tot = sum(len(w) + 1 for w in script); acc = 0; timed = []
        for w in script:
            a = t0 + (t1 - t0) * acc / tot; acc += len(w) + 1; b = t0 + (t1 - t0) * acc / tot
            timed.append((w, base + a, base + b))
    # chunk
    chunk = []
    for i, (w, a, b) in enumerate(timed):
        chunk.append((w, a, b))
        text = ' '.join(x[0] for x in chunk)
        end_punct = w[-1] in '.,!?;:'
        if len(chunk) >= 3 or len(text) >= 16 or end_punct or i == len(timed) - 1:
            CAPS.append(chunk); chunk = []
CAPS2 = []
for i, ch in enumerate(CAPS):
    t0 = ch[0][1]
    nxt = CAPS[i + 1][0][1] if i + 1 < len(CAPS) else ch[-1][2] + 0.4
    t1 = min(nxt, ch[-1][2] + 0.45)
    CAPS2.append((t0, t1, ch))

CAP_FONT = font('Montserrat.ttf', 78, b'ExtraBold')
def clean(w): return w.upper()

def draw_caption(img, t):
    for t0, t1, ch in CAPS2:
        if t0 <= t < t1:
            d = ImageDraw.Draw(img)
            words = [clean(w) for w, a, b in ch]
            sizes = [d.textlength(w + ' ', font=CAP_FONT) for w in words]
            total = sum(sizes) - d.textlength(' ', font=CAP_FONT)
            # pop-in scale on chunk start
            age = t - t0
            sc = 1.0 + 0.12 * max(0, 1 - age / 0.12)
            fnt = CAP_FONT if sc < 1.01 else font('Montserrat.ttf', int(78 * sc), b'ExtraBold')
            sizes = [d.textlength(w + ' ', font=fnt) for w in words]; total = sum(sizes) - d.textlength(' ', font=fnt)
            x = (W - total) / 2; y = int(H * 0.655)
            if total > W - 90:   # two lines fallback
                fnt = font('Montserrat.ttf', 64, b'ExtraBold'); sizes = [d.textlength(w + ' ', font=fnt) for w in words]; total = sum(sizes); x = (W - total) / 2
            for (w, a, b), s, word in zip(ch, sizes, words):
                active = a - 0.03 <= t < max(b, a + 0.12)
                col = (255, 214, 10) if active else (255, 255, 255)
                d.text((x, y), word, font=fnt, fill=col, stroke_width=9, stroke_fill=(0, 0, 0), anchor='ls')
                x += s
            return

# ------------------------------------------------------------------ overlays
def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def draw_overlays(img, f):
    d = ImageDraw.Draw(img)
    for o in overlays:
        if not (o['f0'] <= f <= o['f1']): continue
        age = (f - o['f0']) / FPS; rem = (o['f1'] - f) / FPS
        a = ease(age / 0.35) * ease(rem / 0.3)
        k = o['kind']
        if k == 'title':
            s = 1 + 0.15 * (1 - ease(age / 0.25))
            ft = font('Anton-Regular.ttf', int(150 * s)); fs = font('Montserrat.ttf', 46, b'Bold')
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            ld.text((W / 2, H * 0.24), o['text'], font=ft, fill=(255, 255, 255, int(255 * a)), stroke_width=10, stroke_fill=(0, 0, 0, int(255 * a)), anchor='mm')
            if o.get('sub'):
                ld.text((W / 2, H * 0.24 + 120 * s), o['sub'], font=fs, fill=(255, 214, 10, int(255 * a)), stroke_width=6, stroke_fill=(0, 0, 0, int(255 * a)), anchor='mm')
            img.alpha_composite(layer)
        elif k in ('place', 'date'):
            ft = font('Oswald.ttf', 70 if k == 'place' else 84, b'Bold'); fs = font('Oswald.ttf', 40, b'Regular')
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            txt = o['text']
            # typewriter reveal
            n = int(len(txt) * min(1, age / 0.5)); txt = txt[:max(1, n)]
            tw = ld.textlength(o['text'], font=ft)
            x0 = (W - tw) / 2 - 30; y0 = H * 0.12
            ld.rectangle((x0, y0 - 62, x0 + tw + 60, y0 + 40 + (55 if o.get('sub') else 0)), fill=(0, 0, 0, int(150 * a)))
            ld.rectangle((x0, y0 - 62, x0 + 8, y0 + 40 + (55 if o.get('sub') else 0)), fill=(255, 214, 10, int(255 * a)))
            ld.text((x0 + 30, y0), txt, font=ft, fill=(255, 255, 255, int(255 * a)), anchor='ls')
            if o.get('sub'):
                ld.text((x0 + 30, y0 + 58), o['sub'], font=fs, fill=(220, 220, 220, int(255 * a)), anchor='ls')
            img.alpha_composite(layer)
        elif k == 'lower_third':
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            ft = font('Oswald.ttf', 62, b'Bold'); fs = font('Oswald.ttf', 40, b'Regular')
            slide = (1 - ease(age / 0.4)) * -700
            y0 = H * 0.79
            tw = max(ld.textlength(o['text'], font=ft), ld.textlength(o['sub'], font=fs))
            x0 = 60 + slide
            ld.rectangle((x0, y0 - 70, x0 + tw + 70, y0 + 60), fill=(0, 0, 0, int(170 * a)))
            ld.rectangle((x0, y0 - 70, x0 + 10, y0 + 60), fill=(255, 214, 10, int(255 * a)))
            ld.text((x0 + 35, y0 - 5), o['text'], font=ft, fill=(255, 255, 255, int(255 * a)), anchor='ls')
            ld.text((x0 + 35, y0 + 45), o['sub'], font=fs, fill=(255, 214, 10, int(255 * a)), anchor='ls')
            img.alpha_composite(layer)
        elif k == 'years':
            span = o['f1'] - o['f0']
            p = (f - o['f0']) / span
            yr = int(o['y0'] + (o['y1'] - o['y0']) * min(1, p ** 0.85) + 0.5)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            ft = font('Anton-Regular.ttf', 190)
            ld.text((W / 2, H * 0.2), str(yr), font=ft, fill=(255, 255, 255, int(255 * a)), stroke_width=12, stroke_fill=(0, 0, 0, int(255 * a)), anchor='mm')
            ld.text((W / 2, H * 0.2 + 125), 'STILL IN TERMINAL 1', font=font('Montserrat.ttf', 44, b'Bold'), fill=(255, 214, 10, int(255 * a)), stroke_width=6, stroke_fill=(0, 0, 0, int(255 * a)), anchor='mm')
            img.alpha_composite(layer)
        elif k == 'film':
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            y0 = H * 0.17; hh = 230
            ld.rectangle((0, y0 - hh / 2, W, y0 + hh / 2), fill=(10, 10, 10, int(215 * a)))
            for xx in range(0, W, 54):
                for yy in (y0 - hh / 2 + 10, y0 + hh / 2 - 34):
                    ld.rounded_rectangle((xx + 10, yy, xx + 38, yy + 24), radius=4, fill=(230, 230, 230, int(200 * a)))
            ld.text((W / 2, y0 - 12), o['text'], font=font('Anton-Regular.ttf', 96), fill=(255, 255, 255, int(255 * a)), anchor='mm')
            ld.text((W / 2, y0 + 58), o['sub'], font=font('Montserrat.ttf', 36, b'Bold'), fill=(255, 214, 10, int(255 * a)), anchor='mm')
            img.alpha_composite(layer)
        elif k == 'end':
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
            ld.text((W / 2, H * 0.40), o['text'], font=font('Oswald.ttf', 70, b'Bold'), fill=(255, 255, 255, int(255 * a)), stroke_width=4, stroke_fill=(0, 0, 0, int(200 * a)), anchor='mm')
            ld.text((W / 2, H * 0.40 + 80), o['sub'], font=font('Oswald.ttf', 52, b'Regular'), fill=(255, 214, 10, int(255 * a)), stroke_width=4, stroke_fill=(0, 0, 0, int(200 * a)), anchor='mm')
            img.alpha_composite(layer)

# ------------------------------------------------------------------ grading & fx
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vign = 1 - 0.38 * (((xx - W / 2) / (W / 2)) ** 2 * 0.6 + ((yy - H / 2) / (H / 2)) ** 2 * 0.5) ** 1.2
vign = np.clip(vign, 0.55, 1)[..., None]
rng = np.random.default_rng(1)
GRAIN = [rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]

def grade(a, kind):
    # a: float32 HxWx3 0..1
    if kind == 'sepia':
        l = a @ np.array([0.3, 0.59, 0.11], np.float32)
        sep = np.stack([l * 1.08 + 0.03, l * 0.92 + 0.015, l * 0.72], -1)
        a = a * 0.35 + sep * 0.65
    elif kind == 'memory':
        l = a @ np.array([0.3, 0.59, 0.11], np.float32)
        a = a * 0.6 + l[..., None] * 0.4
        a = a * np.array([0.97, 1.0, 1.05], np.float32)
    elif kind == 'night':
        a = a * np.array([0.82, 0.92, 1.12], np.float32)
    elif kind == 'cold':
        l = a @ np.array([0.3, 0.59, 0.11], np.float32)
        a = (a * 0.75 + l[..., None] * 0.25) * np.array([0.95, 1.0, 1.06], np.float32)
    elif kind == 'warm_end':
        a = a * np.array([1.06, 1.0, 0.9], np.float32)
    elif kind == 'morning':
        a = a * np.array([0.95, 1.0, 1.05], np.float32)
    else:
        a = a * np.array([1.02, 1.0, 0.97], np.float32)
    # gentle s-curve contrast
    a = np.clip(a, 0, 1)
    a = a + 0.55 * (a - a * a) * (2 * a - 1)
    l = a @ np.array([0.3, 0.59, 0.11], np.float32)
    a = l[..., None] + (a - l[..., None]) * 1.12
    return a

def load_frame(f):
    p = '%s/f_%05d.png' % (FR, f)
    im = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
    return im

trail = None
proc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                         '-i', '/opt/work/final_audio.wav', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
                         '-profile:v', 'high', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
prev_img = None
for f in range(FIRST, LAST + 1):
    im = load_frame(f)
    shot = shot_at(f)
    a = np.asarray(im, np.float32) / 255.0
    # timelapse ghost trails
    if shot == 'CAM_S14':
        trail = a if trail is None else trail * 0.62 + a * 0.38
        a = np.maximum(a * 0.55 + trail * 0.45, 0)
    else:
        trail = None
    a = grade(a, GRADE.get(shot, 'default'))
    a = a * vign
    g = GRAIN[f % 6]
    gs = 0.035 if GRADE.get(shot) in ('sepia', 'memory') else 0.018
    g = np.asarray(Image.fromarray(((g * 40) + 128).clip(0, 255).astype(np.uint8)).resize((W, H)), np.float32) / 255.0 - 0.5
    a = a + g[..., None] * gs * 2
    # transitions
    for tf, tr in TR.items():
        d = f - tf
        if tr['type'] == 'whip' and -3 <= d <= 2:
            strength = [8, 22, 48, 60, 30, 10][d + 3]
            img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
            k = max(1, int(strength))
            arr = np.asarray(img, np.float32)
            acc = np.zeros_like(arr)
            for s_ in range(-k, k + 1, max(1, k // 6)):
                acc += np.roll(arr, s_, axis=1)
            acc /= len(range(-k, k + 1, max(1, k // 6)))
            a = acc / 255.0
        if tr['type'] == 'dip' and -6 <= d <= 6:
            a = a * (abs(d) / 6.0) ** 1.5
        if tr['type'] == 'flash' and -2 <= d <= 5:
            w_ = [0.35, 0.7, 1.0, 0.7, 0.45, 0.25, 0.12, 0.05][d + 2]
            a = a * (1 - w_) + w_
    # end fade
    if f > LAST - 45:
        a = a * max(0.0, (LAST - f) / 45.0) ** 1.2 if f > 3560 else a
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    t = (f - 1) / FPS
    draw_overlays(img, f)
    draw_caption(img, t)
    proc.stdin.write(img.convert('RGB').tobytes())
    if f % 100 == 0: print('post', f, flush=True)
proc.stdin.close(); proc.wait()
print('video done', OUT)
