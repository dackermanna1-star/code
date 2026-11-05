"""Assemble rendered shots -> final 1080x1920 30fps MP4 with captions, overlays and the mixed soundtrack.
   python3 assemble.py [--draft]   (draft fills missing frames with the nearest rendered frame / black)"""
import json, os, sys, subprocess, shutil
R = '/home/user/code/amazon_short/'
TL = json.load(open(R + 'scripts/timeline.json'))
draft = '--draft' in sys.argv
seq = R + 'renders/seq/'
shutil.rmtree(seq, ignore_errors=True); os.makedirs(seq)
black = R + 'renders/black.png'
if not os.path.exists(black):
    from PIL import Image; Image.new('RGB', (540, 960), (0, 0, 0)).save(black)
g = 0; missing = 0
for sh in TL['shots']:
    d = f"{R}renders/shots/{sh['id']}/"
    last = None
    for f in range(1, sh['frames'] + 1):
        p = f'{d}f_{f:04d}.png'
        ok = os.path.exists(p) and os.path.getsize(p) > 1000
        if not ok:
            missing += 1
            if not draft: raise SystemExit(f'missing {p}')
            p = last or black
        last = p
        g += 1
        from PIL import Image
        with Image.open(p) as im:
            if im.size != (540, 960):
                im.convert('RGB').resize((540, 960), Image.LANCZOS).save(f'{seq}{g:05d}.png'); continue
        os.symlink(p, f'{seq}{g:05d}.png')
print('frames', g, 'missing', missing)
ov = json.load(open(R + 'renders/overlays/overlays.json'))
inputs = ['-framerate', '30', '-i', seq + '%05d.png', '-i', R + 'audio/mix/final_mix.wav']
fc = ['[0:v]scale=1080:1920:flags=lanczos,unsharp=5:5:0.45:5:5:0.0,noise=alls=3:allf=t,format=yuv420p[v0]']
cur = 'v0'
for i, o in enumerate(ov):
    dur = o['t1'] - o['t0']
    inputs += ['-loop', '1', '-t', f'{dur:.3f}', '-i', o['file']]
    k = i + 2
    fc.append(f"[{k}:v]format=rgba,fade=in:st=0:d=0.25:alpha=1,fade=out:st={max(0, dur - 0.3):.3f}:d=0.3:alpha=1,setpts=PTS+{o['t0']:.3f}/TB[o{i}]")
    fc.append(f"[{cur}][o{i}]overlay=0:0:eof_action=pass:enable='between(t,{o['t0']:.3f},{o['t1']:.3f})'[v{i + 1}]")
    cur = f'v{i + 1}'
fc.append(f"[{cur}]ass={R}renders/captions.ass:fontsdir=/usr/share/fonts/opentype/inter[vout]")
out = R + ('renders/draft.mp4' if draft else 'output/What_If_Lost_In_The_Amazon.mp4')
os.makedirs(os.path.dirname(out), exist_ok=True)
cmd = ['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(fc), '-map', '[vout]', '-map', '1:a',
       '-c:v', 'libx264', '-preset', 'slow' if not draft else 'veryfast', *(['-b:v', '5600k', '-maxrate', '8000k', '-bufsize', '12000k'] if not draft else ['-crf', '26']), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
       '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f"{TL['total']:.3f}", out]
subprocess.run(cmd, check=True)
print('wrote', out)
