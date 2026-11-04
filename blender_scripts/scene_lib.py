import bpy, os, sys
sys.path.insert(0,'/opt/work/scripts')
from props import coll, link

def load_char(name, alias=None, c_parent=None):
    """Append every object of chars/<name>.blend into a collection CHAR_<alias>. Returns (rig, body, objs)."""
    alias = alias or name
    path = '/opt/work/chars/%s.blend' % name
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    c = coll('CHAR_' + alias, c_parent)
    rig = body = None
    objs = []
    for o in dst.objects:
        if o is None: continue
        c.objects.link(o); objs.append(o)
        if o.type == 'ARMATURE': rig = o
        if o.type == 'MESH' and o.name.split('.')[-1] in ('body',) or (o.type=='MESH' and '.body' in o.name): body = o
    rig.name = alias
    shrink_images(objs, 2048 if name == 'mehran' else 1024)
    from props import decimate_to
    for o in objs:
        if o.type == 'MESH' and '.body' not in o.name:
            decimate_to(o, 9000 if name == 'mehran' else 5000)
    fix_eyes(objs, {'mehran':'brown','Worker':'brown','Pax3':'brown','Pax8':'brown','Reporter3':'brown','Pax4':'brown'}.get(name, ['brownlight','blue','green','grey','bluegreen'][sum(map(ord,name))%5]))
    for o in objs:
        if o is not rig and o.type == 'MESH':
            for m in o.modifiers:
                if m.type == 'ARMATURE': m.object = rig
    return rig, body, objs

def set_visible(objs, f, vis):
    for o in objs:
        o.hide_render = not vis; o.keyframe_insert('hide_render', frame=f)
        o.hide_viewport = not vis; o.keyframe_insert('hide_viewport', frame=f)

_SMALL = '/opt/work/tex_small'
def shrink_images(objs, limit=1024):
    from PIL import Image as PImage
    os.makedirs(_SMALL, exist_ok=True)
    seen = set()
    for o in objs:
        if o.type != 'MESH': continue
        for ms in o.material_slots:
            m = ms.material
            if not m or not m.use_nodes: continue
            nodes = list(m.node_tree.nodes)
            for n in list(nodes):
                if n.type == 'GROUP' and n.node_tree: nodes += list(n.node_tree.nodes)
            for n in nodes:
                if n.type != 'TEX_IMAGE' or n.image is None: continue
                img = n.image
                if img.name in seen: continue
                seen.add(img.name)
                src = bpy.path.abspath(img.filepath)
                if not os.path.exists(src): continue
                try:
                    pim = PImage.open(src)
                except Exception:
                    continue
                if max(pim.size) <= limit: continue
                base = os.path.splitext(os.path.basename(src))[0]
                dst = os.path.join(_SMALL, '%s_%d.png' % (base, limit))
                if not os.path.exists(dst):
                    sc = limit / max(pim.size)
                    pim.resize((max(1, int(pim.size[0] * sc)), max(1, int(pim.size[1] * sc))), PImage.LANCZOS).save(dst)
                cs = img.colorspace_settings.name
                img.filepath = dst; img.reload(); img.colorspace_settings.name = cs

EYE_DIR = '/root/.config/blender/4.5/extensions/.user/user_default/mpfb/data/eyes/materials/'
def fix_eyes(objs, color='brown'):
    for o in objs:
        if o.type != 'MESH' or 'high-poly' not in o.name: continue
        mname = 'EyeTex_' + color
        m = bpy.data.materials.get(mname)
        if m is None:
            m = bpy.data.materials.new(mname); m.use_nodes = True
            nt = m.node_tree; b = nt.nodes['Principled BSDF']
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(EYE_DIR + color + '_eye.png', check_existing=True)
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
            b.inputs['Roughness'].default_value = 0.25; b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.02
            b.inputs['Specular IOR Level'].default_value = 0.6
        o.data.materials.clear(); o.data.materials.append(m)
