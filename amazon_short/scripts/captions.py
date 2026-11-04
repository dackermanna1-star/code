"""Word-synced, Shorts-style captions (ASS): 1–3 words at a time, bold white with black outline, key words in yellow,
pop-in scale animation. Original script text is mapped onto Whisper word timings proportionally by characters,
so on-screen spelling is the script's (e.g. 'fer-de-lance', 'Juliane Koepcke'), not the recogniser's."""
import json, re
R = '/home/user/code/amazon_short/'
TL = json.load(open(R + 'scripts/timeline.json'))
lines = json.load(open(R + 'scripts/narration.json'))
words = json.load(open(R + 'audio/vo/words.json'))
KEY = {'amazon', 'rainforest?', 'trail', 'gone.', 'same.', 'sun,', 'signal.', 'stop', 'stay', 'put.', 'nobody', 'circles', 'thirty', 'degrees,', 'humid',
       'sweat', "can't", 'stream.', 'parasites', 'bacteria,', 'diarrhea', 'rain', 'rainwater', 'safest', 'plan.', 'rivers,', 'downstream.', 'night', 'pitch', 'black,',
       'shiver,', 'three,', 'bites', 'cut', 'infected', 'fer-de-lance,', 'freeze,', 'space.', 'starving,', 'poison', 'weeks', 'water', 'alive.', 'five,', 'river.',
       'engine.', '1971,', 'seventeen-year-old', 'juliane', 'koepcke', 'eleven', 'days', 'water.'}


def norm(w): return re.sub(r'[^a-z0-9]', '', w.lower())


def t2ass(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'


out = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2", "",
       "[V4+ Styles]",
       "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
       "Style: Cap,Inter Display,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,2,60,60,560,1", "",
       "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
for L in lines:
    lid = L['id']; t0 = TL['vo'][lid]
    otoks = L['text'].split()
    asr = words[lid]
    # char-proportional mapping
    ochars = [len(norm(w)) or 1 for w in otoks]; tot_o = sum(ochars)
    achars = [len(norm(w['w'])) or 1 for w in asr]; tot_a = sum(achars)
    acum = [0]
    for c in achars: acum.append(acum[-1] + c)
    def time_at(frac, end=False):
        pos = frac * tot_a
        for i in range(len(asr)):
            if acum[i + 1] >= pos - 1e-6:
                u = (pos - acum[i]) / max(1, achars[i])
                return asr[i]['s'] + u * (asr[i]['e'] - asr[i]['s'])
        return asr[-1]['e']
    oc = [0]
    for c in ochars: oc.append(oc[-1] + c)
    tok_t = [(time_at(oc[i] / tot_o), time_at(oc[i + 1] / tot_o)) for i in range(len(otoks))]
    # chunk: up to 3 words / 16 chars, break after punctuation
    chunks = []; cur = []
    for i, w in enumerate(otoks):
        cur.append(i)
        txt = ' '.join(otoks[j] for j in cur)
        if len(cur) >= 3 or len(txt) >= 15 or w[-1] in ',.?!' or w.endswith('...'):
            chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    for ci, ch in enumerate(chunks):
        s = t0 + tok_t[ch[0]][0] - 0.04
        e = t0 + (tok_t[chunks[ci + 1][0]][0] - 0.04 if ci + 1 < len(chunks) else tok_t[ch[-1]][1] + 0.25)
        parts = []
        for j in ch:
            w = otoks[j].upper().replace('...', '…')
            parts.append(r'{\c&H32D7FF&}' + w + r'{\c&HFFFFFF&}' if norm(otoks[j]) in {norm(k) for k in KEY} else w)
        txt = ' '.join(parts)
        pop = r'{\fscx80\fscy80\t(0,90,\fscx106\fscy106)\t(90,160,\fscx100\fscy100)}'
        out.append(f"Dialogue: 0,{t2ass(s)},{t2ass(e)},Cap,,0,0,0,,{pop}{txt}")
open(R + 'renders/captions.ass', 'w').write('\n'.join(out) + '\n')
print('captions', len(out))
