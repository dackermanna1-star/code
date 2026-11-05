"""Assemble the final 1080x1920 30fps MP4 from rendered shot frames + mix + captions.
Each shot is upscaled and colour-matched into an intermediate clip, then all clips are concatenated,
captions burned in, and the soundtrack muxed.
python3 assemble.py [--draft]   (--draft fills missing frames with the nearest rendered frame / black)"""
import json, os, sys, subprocess, shutil
R = '/home/user/code/render/final/'
OUT = '/home/user/code/output/'
TMP = '/tmp/claude-0/-home-user-code/73c477af-b034-5106-8934-46dafc95cd58/scratchpad/assemble/'
shots = json.load(open('/home/user/code/story/shots.json'))['shots']
draft = '--draft' in sys.argv
os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
# per-shot colour corrections (warm-light close-ups read too orange on skin; matched toward neighbours)
GRADE = {
    'SH12': 'colorbalance=rm=-0.05:bm=0.03,eq=saturation=0.88',
    'SH13': 'colorbalance=rm=-0.05:bm=0.03,eq=saturation=0.9',
    'SH17': 'colorbalance=rm=-0.05:bm=0.03,eq=saturation=0.9',
    'SH24': 'colorbalance=rm=-0.06:bm=0.03,eq=saturation=0.86',
    'SH25': 'eq=saturation=0.95',
}
black = TMP + '_black.png'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=576x1024', '-frames:v', '1', black], check=True)
clips = []; missing = {}
for sid, t0, t1, *_ in shots:
    n = int(round((t1 - t0) * 30))
    seq = TMP + sid + '/'; shutil.rmtree(seq, ignore_errors=True); os.makedirs(seq)
    last = None; cnt = 0
    for f in range(1, n + 1):
        p = R + '%s/%04d.png' % (sid, f)
        if os.path.exists(p): last = p
        else:
            missing[sid] = missing.get(sid, 0) + 1
            p = last or black
        cnt += 1; os.symlink(p, seq + '%04d.png' % cnt)
    if missing.get(sid) and not draft:
        continue
    vf = 'scale=1080:1920:flags=lanczos,unsharp=5:5:0.45:5:5:0.0'
    if sid in GRADE: vf += ',' + GRADE[sid]
    clip = TMP + sid + '.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', seq + '%04d.png', '-vf', vf + ',format=yuv444p',
                    '-c:v', 'libx264', '-preset', 'veryfast' if draft else 'medium', '-qp', '0' if not draft else '12',
                    '-frames:v', str(n), clip], check=True)
    clips.append(clip)
print('missing frames:', missing)
if missing and not draft:
    sys.exit('render not finished (use --draft for a preview cut)')
lst = TMP + 'clips.txt'
open(lst, 'w').write(''.join("file '%s'\n" % c for c in clips))
total = sum(int(round((t1 - t0) * 30)) for _, t0, t1, *_ in shots)
name = 'stranded_draft.mp4' if draft else 'Stranded_What_Happens_If_You_Are_Stranded_In_The_Ocean_1080x1920.mp4'
vf = ("eq=contrast=1.03:saturation=1.04,noise=alls=3:allf=t,fade=t=out:st=%.3f:d=1.0,"
      "subtitles=/home/user/code/story/captions.ass:fontsdir=/usr/share/fonts/opentype/inter,format=yuv420p" % (total / 30 - 1.0))
cmd = ['ffmpeg', '-v', 'error', '-stats', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', '/home/user/code/audio/mix/stranded_mix.wav',
       '-vf', vf, '-c:v', 'libx264', '-preset', 'slow' if not draft else 'veryfast', '-crf', '17' if not draft else '23',
       '-profile:v', 'high', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
       '-shortest', '-movflags', '+faststart', OUT + name]
subprocess.run(cmd, check=True)
print('wrote', OUT + name, 'frames', total)
