"""Assemble the final 1080x1920 30fps MP4 from rendered shot frames + mix + captions.
python3 assemble.py [--draft]   (--draft fills missing frames with the nearest rendered frame / black)"""
import json, os, sys, subprocess, shutil
R = '/home/user/code/render/final/'
OUT = '/home/user/code/output/'
SEQ = '/tmp/claude-0/-home-user-code/73c477af-b034-5106-8934-46dafc95cd58/scratchpad/seq/'
shots = json.load(open('/home/user/code/story/shots.json'))['shots']
draft = '--draft' in sys.argv
shutil.rmtree(SEQ, ignore_errors=True); os.makedirs(SEQ); os.makedirs(OUT, exist_ok=True)
i = 0; missing = {}
black = SEQ + '_black.png'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=576x1024', '-frames:v', '1', black], check=True)
for sid, t0, t1, *_ in shots:
    n = int(round((t1 - t0) * 30))
    last = None
    for f in range(1, n + 1):
        p = R + '%s/%04d.png' % (sid, f)
        if os.path.exists(p): last = p
        else:
            missing[sid] = missing.get(sid, 0) + 1
            if not draft: continue
            p = last or black
        i += 1
        os.symlink(p, SEQ + '%05d.png' % i)
print('frames linked', i, 'missing', missing)
if missing and not draft:
    sys.exit('missing frames - render not finished (use --draft for a preview cut)')
total = i
name = 'stranded_draft.mp4' if draft else 'Stranded_What_Happens_If_You_Are_Stranded_In_The_Ocean_1080x1920.mp4'
vf = ("scale=1080:1920:flags=lanczos,unsharp=5:5:0.45:5:5:0.0,"
      "eq=contrast=1.03:saturation=1.04,noise=alls=3:allf=t,"
      "fade=t=out:st=%.3f:d=1.0,"
      "subtitles=/home/user/code/story/captions.ass:fontsdir=/usr/share/fonts/opentype/inter,format=yuv420p" % (total / 30 - 1.0))
cmd = ['ffmpeg', '-v', 'error', '-stats', '-y', '-framerate', '30', '-i', SEQ + '%05d.png', '-i', '/home/user/code/audio/mix/stranded_mix.wav',
       '-vf', vf, '-c:v', 'libx264', '-preset', 'slow' if not draft else 'veryfast', '-crf', '17' if not draft else '23',
       '-profile:v', 'high', '-level', '4.2', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
       '-shortest', '-movflags', '+faststart', OUT + name]
subprocess.run(cmd, check=True)
print('wrote', OUT + name)
