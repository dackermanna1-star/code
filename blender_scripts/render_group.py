# blender -b groups/G.blend -P render_group.py -- [stride offset] [frames list or range] [outdir]
import bpy, sys, os
sys.path.insert(0,'/opt/work/scripts')
import board
board.register()
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
s=bpy.context.scene
stride=int(argv[0]) if len(argv)>0 else 1; off=int(argv[1]) if len(argv)>1 else 0
frames=None
if len(argv)>2 and argv[2]!='all':
    frames=[int(x) for x in argv[2].split(',')]
outdir=argv[3] if len(argv)>3 else '/opt/work/frames'
os.makedirs(outdir, exist_ok=True)
if frames is None: frames=list(range(s.frame_start, s.frame_end+1))
frames=[f for i,f in enumerate(frames) if i%stride==off]
import time
for f in frames:
    out=f'{outdir}/f_{f:05d}.png'
    if os.path.exists(out): continue
    s.frame_set(f)
    s.render.filepath=out
    t=time.time(); bpy.ops.render.render(write_still=True); print('FRAME',f,round(time.time()-t,1), flush=True)
