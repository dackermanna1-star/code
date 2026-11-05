"""Build burned-in captions + info labels (ASS) for "Stranded" from the Kokoro word timings.
Shorts-style captions: 1-3 words, uppercase, white with heavy outline, active word in yellow with a pop."""
import json, re
T = json.load(open('/home/user/code/story/vo_timing.json'))
shots = {s[0]: (s[1], s[2]) for s in json.load(open('/home/user/code/story/shots.json'))['shots']}
OUT = '/home/user/code/story/captions.ass'

def ts(t):
    t = max(0.0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return '%d:%02d:%05.2f' % (h, m, s)

head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Display Black,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,1,0,1,7,4,2,80,80,560,1
Style: Head,Inter Display Black,64,&H0000D7FF,&H00FFFFFF,&H00000000,&HA0101010,-1,0,0,0,100,100,2,0,3,18,0,8,60,60,250,1
Style: Item,Inter Display Black,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0101010,-1,0,0,0,100,100,1,0,3,16,0,8,60,60,330,1
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

# per-shot caption placement: move captions to the top where the face/graphic sits low in frame
TOP_Y = {'SH05': 300, 'SH08': 300, 'SH09': 300, 'SH11': 330, 'SH12': 300, 'SH13': 300, 'SH14': 215, 'SH17': 300,
         'SH18': 330, 'SH20': 300, 'SH24': 300, 'SH26': 330}
def shot_at(t):
    for sid, (a, b) in shots.items():
        if a <= t < b: return sid
    return None
for i, ch in enumerate(chunks):
    start = ch[0]['s'] - 0.04
    sid = shot_at(start + 0.05)
    place = (r'{\an8\pos(540,%d)}' % TOP_Y[sid]) if sid in TOP_Y else ''
    nxt = chunks[i + 1][0]['s'] - 0.04 if i + 1 < len(chunks) else ch[-1]['e'] + 0.6
    end = min(nxt, ch[-1]['e'] + 0.45)
    for j, w in enumerate(ch):
        ws = start if j == 0 else w['s'] - 0.02
        we = (ch[j + 1]['s'] - 0.02) if j + 1 < len(ch) else end
        parts = []
        for k, x in enumerate(ch):
            if k == j:
                pop = r'{\t(0,80,\fscx112\fscy112)\t(80,160,\fscx104\fscy104)}' if True else ''
                parts.append(r'{\c%s}%s%s{\c&H00FFFFFF&\fscx100\fscy100}' % (YEL, pop, x['txt']))
            else:
                parts.append(x['txt'])
        intro = r'{\fad(60,0)}' if j == 0 else ''
        ev.append('Dialogue: 2,%s,%s,Cap,,0,0,0,,%s%s%s' % (ts(ws), ts(we), place, intro, ' '.join(parts)))

# ---------------------------------------------------------------- labels for the verdict (SH27/SH28) and the real case (SH25/SH26)
def word_time(seg_id, word, nth=0):
    seg = next(s for s in T['segments'] if s['id'] == seg_id)
    hits = [w for w in seg['words'] if w['w'].lower().strip(",.?") == word.lower()]
    return hits[nth]['s']

def label(style, text, t0, t1, y, fade=(180, 250)):
    ev.append(r'Dialogue: 1,%s,%s,%s,,0,0,0,,{\an8\pos(540,%d)\fad(%d,%d)}%s' % (ts(t0), ts(t1), style, y, fade[0], fade[1], text))

end27 = shots['SH27'][1]
label('Head', 'COLD WATER', word_time('n32', 'cold') - 0.1, end27, 200)
label('Item', 'SHOCK  +  HYPOTHERMIA', word_time('n32', 'shock') - 0.05, end27, 300)
label('Head', 'WARM WATER', word_time('n33', 'warm') - 0.1, end27, 430)
label('Item', 'EXHAUSTION', word_time('n33', 'exhaustion') - 0.05, end27, 530)
label('Item', 'DROWNING', word_time('n33', 'drowning') - 0.05, end27, 615)
label('Item', 'THIRST', word_time('n33', 'thirst') - 0.05, end27, 700)
end28 = shots['SH28'][1]
label('Head', 'YOUR ODDS DEPEND ON', word_time('n34', 'odds') - 0.1, end28, 200)
label('Item', '1  WATER TEMPERATURE', word_time('n34', 'temperature') - 0.15, end28, 300)
label('Item', '2  STAYING AFLOAT', word_time('n34', 'afloat') - 0.15, end28, 385)
label('Item', "3  SOMEONE KNOWS YOU'RE MISSING", word_time('n34', 'anyone') - 0.1, end28, 470)
# real case source tag
label('Src', 'Real case: Carnival Valor overboard, Gulf of Mexico, Nov 2022 (US Coast Guard)\\NRescue scene is a dramatization', word_time('n30', '2022') - 0.2, shots['SH26'][1], 150)

open(OUT, 'w').write(head + '\n'.join(ev) + '\n')
print('wrote', OUT, len(ev), 'events,', len(chunks), 'caption chunks')
