import bpy, sys, json, os
sys.path.insert(0,'/opt/work/scripts')
argv=sys.argv[sys.argv.index('--')+1:]
g=argv[0]
import shots, shotkit, rset
ctx=shotkit.Ctx()
s=bpy.context.scene
getattr(shots, g)(ctx)
f0=min(c[1] for c in ctx.cams); f1=max(c[2] for c in ctx.cams)
s.frame_start=f0; s.frame_end=f1
rset.eevee(s, samples=int(os.environ.get('SAMPLES','4')), res=(1080,1920), pct=int(os.environ.get('PCT','67')))
for o in bpy.data.objects:
    if o.type=='LIGHT' and o.name.startswith('CeilArea'): o.data.use_shadow=False
s.render.filepath='/opt/work/frames/f_'
s.render.image_settings.file_format='PNG'; s.render.image_settings.color_mode='RGB'
s['group']=g
json.dump({'sfx':shotkit.SFX_CUES,'overlays':shotkit.OVERLAYS,'cams':[(n,a,b) for n,a,b,_ in ctx.cams]}, open(f'/opt/work/groups/{g}.json','w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f'/opt/work/groups/{g}.blend')
print('BUILT',g,f0,f1)
