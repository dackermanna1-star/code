"""Character builder: MPFB2 (MakeHuman, CC0 assets) humans with cmu_mb rig, ARKit face units,
period clothing recolours, hand-modelled 1940s accessories (field cap, gaiters, bandages, swaddled baby).
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
import ylib as Y

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
from bl_ext.user_default.mpfb.services.objectservice import ObjectService

D = "/root/.config/blender/4.5/extensions/.user/user_default/mpfb/data"


def _a(kind, name):
    return f"{D}/{kind}/{name}/{name}.{'mhmat' if kind == 'skins' else 'mhclo'}"


CAST = {
    # Tsutomu Yamaguchi, 29 in 1945. Slim build, average Japanese male height of the era (~1.60 m).
    "Yamaguchi": dict(gender=1.0, age=0.56, muscle=0.48, weight=0.42, height=0.47, proportions=0.6,
                      race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                      skin="young_asian_male", hair="short02", brows="eyebrow010", clothes=["male_casualsuit05", "shoes04"],
                      colors={"jacket": (0.31, 0.27, 0.17), "pants": (0.28, 0.25, 0.16), "shirt": (0.75, 0.72, 0.62)},
                      hair_color=(0.018, 0.016, 0.014), targets={}),
    "YamaguchiOld": dict(gender=1.0, age=0.97, muscle=0.35, weight=0.45, height=0.3, proportions=0.55,
                         race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                         skin="old_asian_male", hair="short01", brows="eyebrow010", clothes=["male_elegantsuit01", "shoes04"],
                         colors={"jacket": (0.06, 0.06, 0.07), "pants": (0.06, 0.06, 0.07), "shirt": (0.85, 0.85, 0.82)},
                         hair_color=(0.55, 0.55, 0.55), targets={}),
    "YamaguchiMid": dict(gender=1.0, age=0.7, muscle=0.45, weight=0.46, height=0.47, proportions=0.6,
                         race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                         skin="middleage_asian_male", hair="short02", brows="eyebrow010", clothes=["male_casualsuit03", "shoes04"],
                         colors={"jacket": (0.75, 0.73, 0.66), "pants": (0.2, 0.19, 0.17), "shirt": (0.75, 0.73, 0.66)},
                         hair_color=(0.07, 0.065, 0.06), targets={}),
    "Wife": dict(gender=0.0, age=0.48, muscle=0.4, weight=0.45, height=0.3, proportions=0.6,
                 race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                 skin="young_asian_female", hair="ponytail01", brows="eyebrow006", clothes=["female_casualsuit01", "shoes04"],
                 colors={"jacket": (0.62, 0.58, 0.5), "pants": (0.07, 0.09, 0.16), "shirt": (0.62, 0.58, 0.5)},
                 hair_color=(0.03, 0.025, 0.02), targets={}),
    "Supervisor": dict(gender=1.0, age=0.72, muscle=0.45, weight=0.62, height=0.4, proportions=0.5,
                       race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                       skin="middleage_asian_male", hair="short04", brows="eyebrow003", clothes=["male_casualsuit05", "shoes04"],
                       colors={"jacket": (0.24, 0.22, 0.15), "pants": (0.22, 0.2, 0.14), "shirt": (0.8, 0.78, 0.7)},
                       hair_color=(0.06, 0.055, 0.05), targets={}),
    "ColleagueA": dict(gender=1.0, age=0.52, muscle=0.5, weight=0.5, height=0.42, proportions=0.5,
                       race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                       skin="young_asian_male", hair="short04", brows="eyebrow002", clothes=["male_casualsuit03", "shoes04"],
                       colors={"jacket": (0.7, 0.68, 0.6), "pants": (0.26, 0.23, 0.15), "shirt": (0.7, 0.68, 0.6)},
                       hair_color=(0.03, 0.03, 0.03), targets={}),
    "ColleagueB": dict(gender=1.0, age=0.6, muscle=0.45, weight=0.38, height=0.38, proportions=0.5,
                       race={"asian": 1.0, "caucasian": 0.0, "african": 0.0},
                       skin="young_asian_male", hair="short01", brows="eyebrow005", clothes=["male_casualsuit05", "shoes04"],
                       colors={"jacket": (0.3, 0.28, 0.2), "pants": (0.25, 0.23, 0.15), "shirt": (0.7, 0.68, 0.6)},
                       hair_color=(0.03, 0.03, 0.03), targets={}),
}


def _recolor(obj, colors, hair_color=None):
    """Push clothing textures towards period fabrics (khaki wool / cotton) with a multiply tint + desaturation."""
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            # MPFB "MAKESKIN" uses a group; find its color input
            continue
        lk = bsdf.inputs["Base Color"].links
        src = lk[0].from_socket if lk else None
        nm = obj.name.lower()
        if hair_color is not None:
            col = hair_color
        elif "shoe" in nm:
            col = (0.08, 0.06, 0.05)
        elif "jacket" in nm or "suit" in nm:
            col = colors.get("jacket")
        else:
            col = colors.get("jacket")
        if col is None:
            continue
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = 0.0
        hsv.inputs["Value"].default_value = 1.6
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = 'RGBA'
        light = hair_color is not None and sum(col) / 3 > 0.3
        mix.blend_type = 'MIX' if light else 'MULTIPLY'
        mix.inputs["Factor"].default_value = 0.8 if light else 1.0
        mix.inputs[7].default_value = (*col, 1)
        if src:
            nt.links.new(src, hsv.inputs["Color"])
            nt.links.new(hsv.outputs["Color"], mix.inputs[6])
        else:
            mix.inputs[6].default_value = (1, 1, 1, 1)
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.85


def build(name, key=None, collection=None, faceunits=True):
    """Create a full character. Returns dict with 'rig', 'body', 'parts'."""
    spec = CAST[key or name]
    info = HumanService._create_default_human_info_dict()
    info["name"] = name
    info["phenotype"] = {k: spec[k] for k in ("gender", "age", "muscle", "weight", "proportions", "height")}
    info["phenotype"].update({"cupsize": 0.5, "firmness": 0.5, "race": spec["race"]})
    info["rig"] = "cmu_mb"
    info["eyes"] = "high-poly/high-poly.mhclo"
    info["eyebrows"] = f"{spec['brows']}/{spec['brows']}.mhclo"
    info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
    info["teeth"] = "teeth_base/teeth_base.mhclo"
    info["tongue"] = "tongue01/tongue01.mhclo" if os.path.exists(f"{D}/tongue/tongue01") else ""
    info["hair"] = f"{spec['hair']}/{spec['hair']}.mhclo"
    info["clothes"] = [f"{c}/{c}.mhclo" for c in spec["clothes"]]
    info["skin_mhmat"] = f"{spec['skin']}/{spec['skin']}.mhmat"
    info["skin_material_type"] = "ENHANCED_SSS"
    info["eyes_material_type"] = "PROCEDURAL_EYES"
    info["targets"] = []
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    before = set(bpy.data.objects)
    body = HumanService.deserialize_from_dict(info, settings)
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == 'ARMATURE')
    body = next(o for o in new if o.type == 'MESH' and o.name.endswith(".body")) if any(o.name.endswith(".body") for o in new) else body
    if faceunits:
        try:
            FaceService.load_targets(body, load_microsoft_visemes=True, load_arkit_faceunits=True)
        except Exception as e:
            print("faceunits failed", e)
    for o in new:
        if o.type == 'MESH' and o is not body:
            low = o.name.lower()
            if any(k in low for k in ("suit", "shoe", "worksuit")):
                _recolor(o, spec["colors"])
            elif any(k in low for k in ("short", "ponytail", "bob", "hair")) and spec.get("hair_color"):
                _recolor(o, spec["colors"], hair_color=spec["hair_color"])
    for o in new:
        for slot in getattr(o, "material_slots", []):
            m = slot.material
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == 'GROUP' and "IrisMajorColor" in n.inputs:
                    n.inputs["IrisMajorColor"].default_value = (0.055, 0.028, 0.012, 1)
                    n.inputs["IrisMinorColor"].default_value = (0.02, 0.01, 0.005, 1)
                    n.inputs["IrisSection4Color"].default_value = (0.008, 0.005, 0.003, 1)
                    n.inputs["EyeWhiteColor"].default_value = (0.92, 0.88, 0.84, 1)
                if n.type == 'GROUP' and "colorMixIn" in n.inputs:
                    n.inputs["colorMixIn"].default_value = (0.85, 0.55, 0.35, 1)
                    n.inputs["colorMixInStrength"].default_value = spec.get("tan", 0.18)
    # subtle skin tweaks: subdivision on body for close-ups
    sd = body.modifiers.new("Subsurf", 'SUBSURF')
    sd.levels = 0
    sd.render_levels = 1
    if collection:
        for o in new:
            Y.link_to(o, collection)
    rig["char"] = name
    return {"rig": rig, "body": body, "parts": new}


# --------------------------------------------------------------- accessories
def bone_parent(obj, rig, bone):
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    pb = rig.pose.bones[bone]
    obj.matrix_parent_inverse = (rig.matrix_world @ Matrix.Translation(pb.tail - pb.head) @ pb.matrix).inverted() if False else (rig.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.length, 0))).inverted()


def eval_coords(body):
    """Vertex coordinates with shape keys (MPFB macro targets) applied, index-aligned, modifiers off."""
    states = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in states:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    for m, st in states:
        m.show_viewport = st
    bpy.context.evaluated_depsgraph_get().update()
    return co


class _V:
    __slots__ = ("index", "co")
    def __init__(self, i, c):
        self.index, self.co = i, c


def body_verts(body):
    gi = body.vertex_groups["body"].index
    co = eval_coords(body)
    out = []
    for v in body.data.vertices:
        for g in v.groups:
            if g.group == gi and g.weight > 0.5:
                out.append(_V(v.index, co[v.index]))
                break
    return out


def head_top(rig):
    pb = rig.pose.bones["Head"]
    return rig.matrix_world @ pb.tail, rig.matrix_world @ pb.head


def field_cap(name, rig, body, color=(0.12, 0.105, 0.065)):
    """Senjin-bo style civilian field cap: soft crown + short visor, parented to the head bone."""
    tail, head = head_top(rig)
    # measure head width from mesh near the head
    bv = body_verts(body)
    top = max((body.matrix_world @ v.co).z for v in bv)
    hv = [body.matrix_world @ v.co for v in bv if (body.matrix_world @ v.co).z > top - 0.12]
    cx = sum(p.x for p in hv) / len(hv); cy = sum(p.y for p in hv) / len(hv)
    head = Vector((cx, cy, top))
    mat = Y.mat_basic("M_Cap_" + name, (*color, 1), rough=0.9)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    crown = bpy.context.active_object
    crown.name = name + "_CapCrown"
    bm = bmesh.new(); bm.from_mesh(crown.data)
    for v in [v for v in bm.verts if v.co.z < -0.05]:
        bm.verts.remove(v)
    bm.to_mesh(crown.data); bm.free()
    hw = 0.086
    crown.scale = (hw * 1.0, hw * 1.12, 0.07)
    crown.location = (head.x, head.y + 0.005, top - 0.06)
    Y.assign(crown, mat); Y.smooth(crown)
    sol = crown.modifiers.new("solid", 'SOLIDIFY'); sol.thickness = 0.06
    band = Y.cyl(name + "_CapBand", hw * 1.02, 0.035, (head.x, head.y + 0.005, top - 0.06), mat=mat, verts=32)
    band.scale = (1, 1.1, 1)
    visor = Y.box(name + "_CapVisor", (0.12, 0.055, 0.006), (head.x, head.y - hw * 1.12 - 0.018, top - 0.073), (math.radians(-14), 0, 0), mat=mat, bevel=0.004)
    bpy.context.view_layer.update()
    pb = rig.pose.bones["Head"]
    pmat = rig.matrix_world @ rig.data.bones["Head"].matrix_local @ Matrix.Translation((0, rig.data.bones["Head"].length, 0))
    for o in (crown, band, visor):
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy()
        o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = "Head"
        o.matrix_parent_inverse = pmat.inverted()
        o.matrix_basis = mw
        Y.link_to(o, rig.users_collection[0])
    return [crown, band, visor]


def gaiters(name, rig, body, color=(0.3, 0.27, 0.18)):
    """Wrapped puttee-style gaiters (geitoru): deformed copies of the shin region."""
    return _shell(name + "_Gaiters", body, rig, groups=("LeftLeg", "RightLeg"), offset=0.008,
                  zmin=0.12, zmax=0.42, mat=Y.mat_basic("M_Gaiter_" + name, (*color, 1), rough=0.95), stripes=True)


def bandages(name, rig, body):
    """Gauze bandages on head and left arm (Yamaguchi's documented burns were on the upper left side)."""
    gauze = bpy.data.materials.get("M_Gauze")
    if not gauze:
        gauze = Y.mat_basic("M_Gauze", (0.86, 0.84, 0.78, 1), rough=0.95, sss=0.1)
        nt = gauze.node_tree
        b = nt.nodes["Principled BSDF"]
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wv = nt.nodes.new("ShaderNodeTexWave")
        wv.inputs["Scale"].default_value = 40
        wv.inputs["Distortion"].default_value = 2
        wv.bands_direction = 'Z'
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].color = (0.62, 0.6, 0.54, 1)
        cr.color_ramp.elements[1].color = (0.9, 0.88, 0.82, 1)
        nt.links.new(wv.outputs["Fac"], cr.inputs["Fac"])
        nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
        bu = nt.nodes.new("ShaderNodeBump")
        bu.inputs["Strength"].default_value = 0.3
        nt.links.new(wv.outputs["Fac"], bu.inputs["Height"])
        nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
    # band over the scalp and forehead (above the brows) plus a dressing over the left ear/cheek.
    # Eyes, nose and mouth stay uncovered.
    head = _shell(name + "_BandageHead", body, rig, groups=("Head",), offset=0.016, zmin=None, zmax=None, mat=gauze,
                  keep=lambda co, top: co.z > top - 0.075 or (co.x > 0.05 and top - 0.17 < co.z) or (co.y > 0.02 and co.z > top - 0.16))
    for o in rig.children:
        if o.type == 'MESH' and any(k in o.name.lower() for k in ("short0", "hair", "ponytail", "bob")):
            o.hide_render = True
            o.hide_viewport = True
    arm = _shell(name + "_BandageArm", body, rig, groups=("LeftForeArm", "LeftArm"), offset=0.01, zmin=None, zmax=None, mat=gauze)
    return [head, arm]


def _shell(name, body, rig, groups, offset, zmin, zmax, mat, keep=None, stripes=False):
    """Duplicate part of the body mesh, inflate it, keep armature deformation (shares vertex groups)."""
    co = eval_coords(body)
    me = body.data.copy()
    if me.shape_keys:
        tmp = bpy.data.objects.new("_tmp", me)
        bpy.context.scene.collection.objects.link(tmp)
        tmp.shape_key_clear()
        bpy.data.objects.remove(tmp)
    for v in me.vertices:
        v.co = co[v.index]
    o = bpy.data.objects.new(name, me)
    body.users_collection[0].objects.link(o)
    o.matrix_world = body.matrix_world
    gi = [body.vertex_groups[g].index for g in groups if g in body.vertex_groups]
    bgi = body.vertex_groups["body"].index
    top = max(v.co.z for v in body_verts(body))
    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.active
    kill = []
    for v in bm.verts:
        w = sum(v[dl].get(i, 0) for i in gi) if dl else 0
        ok = w > 0.5 and v[dl].get(bgi, 0) > 0.5
        if ok and zmin is not None and not (zmin < v.co.z < zmax):
            ok = False
        if ok and keep is not None and not keep(v.co, top):
            ok = False
        if not ok:
            kill.append(v)
    # keep only body (not helper) geometry
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for v in bm.verts:
        v.co += v.normal * offset
    bm.to_mesh(me); bm.free()
    for md in list(o.modifiers):
        o.modifiers.remove(md)
    for k in list(me.shape_keys.key_blocks) if me.shape_keys else []:
        pass
    if me.shape_keys:
        o.shape_key_clear()
    o.data.materials.clear()
    o.data.materials.append(mat)
    arm = o.modifiers.new("Armature", 'ARMATURE')
    arm.object = rig
    sol = o.modifiers.new("Solid", 'SOLIDIFY'); sol.thickness = 0.004
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    Y.smooth(o)
    return o


def burn_tint(body, strength=0.55):
    """Respectful, non-graphic burn redness on the left side of face/arm/hand via an object-space mask."""
    for slot in body.material_slots:
        m = slot.material
        if not m or "skin" not in m.name.lower() and "body" not in m.name.lower():
            continue
        m = m.copy(); slot.material = m
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        src = out.inputs["Surface"].links[0].from_socket
        burn = nt.nodes.new("ShaderNodeBsdfPrincipled")
        burn.inputs["Base Color"].default_value = (0.42, 0.1, 0.07, 1)
        burn.inputs["Roughness"].default_value = 0.35
        burn.inputs["Subsurface Weight"].default_value = 0.2
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.0
        mr.inputs["From Max"].default_value = 0.06
        nt.links.new(sep.outputs["X"], mr.inputs["Value"])
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 30
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        mm = nt.nodes.new("ShaderNodeMath"); mm.operation = 'MULTIPLY'
        nt.links.new(mr.outputs["Result"], mm.inputs[0]); nt.links.new(nz.outputs["Fac"], mm.inputs[1])
        mm2 = nt.nodes.new("ShaderNodeMath"); mm2.operation = 'MULTIPLY'; mm2.inputs[1].default_value = strength * 1.6
        nt.links.new(mm.outputs[0], mm2.inputs[0])
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(mm2.outputs[0], mix.inputs[0])
        nt.links.new(src, mix.inputs[1]); nt.links.new(burn.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])


def kasuri(name, base=(0.05, 0.07, 0.16), dot=(0.75, 0.72, 0.65), scale=60):
    """Indigo kasuri-style cloth: small irregular light marks on indigo."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = Y.mat_basic(name, (*base, 1), rough=0.95)
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = scale
    nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (*dot, 1)
    cr.color_ramp.elements[1].position = 0.12; cr.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(vo.outputs["Distance"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], b.inputs["Base Color"])
    return m


def period_dress_woman(name, rig, body, parts):
    """1940s wartime women's wear: wrap top (kasuri) and baggy monpe trousers, as shells over the body."""
    top_groups = ("Spine", "Spine1", "LowerBack", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm")
    top = _shell(name + "_WrapTop", body, rig, groups=top_groups, offset=0.022, zmin=None, zmax=None,
                 mat=kasuri("M_KasuriTop", base=(0.16, 0.17, 0.22), dot=(0.6, 0.58, 0.52), scale=45))
    pants = _shell(name + "_Monpe", body, rig, groups=("Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LHipJoint", "RHipJoint"),
                   offset=0.035, zmin=None, zmax=None, mat=kasuri("M_KasuriMonpe"))
    for o in parts:
        if o.type == 'MESH' and any(k in o.name.lower() for k in ("casualsuit", "shoes")):
            o.hide_render = True; o.hide_viewport = True
    return [top, pants]


def baby(name, c, skin_src=None):
    """Swaddled infant (Katsutoshi, a few months old): wrapped bundle with a small face."""
    cloth = kasuri("M_Swaddle", base=(0.42, 0.3, 0.22), dot=(0.5, 0.38, 0.28), scale=20)
    skin = Y.mat_basic("M_BabySkin", (0.8, 0.6, 0.5, 1), rough=0.5, sss=0.3)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1)
    b = bpy.context.active_object; b.name = name + "_Bundle"; b.scale = (0.11, 0.09, 0.2)
    Y.assign(b, cloth); Y.smooth(b)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.055, location=(0, -0.03, 0.17))
    h = bpy.context.active_object; h.name = name + "_Head"; Y.assign(h, skin); Y.smooth(h)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.068, location=(0, 0.01, 0.18))
    hood = bpy.context.active_object; hood.name = name + "_Hood"; hood.scale = (1.05, 1.0, 1.05); Y.assign(hood, cloth)
    bm = bmesh.new(); bm.from_mesh(hood.data)
    for v in [v for v in bm.verts if v.co.y < -0.035]:
        bm.verts.remove(v)
    bm.to_mesh(hood.data); bm.free(); Y.smooth(hood)
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    for o in (b, h, hood):
        Y.link_to(o, c); o.parent = root
    return root
