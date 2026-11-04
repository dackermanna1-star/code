# Usage: blender -b -P build_char.py -- config.json out.blend
import bpy, sys, json, os
argv = sys.argv[sys.argv.index('--')+1:]
cfg = json.load(open(argv[0])); out = argv[1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
info = HumanService._create_default_human_info_dict()
info.update({
 "name": cfg["name"], "rig": cfg.get("rig","default_no_toes"),
 "eyes": "high-poly/high-poly.mhclo", "eyebrows": cfg.get("eyebrows","eyebrow001/eyebrow001.mhclo"),
 "eyelashes": "eyelashes01/eyelashes01.mhclo", "teeth":"teeth_base/teeth_base.mhclo", "tongue":"",
 "hair": cfg.get("hair",""), "proxy": "", "clothes": cfg.get("clothes",[]),
 "skin_mhmat": cfg.get("skin","middleage_caucasian_male/middleage_caucasian_male.mhmat"),
 "skin_material_type": cfg.get("skin_type","ENHANCED_SSS"),
 "eyes_material_type": "PROCEDURAL_EYES",
 "targets": cfg.get("targets",[]),
})
ph = info["phenotype"]; ph.update(cfg.get("phenotype",{}))
st = HumanService.get_default_deserialization_settings()
st["subdiv_levels"] = cfg.get("subdiv",1)
basemesh = HumanService.deserialize_from_dict(info, st)
if cfg.get("faceunits", False):
    FaceService.load_targets(basemesh, load_microsoft_visemes=False, load_arkit_faceunits=True)
    try: FaceService.interpolate_targets(basemesh)
    except Exception as e: print("INTERP FAIL", e)
print("OBJECTS:", [(o.name,o.type,len(o.data.vertices) if o.type=='MESH' else 0) for o in bpy.data.objects])
rig = [o for o in bpy.data.objects if o.type=='ARMATURE'][0]
print("BONES:", [b.name for b in rig.data.bones])
if basemesh.data.shape_keys: print("SHAPEKEYS:", [k.name for k in basemesh.data.shape_keys.key_blocks][:200])
sys.path.insert(0,'/opt/work/scripts'); import charstyle as cs
sty=cfg.get('style',{})
def find(part):
    for o in bpy.data.objects:
        if o.type=='MESH' and part in o.name: return o
body=find('.body')
if 'skin' in sty: cs.skin_tone(body, tuple(sty['skin'][:3]), sty['skin'][3])
if 'eyes' in sty: cs.eye_color(find('high-poly'), tuple(sty['eyes']), tuple(c*0.35 for c in sty['eyes']))
for part,col in sty.get('recolor',{}).items(): cs.recolor(find(part), tuple(col[:3]), *col[3:])
for part in sty.get('hair_dark',[]): cs.hair_material(find(part), tuple(sty.get('hair_color',(0.025,0.018,0.014))))
if sty.get('recede') and cfg.get('hair'): cs.recede_hair(find(cfg['hair'].split('/')[0]), body)
for o in bpy.data.objects:
    if o.type=='MESH':
        for m in o.modifiers:
            if m.type=='SUBSURF': m.levels=0; m.render_levels=cfg.get('subdiv',1)
bpy.ops.wm.save_as_mainfile(filepath=out)
