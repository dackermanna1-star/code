"""Build burned-in captions + info labels (ASS) for "Stranded" from the Kokoro word timings.
Shorts-style captions: 1-3 words, uppercase, white with heavy outline, active word in yellow with a pop."""
import json, re
T = json.load(open('/home/user/code/story/vo_timing.json'))
shots = {s[0]: (s[1], s[2]) for s in json.load(open('/home/user/code/story/shots.json'))['shots']}
OUT = '/home/user/code/story/captions.ass'

def ts(t):
    t = max(0.0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return '%d:%02d:%05.2f' % (h, m, s)

# Head/Item (the SH27/SH28 label stacks) use BorderStyle 3, whose box colour is OutlineColour: alpha &H70 (~56% opaque)
# keeps the rotor blades, hoist cable and strop visible through the boxes while the text stays readable. Box heights
# are font + 2*Outline (Head 64+36 = 100, Item 56+28 = 84 px): stacked rows abut exactly, as overlapping see-through
# boxes would leave darker seams
head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Display Black,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,1,0,1,7,4,2,80,80,560,1
Style: Head,Inter Display Black,64,&H0000D7FF,&H00FFFFFF,&H70000000,&HA0101010,-1,0,0,0,100,100,2,0,3,18,0,8,60,60,250,1
Style: Item,Inter Display Black,56,&H00FFFFFF,&H00FFFFFF,&H70000000,&HA0101010,-1,0,0,0,100,100,1,0,3,14,0,8,60,60,330,1
Style: Src,Inter,34,&H00F0F0F0,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,10,0,8,60,60,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
ev = []
YEL = '&H0000D7FF&'

# ---------------------------------------------------------------- captions
words = []
for seg in T['segments']:
    for w in seg['words']:
        t = w['w']
        if re.fullmatch(r"[\.,!;:\-—]+", t):
            if words: words[-1]['brk'] = True
            continue
        if t == '?':
            if words: words[-1]['txt'] += '?'; words[-1]['brk'] = True
            continue
        words.append({'txt': t.upper(), 's': w['s'], 'e': w['e'], 'brk': False, 'seg': seg['id']})
    if words: words[-1]['brk'] = True

chunks = []; cur = []
for w in words:
    cur.append(w)
    n_chars = sum(len(x['txt']) for x in cur) + len(cur) - 1
    if w['brk'] or len(cur) >= 3 or n_chars >= 13:
        chunks.append(cur); cur = []
if cur: chunks.append(cur)

# per-shot caption placement: top (\an8) where the face/graphic/subject sits in the default band (SH02: diver's torso,
# SH03/SH04: his mouth, SH21: the plankton glow); nothing may go below y~1570 (Shorts title/channel/subscribe UI), so
# SH03/SH04/SH27 use the top band too (the SH27 captions end at 106.72 s, before the first label at 106.78 s)
TOP_Y = {'SH02': 300, 'SH03': 300, 'SH04': 300, 'SH05': 300, 'SH08': 300, 'SH09': 300, 'SH11': 330, 'SH12': 300,
         'SH13': 300, 'SH17': 300, 'SH18': 330, 'SH20': 300, 'SH21': 300, 'SH22': 300, 'SH24': 300, 'SH27': 300}
# bottom-anchored (\an2): SH14 sits between the BODY WATER meter (ends ~y 1345; 3D labels fill the top) and the UI
# zone, so two-line captions grow upward instead of down into it
LOW_Y = {'SH14': 1550}
# shots whose on-screen labels already spell out the narration: no word captions there (n32-n34)
NO_CAPS = ('n32', 'n33', 'n34')
cuts = sorted(set([a for a, b in shots.values()] + [b for a, b in shots.values()]))
def shot_at(t):
    for sid, (a, b) in shots.items():
        if a <= t < b: return sid
    return None
def place_for(sid):
    if sid in TOP_Y: return r'{\an8\pos(540,%d)}' % TOP_Y[sid]
    if sid in LOW_Y: return r'{\an2\pos(540,%d)}' % LOW_Y[sid]
    return ''
def pieces(t0, t1):
    """split [t0, t1) at shot cuts so every piece uses the placement of the shot it is shown over"""
    out = []; a = t0
    for c in cuts:
        if a < c < t1 - 0.02:
            out.append((a, c)); a = c
    out.append((a, t1))
    return out
for i, ch in enumerate(chunks):
    if ch[0]['seg'] in NO_CAPS: continue
    start = ch[0]['s'] - 0.04
    nxt = chunks[i + 1][0]['s'] - 0.04 if i + 1 < len(chunks) else ch[-1]['e'] + 0.6
    end = min(nxt, ch[-1]['e'] + 0.45)
    # long phrases (> 16 chars, e.g. 'EXCEPT FOR PLANKTON'): slightly smaller and no pop, so the line never wraps for a
    # frame when a word scales up, and stays left of the Shorts right-hand button rail
    long_ = len(' '.join(x['txt'] for x in ch)) > 16
    for j, w in enumerate(ch):
        ws = start if j == 0 else w['s'] - 0.02
        we = (ch[j + 1]['s'] - 0.02) if j + 1 < len(ch) else end
        ps = pieces(ws, we)
        for n, (a, b) in enumerate(ps):
            # a word that has (all but) finished by the cut: the caption ends at the cut instead of reappearing at the
            # incoming shot's position (e.g. 'NOT WEEKS' at 94.10, 'JACKET' at 104.3, 'IN EVERY DIRECTION' at 20.4)
            if n > 0 and w['e'] <= a + 0.12: continue
            # a sliver (< 0.2 s) just before a cut: skip it - the phrase starts (or the word highlight moves) at the cut,
            # in the incoming shot's position, rather than flashing in the outgoing shot's band for a few frames
            if n + 1 < len(ps) and b - a < 0.2: continue
            at = a + 0.01
            parts = []
            for k, x in enumerate(ch):
                if k == j:
                    pop = r'{\t(0,80,\fscx112\fscy112)\t(80,160,\fscx104\fscy104)}' if (n == 0 and not long_) else ''
                    parts.append(r'{\c%s}%s%s{\c&H00FFFFFF&\fscx100\fscy100}' % (YEL, pop, x['txt']))
                else:
                    parts.append(x['txt'])
            intro = r'{\fad(60,0)}' if (j == 0 and (n == 0 or (n == 1 and ps[0][1] - ps[0][0] < 0.2))) else ''
            size = r'{\fs76}' if long_ else ''
            ev.append('Dialogue: 2,%s,%s,Cap,,0,0,0,,%s%s%s%s' % (ts(a), ts(b), place_for(shot_at(at)), size, intro, ' '.join(parts)))

# ---------------------------------------------------------------- labels for the verdict (SH27/SH28) and the real case (SH25/SH26)
def word_time(seg_id, word, nth=0):
    seg = next(s for s in T['segments'] if s['id'] == seg_id)
    hits = [w for w in seg['words'] if w['w'].lower().strip(",.?") == word.lower()]
    return hits[nth]['s']

def label(style, text, t0, t1, y, fade=(180, 250), x=540):
    ev.append(r'Dialogue: 1,%s,%s,%s,,0,0,0,,{\an8\pos(%d,%d)\fad(%d,%d)}%s' % (ts(t0), ts(t1), style, x, y, fade[0], fade[1], text))

# SH27: cold vs warm side by side in the sky above him (two columns keep the stack short)
end27 = shots['SH27'][1]
XL, XR = 280, 800
label('Head', 'COLD WATER', word_time('n32', 'cold') - 0.1, end27, 130, x=XL)
label('Item', 'SHOCK', word_time('n32', 'shock') - 0.05, end27, 226, x=XL)
label('Item', 'HYPOTHERMIA', word_time('n32', 'hypothermia') - 0.05, end27, 310, x=XL)
label('Head', 'WARM WATER', word_time('n33', 'warm') - 0.1, end27, 130, x=XR)
label('Item', 'EXHAUSTION', word_time('n33', 'exhaustion') - 0.05, end27, 226, x=XR)
label('Item', 'DROWNING', word_time('n33', 'drowning') - 0.05, end27, 310, x=XR)
label('Item', 'THIRST', word_time('n33', 'thirst') - 0.05, end27, 394, x=XR)
# SH28: compact stack above the helicopter (rotor top ~y 290-390 in the render: the see-through boxes keep it visible)
end28 = shots['SH28'][1]
label('Head', 'YOUR ODDS DEPEND ON', word_time('n34', 'odds') - 0.1, end28, 110)
label('Item', '1  WATER TEMPERATURE', word_time('n34', 'temperature') - 0.15, end28, 206)
label('Item', '2  STAYING AFLOAT', word_time('n34', 'afloat') - 0.15, end28, 290)
label('Item', "3  SOMEONE KNOWS YOU'RE MISSING", word_time('n34', 'anyone') - 0.1, end28, 374)
# real case source tag
label('Src', 'Real case: Carnival Valor overboard,\\NGulf of Mexico, Nov 2022 (US Coast Guard)\\NRescue scene is a dramatization', word_time('n30', 'people') - 0.15, shots['SH25'][1], 150, fade=(180, 120))

open(OUT, 'w').write(head + '\n'.join(ev) + '\n')
print('wrote', OUT, len(ev), 'events,', len(chunks), 'caption chunks')
