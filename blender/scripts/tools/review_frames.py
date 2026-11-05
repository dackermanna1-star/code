"""Extract review stills from the final MP4: three per shot (start / middle / end) into review/frames, one row image
per shot and three contact sheets (review/sheet_1..3.jpg).
python3 review_frames.py [video]"""
import json, os, subprocess, sys
from PIL import Image

ROOT = '/home/user/code/'
VIDEO = sys.argv[1] if len(sys.argv) > 1 else ROOT + 'output/Stranded_What_Happens_If_You_Are_Stranded_In_The_Ocean_1080x1920.mp4'
OUT = ROOT + 'review/frames/'
shots = json.load(open(ROOT + 'story/shots.json'))['shots']
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.png'): os.remove(OUT + f)
rows = []
for sid, t0, t1, *_ in shots:
    ims = []
    for tag, t in (('a', t0 + 0.2), ('b', (t0 + t1) / 2), ('c', t1 - 0.2)):
        p = OUT + '%s_%s_%06.2f.png' % (sid, tag, t)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '%.3f' % t, '-i', VIDEO, '-frames:v', '1', '-vf', 'scale=540:960', p], check=True)
        ims.append(Image.open(p).convert('RGB'))
    row = Image.new('RGB', (540, 320))
    for i, im in enumerate(ims):
        row.paste(im.resize((180, 320)), (i * 180, 0))
    row.save(ROOT + 'review/row_%s.png' % sid)
    rows.append(row)
per = (len(rows) + 2) // 3
for k in range(3):
    part = rows[k * per:(k + 1) * per]
    if not part: continue
    cols = 5
    sheet = Image.new('RGB', (540 * cols, 320 * ((len(part) + cols - 1) // cols)), (20, 20, 20))
    for i, r in enumerate(part):
        sheet.paste(r, ((i % cols) * 540, (i // cols) * 320))
    sheet.save(ROOT + 'review/sheet_%d.jpg' % (k + 1), quality=85)
print('frames in', OUT)
