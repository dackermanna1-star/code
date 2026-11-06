"""Render passes for one shot.

blender -b anim.blend --python render_shot.py -- <shot> <pass> <outdir> [quality] [frame_step]
pass:
  plate    : environment only, from a static overscan "plate camera" (one frame per plate variant)
  char     : per-frame character pass (env = holdout, still casts shadows), EXR with alpha,
             shadow-catcher multiplier and mist; rendered inside a border around the actors
  thermal  : per-frame thermal-camera look (emission only, low res)
  camjson  : export per-frame camera rotation/lens for the compositor
"""
import bpy, sys, os, json, math
from mathutils import Vector, Quaternion, Matrix
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:]
SID, PASS, OUT = argv[0].split(",")[0], argv[1], argv[2]
Q = argv[3] if len(argv) > 3 else "final"
STEP = int(argv[4]) if len(argv) > 4 else 1
FR_ONLY = [int(x) for x in argv[5].split(",")] if len(argv) > 5 and argv[5] else None
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
S = json.loads(sc["shots"])[SID]
cam = bpy.data.objects[S["camera"]]
sc.camera = cam
W, H = 1080, 1920
SCALE = {"final": 1.0, "draft": 0.5, "tiny": 0.25}[Q]

CHAR_COLLS = ["CHR_Leo", "CHR_Maya"]
char_objs = set()
for c in CHAR_COLLS:
    char_objs |= set(bpy.data.collections[c].all_objects)
props = set(bpy.data.collections["PROPS"].all_objects)
dyn = set(bpy.data.objects[n] for n in S["dynamic"] if n in bpy.data.objects)
env_objs = [o for o in bpy.data.objects if o.type in ("MESH", "CURVE", "FONT") and o not in char_objs and o not in props
            and not o.users_collection[0].name.startswith("ASSET_LIB")]
active_chars = [bpy.data.objects[n] for n in S["chars"]]


def common_settings():
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_light_tree = False
    sc.render.use_persistent_data = True
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"  # linear EXR out; display transform done in the compositor
    sc.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    sc.render.image_settings.color_depth = "16"
    sc.render.image_settings.exr_codec = "DWAA"
    bpy.context.view_layer.use_pass_mist = True
    sc.world.mist_settings.start = 0.5; sc.world.mist_settings.depth = 16.0; sc.world.mist_settings.falloff = "LINEAR"
    sc.render.use_compositing = False; sc.render.use_sequencer = False
    flat_display_glass(); clear_ice(); crinkle_foil()


def frames():
    fr = list(range(S["f0"], S["f1"] + 1, STEP))
    if FR_ONLY: fr = [f for f in fr if f in FR_ONLY]
    return fr


def rime_hair_frost():
    """Render-time patch for the heavy-frost part of the film (SH18 onwards).
    The build-time frost mask (coarse noise through a hard map range) turns into black-and-white blotches
    once it is strong. Here the mask follows the hair texture's own strands (bright strands rime first),
    broken up by finer noise, so the hair reads as frosted strands with brown still showing between."""
    for nm in ["Leo.short02", "Leo.eyebrow001", "Leo.eyelashes01"]:
        o = bpy.data.objects.get(nm)
        if not o or not o.data.materials: continue
        trees = [o.data.materials[0].node_tree]
        trees += [n.node_tree for n in trees[0].nodes if n.type == "GROUP"]
        for nt in trees:
            N, L = nt.nodes, nt.links
            for mp in [n for n in N if n.type == "MAPPING"]:
                if tuple(mp.inputs["Scale"].default_value) != (9.0, 9.0, 9.0): continue
                mp.inputs["Scale"].default_value = (16, 16, 16)
                sp = mp.outputs[0].links[0].to_node.outputs[0].links[0].to_node
                mul = sp.outputs[2].links[0].to_node
                mr = mul.outputs[0].links[0].to_node
                amt = mul.inputs[1].links[0].from_socket
                tex = next((n for n in N if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.filepath.lower()), None)
                def math(op, a, b, c=None):
                    m = N.new("ShaderNodeMath"); m.operation = op
                    for i, v in enumerate((a, b, c)):
                        if v is None: continue
                        if isinstance(v, (int, float)): m.inputs[i].default_value = v
                        else: L.new(v, m.inputs[i])
                    return m.outputs[0]
                n_part = math("MULTIPLY", sp.outputs[2], 0.35)
                if tex is not None and nm == "Leo.short02":
                    bw = N.new("ShaderNodeRGBToBW"); L.new(tex.outputs["Color"], bw.inputs[0])
                    ln = N.new("ShaderNodeMapRange"); L.new(bw.outputs[0], ln.inputs[0])
                    ln.inputs[1].default_value = 0.016; ln.inputs[2].default_value = 0.092
                    c = math("MULTIPLY_ADD", ln.outputs[0], 0.65, n_part)
                else:
                    c = math("MULTIPLY_ADD", sp.outputs[2], 0.6, 0.2)
                lo = math("MULTIPLY_ADD", amt, -1.1, 1.0)
                hi = math("ADD", lo, 0.45)
                L.new(c, mr.inputs[0]); L.new(lo, mr.inputs[1]); L.new(hi, mr.inputs[2])
                mr.inputs[3].default_value = 0.0; mr.inputs[4].default_value = 0.85
                print("hair frost: rime mask on", nm)


def soften_breath():
    """Render-time patch for M_Breath (used by the breath AND the thermal pass).
    The build-time falloff (spherical gradient on raw object coords) is still ~0.5 on the faces of the unit cube,
    so density/emission are cut off by the cube and the puffs render as boxes. Here the field reaches zero inside
    the cube: spherical gradient on 2.15x object coords, ^1.6 falloff, wider map range."""
    m = bpy.data.materials["M_Breath"]; nt_ = m.node_tree
    nz = [n for n in nt_.nodes if n.type == "TEX_NOISE"][0]
    nz.inputs["Detail"].default_value = 2.0
    gr = [n for n in nt_.nodes if n.type == "TEX_GRADIENT"][0]
    tco = [n for n in nt_.nodes if n.type == "TEX_COORD"][0]
    vm = nt_.nodes.new("ShaderNodeVectorMath"); vm.operation = "SCALE"; vm.inputs["Scale"].default_value = 2.15
    nt_.links.new(tco.outputs["Object"], vm.inputs[0]); nt_.links.new(vm.outputs[0], gr.inputs["Vector"])
    sq = nt_.nodes.new("ShaderNodeMath"); sq.operation = "POWER"; sq.inputs[1].default_value = 1.6
    mul_ = [l.to_node for l in gr.outputs["Fac"].links][0]
    nt_.links.new(gr.outputs["Fac"], sq.inputs[0]); nt_.links.new(sq.outputs[0], mul_.inputs[1])
    mr_ = [n for n in nt_.nodes if n.type == "MAP_RANGE"][0]
    mr_.inputs[1].default_value = 0.05; mr_.inputs[2].default_value = 0.35
    m.cycles.volume_step_rate = 3.0
    return m


def crinkle_foil():
    """Render-time patch for M_FoilBlanket: the build-time bump (Voronoi F1 at 7 cm cells, 1 mm bump distance) was
    almost flat, so the blanket read as smooth molten gold in close-up. Edge-distance Voronoi gives the sharp creases
    of crumpled foil, with a finer noise for small wrinkles; roughness varies a little across the sheet."""
    m = bpy.data.materials.get("M_FoilBlanket")
    if not m: return
    nt = m.node_tree; N, L = nt.nodes, nt.links
    vo = next(n for n in N if n.type == "TEX_VORONOI"); bp = next(n for n in N if n.type == "BUMP")
    bs = next(n for n in N if n.type == "BSDF_PRINCIPLED"); tc = next(n for n in N if n.type == "TEX_COORD")
    vo.feature = "DISTANCE_TO_EDGE"; vo.inputs["Scale"].default_value = 24.0
    # creases hang vertically and are irregular: stretch the cells along Z and wobble them with noise
    wob = N.new("ShaderNodeTexNoise"); wob.inputs["Scale"].default_value = 6.0; wob.inputs["Detail"].default_value = 2.0
    L.new(tc.outputs["Object"], wob.inputs["Vector"])
    wv = N.new("ShaderNodeVectorMath"); wv.operation = "MULTIPLY_ADD"
    L.new(wob.outputs["Color"], wv.inputs[0]); wv.inputs[1].default_value = (0.05, 0.05, 0.05); L.new(tc.outputs["Object"], wv.inputs[2])
    st = N.new("ShaderNodeVectorMath"); st.operation = "MULTIPLY"; st.inputs[1].default_value = (1.0, 1.0, 0.45)
    L.new(wv.outputs[0], st.inputs[0])
    for l in list(vo.inputs["Vector"].links): L.remove(l)
    L.new(st.outputs[0], vo.inputs["Vector"])
    for l in list(bp.inputs["Height"].links): L.remove(l)
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 90.0; nz.inputs["Detail"].default_value = 3.0
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    crease = N.new("ShaderNodeMath"); crease.operation = "POWER"; crease.inputs[1].default_value = 0.5
    L.new(vo.outputs["Distance"], crease.inputs[0])
    h = N.new("ShaderNodeMath"); h.operation = "MULTIPLY_ADD"; h.inputs[2].default_value = 0.0
    L.new(nz.outputs["Fac"], h.inputs[0]); h.inputs[1].default_value = 0.15
    tot = N.new("ShaderNodeMath"); tot.operation = "ADD"; L.new(crease.outputs[0], tot.inputs[0]); L.new(h.outputs[0], tot.inputs[1])
    L.new(tot.outputs[0], bp.inputs["Height"])
    bp.inputs["Strength"].default_value = 0.85; bp.inputs["Distance"].default_value = 0.012
    rr = N.new("ShaderNodeMapRange"); rr.inputs[1].default_value = 0.3; rr.inputs[2].default_value = 0.7
    rr.inputs[3].default_value = 0.14; rr.inputs[4].default_value = 0.3
    L.new(nz.outputs["Fac"], rr.inputs[0]); L.new(rr.outputs[0], bs.inputs["Roughness"])
    bs.inputs["Base Color"].default_value = (0.93, 0.7, 0.32, 1)
    print("foil: crinkled")


def flat_display_glass():
    """TempDisplay_Glass is an unbevelled 8-vertex box that box() shaded smooth, so its front face interpolates the corner
    normals (+-0.577, 0.577, +-0.577): the flat glass shades like a convex mirror (normal tilted ~25 deg at the "2"), and its
    near-grazing reflection picks up the emissive digits 1 mm in front of it -> the shrunken, offset ghost "2"/"0" in SH03."""
    g = bpy.data.objects.get("TempDisplay_Glass")
    if g: g.data.shade_flat()


def clear_ice():
    """Render-time replacement for M_Ice (Release_Ice). The build-time material (85 % rough, bumpy transmission + 15 %
    diffuse + coat) read as grey putty: with refractive caustics off, shadow rays and diffuse bounces cannot pass a
    refractive surface, so the cap/backplate inside were unlit and only the diffuse/coat skin showed.
    Here: smooth, fully transmissive, faintly blue ice; shadow and diffuse rays see a tinted Transparent BSDF instead
    (cap and backplate are lit through it, no caustics needed, no noise); trapped-air bubbles are faked with three
    parallax-offset Voronoi layers (fixed in object space, so they ride with the door), plus a faint frosty veil."""
    m = bpy.data.materials.get("M_Ice")
    if not m: return
    nt = m.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
    for n in [n for n in N if n != out]: N.remove(n)
    def node(t, **inp):
        n = N.new(t)
        for k, v in inp.items(): n.inputs[k].default_value = v
        return n
    tc = N.new("ShaderNodeTexCoord"); geo = N.new("ShaderNodeNewGeometry"); lp = N.new("ShaderNodeLightPath")
    # body: clear, smooth, barely blue (IOR of ice)
    b = node("ShaderNodeBsdfPrincipled", **{"Base Color": (0.74, 0.88, 1.0, 1.0), "IOR": 1.31, "Transmission Weight": 1.0,
                                             "Coat Weight": 0.0, "Specular IOR Level": 0.5})
    # gentle melt ripples (low-frequency, weak) + roughness 0.03..0.10
    nz = node("ShaderNodeTexNoise", Scale=7.0, Detail=2.0, Roughness=0.5); L.new(tc.outputs["Object"], nz.inputs["Vector"])
    bp = node("ShaderNodeBump", Strength=0.08, Distance=0.003); L.new(nz.outputs["Fac"], bp.inputs["Height"])
    L.new(bp.outputs["Normal"], b.inputs["Normal"])
    rr = N.new("ShaderNodeMapRange"); rr.clamp = True
    rr.inputs["From Min"].default_value = 0.3; rr.inputs["From Max"].default_value = 0.7
    rr.inputs["To Min"].default_value = 0.03; rr.inputs["To Max"].default_value = 0.10
    L.new(nz.outputs["Fac"], rr.inputs["Value"]); L.new(rr.outputs["Result"], b.inputs["Roughness"])
    # trapped-air bubbles: Voronoi sampled a little *inside* along the view ray (parallax), in object space
    masks = []
    for depth, scale, rad, keep in [(0.004, 140.0, 0.16, 0.45), (0.014, 90.0, 0.15, 0.5), (0.03, 60.0, 0.12, 0.6)]:
        off = N.new("ShaderNodeVectorMath"); off.operation = "MULTIPLY_ADD"
        L.new(geo.outputs["Incoming"], off.inputs[0]); off.inputs[1].default_value = (-depth, -depth, -depth)
        L.new(geo.outputs["Position"], off.inputs[2])
        vt = N.new("ShaderNodeVectorTransform"); vt.vector_type = "POINT"; vt.convert_from = "WORLD"; vt.convert_to = "OBJECT"
        L.new(off.outputs["Vector"], vt.inputs["Vector"])
        vo = N.new("ShaderNodeTexVoronoi"); vo.voronoi_dimensions = "3D"; vo.feature = "F1"
        vo.inputs["Scale"].default_value = scale; vo.inputs["Randomness"].default_value = 1.0
        L.new(vt.outputs["Vector"], vo.inputs["Vector"])
        dm = N.new("ShaderNodeMapRange"); dm.clamp = True
        dm.inputs["From Min"].default_value = rad * 0.55; dm.inputs["From Max"].default_value = rad
        dm.inputs["To Min"].default_value = 1.0; dm.inputs["To Max"].default_value = 0.0
        L.new(vo.outputs["Distance"], dm.inputs["Value"])
        sp = N.new("ShaderNodeSeparateColor"); L.new(vo.outputs["Color"], sp.inputs["Color"])
        gt = N.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = keep
        L.new(sp.outputs["Red"], gt.inputs[0])
        mk = N.new("ShaderNodeMath"); mk.operation = "MULTIPLY"; L.new(dm.outputs["Result"], mk.inputs[0]); L.new(gt.outputs[0], mk.inputs[1])
        masks.append(mk.outputs[0])
    bm = masks[0]
    for mk in masks[1:]:
        mx_ = N.new("ShaderNodeMath"); mx_.operation = "MAXIMUM"; L.new(bm, mx_.inputs[0]); L.new(mk, mx_.inputs[1]); bm = mx_.outputs[0]
    # frosty veil: whiter where the view grazes the lump (longer path through ice) and in soft patches; the face stays clear
    lw = node("ShaderNodeLayerWeight", Blend=0.35)
    rim = N.new("ShaderNodeMapRange"); rim.clamp = True
    rim.inputs["From Min"].default_value = 0.35; rim.inputs["From Max"].default_value = 0.95
    rim.inputs["To Min"].default_value = 0.3; rim.inputs["To Max"].default_value = 0.8   # frosty rime: reads as ice, not jelly
    L.new(lw.outputs["Facing"], rim.inputs["Value"])
    nz2 = node("ShaderNodeTexNoise", Scale=12.0, Detail=4.0, Roughness=0.55); L.new(tc.outputs["Object"], nz2.inputs["Vector"])
    pt = N.new("ShaderNodeMapRange"); pt.clamp = True
    pt.inputs["From Min"].default_value = 0.45; pt.inputs["From Max"].default_value = 0.68
    pt.inputs["To Min"].default_value = 0.3; pt.inputs["To Max"].default_value = 0.62
    L.new(nz2.outputs["Fac"], pt.inputs["Value"])
    vl = N.new("ShaderNodeMath"); vl.operation = "MAXIMUM"; L.new(rim.outputs["Result"], vl.inputs[0]); L.new(pt.outputs["Result"], vl.inputs[1])
    veil = node("ShaderNodeBsdfDiffuse", Color=(0.84, 0.92, 1.0, 1.0))
    mixv = N.new("ShaderNodeMixShader"); L.new(vl.outputs[0], mixv.inputs[0]); L.new(b.outputs[0], mixv.inputs[1]); L.new(veil.outputs[0], mixv.inputs[2])
    bf = N.new("ShaderNodeMath"); bf.operation = "MULTIPLY"; bf.inputs[1].default_value = 0.8; L.new(bm, bf.inputs[0])
    bub = node("ShaderNodeBsdfDiffuse", Color=(0.95, 0.98, 1.0, 1.0))
    mix1 = N.new("ShaderNodeMixShader"); L.new(bf.outputs[0], mix1.inputs[0]); L.new(mixv.outputs[0], mix1.inputs[1]); L.new(bub.outputs[0], mix1.inputs[2])
    # shadow + diffuse rays: tinted transparency (no refraction) so light reaches the cap/backplate inside
    sd = N.new("ShaderNodeMath"); sd.operation = "MAXIMUM"
    L.new(lp.outputs["Is Shadow Ray"], sd.inputs[0]); L.new(lp.outputs["Is Diffuse Ray"], sd.inputs[1])
    tr = node("ShaderNodeBsdfTransparent", Color=(0.86, 0.94, 1.0, 1.0))
    mix2 = N.new("ShaderNodeMixShader"); L.new(sd.outputs[0], mix2.inputs[0]); L.new(mix1.outputs[0], mix2.inputs[1]); L.new(tr.outputs[0], mix2.inputs[2])
    L.new(mix2.outputs[0], out.inputs["Surface"])
    ice = bpy.data.objects.get("Release_Ice")
    if ice and "ss" not in ice.modifiers:  # the 162-vertex lump showed polygonal facets along its silhouette
        ss = ice.modifiers.new("ss", "SUBSURF"); ss.levels = 0; ss.render_levels = 2
    print("ice: clear material on M_Ice")


def cam_params(f):
    sc.frame_set(f)
    return cam.matrix_world.to_quaternion().copy(), cam.data.lens


# ------------------------------------------------------------------ CAMERA JSON
if PASS == "camjson":
    ALLS = json.loads(sc["shots"])
    for sid in (argv[0].split(",") if "," in argv[0] else [SID]):
        S2 = ALLS[sid]; c2 = bpy.data.objects[S2["camera"]]
        out = {}
        for f in range(S2["f0"], S2["f1"] + 1):
            sc.frame_set(f)
            out[f] = {"q": list(c2.matrix_world.to_quaternion()), "lens": c2.data.lens, "loc": list(c2.matrix_world.to_translation()),
                      "dof": c2.data.dof.use_dof, "door": math.degrees(bpy.data.objects["Door_Pivot"].rotation_euler[2]),
                      "dock": bpy.data.lights["Dock_Warm"].energy, "frost": float(sc.get("frost", 0.3))}
        os.makedirs(f"{OUT}/{sid}", exist_ok=True)
        json.dump(out, open(f"{OUT}/{sid}/{sid}_cam.json", "w"))
        print("CAMJSON", sid)
    sys.exit(0)

# ------------------------------------------------------------------ PLATE
if PASS == "plate":
    common_settings()
    fr = list(range(S["f0"], S["f1"] + 1))
    qs = []; lenses = []
    for f in fr[::2] + [fr[-1]]:
        q, l = cam_params(f); qs.append(q); lenses.append(l)
    # mean orientation
    qm = qs[len(qs) // 2].copy()
    # half extents needed (tangent space) in plate camera
    mx = my = 0.0
    for q, l in zip(qs, lenses):
        h = 12.0 / l; w = h * 9 / 16
        for sx in (-1, 1):
            for sy in (-1, 1):
                d = q @ Vector((sx * w, sy * h, -1.0))
                dp = qm.inverted() @ d
                mx = max(mx, abs(dp.x / -dp.z)); my = max(my, abs(dp.y / -dp.z))
    Hp = max(my, mx * 16 / 9) * 1.04
    lens_p = 12.0 / Hp
    hmin = min(12.0 / l for l in lenses)
    px_h = int(min(2300, max(1920, 1920 * Hp / hmin)) * SCALE) // 2 * 2
    px_w = int(px_h * 9 / 16) // 2 * 2
    pc_d = bpy.data.cameras.new("PlateCam"); pc_d.sensor_fit = "VERTICAL"; pc_d.sensor_height = 24.0
    pc_d.lens = lens_p; pc_d.clip_start = 0.02; pc_d.clip_end = 60
    pc = bpy.data.objects.new("PlateCam", pc_d); sc.collection.objects.link(pc)
    pc.location = cam.matrix_world.to_translation(); pc.rotation_mode = "QUATERNION"; pc.rotation_quaternion = qm
    if cam.data.dof.use_dof:
        lmid = lenses[len(lenses) // 2]
        pc_d.dof.use_dof = True; pc_d.dof.focus_distance = cam.data.dof.focus_distance
        pc_d.dof.aperture_fstop = cam.data.dof.aperture_fstop * lens_p / lmid  # same physical aperture
    sc.camera = pc
    sc.render.resolution_x, sc.render.resolution_y = px_w, px_h
    for o in char_objs | props | dyn:
        if o.animation_data:  # keyed visibility would override the hide below
            for fc in list(o.animation_data.action.fcurves) if o.animation_data.action else []:
                if fc.data_path == "hide_render": o.animation_data.action.fcurves.remove(fc)
        o.hide_render = True
    # glazed ice instead of a mirror-black puddle (the dark glossy version read as a hole in the floor)
    mi = bpy.data.materials.get("M_FloorIce")
    if mi:
        bi = mi.node_tree.nodes["Principled BSDF"]
        bi.inputs["Base Color"].default_value = (0.5, 0.58, 0.66, 1); bi.inputs["Roughness"].default_value = 0.12
        bi.inputs["Coat Weight"].default_value = 0.6; bi.inputs["Coat Roughness"].default_value = 0.05
    # overlapping floor-ice slabs at the same height trap reflected rays between their faces, which rendered as
    # hard-edged black voids where two patches overlap (SH14, SH15, SH16d): stagger their heights by 1.5 mm
    for i, o in enumerate(sorted((o for o in bpy.data.objects if o.name.startswith("FloorIce_")), key=lambda o: o.name)):
        o.location.z = 0.002 + 0.0015 * i
    sc.cycles.samples = {"final": 12, "draft": 6, "tiny": 4}[Q]
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_quality = "HIGH"; sc.cycles.denoising_prefilter = "ACCURATE"
    variants = S["plate_variants"] or [{}]
    fm = (S["f0"] + S["f1"]) // 2
    meta = {"lens": lens_p, "q": list(qm), "w": px_w, "h": px_h, "variants": variants, "loc": list(pc.location)}
    for vi, v in enumerate(variants):
        sc.frame_set(fm)
        if "door" in v:
            piv = bpy.data.objects["Door_Pivot"]
            if piv.animation_data: piv.animation_data.action = None
            piv.rotation_euler[2] = math.radians(v["door"])
            # an animated door is drawn per frame in the char pass; leaving it in the plates as well ghosts the
            # closed door through the doorway while the variants cross-fade, so the variants then only carry
            # the change in dock light
            door_dynamic = bpy.data.objects["Door_Slab"] in dyn
            for n in ["Door_Slab", "Door_Gasket", "Door_KickPlate", "Release_Rod", "Release_Cap", "Release_Backplate",
                      "ReleaseLabel_0", "ReleaseLabel_1", "ReleaseLabel_2", "Release_Ice", "Door_Pivot"]:
                bpy.data.objects[n].hide_render = door_dynamic
        if "dock" in v:
            l = bpy.data.lights["Dock_Warm"]
            if l.animation_data: l.animation_data.action = None
            l.energy = v["dock"]
        if "frost" in v:
            if sc.animation_data and sc.animation_data.action:
                for fc in list(sc.animation_data.action.fcurves):
                    if fc.data_path == '["frost"]': sc.animation_data.action.fcurves.remove(fc)
            sc["frost"] = v["frost"]
        bpy.context.view_layer.update()
        sc.render.filepath = f"{OUT}/{SID}_plate{vi}.exr"
        bpy.ops.render.render(write_still=True)
    json.dump(meta, open(f"{OUT}/{SID}_plate.json", "w"))
    print("PLATE", SID, px_w, px_h, lens_p)
    sys.exit(0)

# ------------------------------------------------------------------ CHARACTER PASS
if PASS == "char":
    common_settings()
    sc.render.film_transparent = True
    bpy.context.view_layer.cycles.use_pass_shadow_catcher = True
    if S["f0"] >= json.loads(sc["shots"])["SH18"]["f0"]: rime_hair_frost()  # heavy rime from SH18 (below ~32 C) on
    sc.render.resolution_x, sc.render.resolution_y = int(W * 0.7 * SCALE) // 2 * 2, int(H * 0.7 * SCALE) // 2 * 2
    sc.cycles.samples = {"final": 5, "draft": 3, "tiny": 2}[Q]
    sc.cycles.adaptive_threshold = 0.07
    for o in bpy.data.objects:
        if o.name.startswith("BreathPuff"): o.hide_render = True
    # level of detail: drop subdivision when the actors are small in frame
    sc.frame_set((S["f0"] + S["f1"]) // 2)
    if active_chars:
        r0 = active_chars[0]
        top = world_to_camera_view(sc, cam, r0.matrix_world @ r0.pose.bones["head"].tail)
        bot = world_to_camera_view(sc, cam, r0.matrix_world @ r0.pose.bones["pelvis"].head)
        if abs(top.y - bot.y) < 0.45 and top.z > 0:
            for c in CHAR_COLLS:
                for o in bpy.data.collections[c].all_objects:
                    for md in o.modifiers:
                        if md.type == "SUBSURF": md.render_levels = 0
            print("LOD: subdivision off")
    sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_quality = "BALANCED"; sc.cycles.denoising_prefilter = "FAST"
    sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 1; sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 2; sc.cycles.transparent_max_bounces = 6; sc.cycles.volume_bounces = 0
    sc.cycles.caustics_refractive = True; sc.cycles.caustics_reflective = True  # light must reach the iris through the cornea
    # ambient fill standing in for the room's bounce light (env is invisible to diffuse rays)
    wn = sc.world.node_tree.nodes["Background"]
    wn.inputs[0].default_value = (0.5, 0.62, 0.78, 1); wn.inputs[1].default_value = 0.55
    sc.world.cycles.sampling_method = "AUTOMATIC"
    for o in env_objs:
        if o in dyn:
            continue
        o.is_holdout = True
        o.visible_diffuse = False; o.visible_glossy = False; o.visible_transmission = False
        o.visible_volume_scatter = False; o.visible_shadow = True
    # wider, softer world for warm scenes (door open): keep the dock light; nothing else to do
    for c in CHAR_COLLS:
        if c.replace("CHR_", "") not in S["chars"]:
            for o in bpy.data.collections[c].all_objects: o.hide_render = True
    # moving shadow catcher disc under the actor(s)
    import bmesh
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=1.0)
    me = bpy.data.meshes.new("ShadowCatcher"); bm.to_mesh(me); bm.free()
    catcher = bpy.data.objects.new("ShadowCatcher", me); sc.collection.objects.link(catcher)
    catcher.is_shadow_catcher = True; catcher.visible_shadow = False
    mcat = bpy.data.materials.new("M_Catcher"); mcat.use_nodes = True
    mcat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.6, 0.62, 0.66, 1)
    mcat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.7
    me.materials.append(mcat)
    catcher.hide_render = len(active_chars) == 0
    bpy.data.objects["Floor"].is_holdout = True

    def actors_border(f):
        pts = []
        for r in active_chars:
            for pb in r.pose.bones:
                for p in (pb.head, pb.tail):
                    pts.append(r.matrix_world @ p)
        # bone joints alone under-estimate the silhouette (shoulders, knees and hair were clipped by the border in
        # close-ups): add the corners of the deformed meshes' bounding boxes, incl. a visible foil blanket
        dg = bpy.context.evaluated_depsgraph_get()
        meshes = [o for c in CHAR_COLLS if c.replace("CHR_", "") in S["chars"] for o in bpy.data.collections[c].all_objects
                  if o.type == "MESH" and not o.hide_render]
        if "Leo" in S["chars"] and "FoilBlanket" in bpy.data.objects and not bpy.data.objects["FoilBlanket"].hide_render:
            meshes.append(bpy.data.objects["FoilBlanket"])
        for o in meshes:
            oe = o.evaluated_get(dg)
            pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
        if any(o.name.startswith("Door") for o in dyn) or any(o.name.startswith("Evap") for o in dyn):
            return (0, 1, 0, 1)
        if not pts:
            return None
        xs, ys = [], []
        for p in pts:
            v = world_to_camera_view(sc, cam, p)
            if v.z <= 0: return (0, 1, 0, 1)
            xs.append(v.x); ys.append(v.y)
        m = 0.04
        b = (max(0, min(xs) - m), min(1, max(xs) + m), max(0, min(ys) - m * 1.6), min(1, max(ys) + m * 1.2))
        if b[1] <= b[0] or b[3] <= b[2]: return None
        return b

    for f in frames():
        out = f"{OUT}/{SID}_char_{f:04d}.exr"
        if os.path.exists(out): continue
        sc.frame_set(f)
        if active_chars:
            pel = [r.matrix_world @ r.pose.bones["pelvis"].head for r in active_chars]
            c = sum(pel, Vector()) / len(pel)
            catcher.location = (c.x, c.y, 0.002); catcher.scale = (1.4, 1.4, 1)
        b = actors_border(f)
        if b is None:
            sc.render.use_border = True; sc.render.use_crop_to_border = False
            sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = 0, 0.01, 0, 0.01
        else:
            sc.render.use_border = True; sc.render.use_crop_to_border = False
            sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = b
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
    print("CHAR", SID)
    sys.exit(0)

# ------------------------------------------------------------------ BREATH (low-res volume pass)
if PASS == "breath":
    common_settings()
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = int(270 * max(SCALE, 0.5) * 2) // 2, int(480 * max(SCALE, 0.5) * 2) // 2
    sc.cycles.samples = 24; sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_quality = "BALANCED"; sc.cycles.denoising_prefilter = "FAST"
    sc.cycles.max_bounces = 2; sc.cycles.diffuse_bounces = 0; sc.cycles.glossy_bounces = 0; sc.cycles.volume_bounces = 0
    soften_breath()
    wn = sc.world.node_tree.nodes["Background"]
    wn.inputs[0].default_value = (0.5, 0.62, 0.78, 1); wn.inputs[1].default_value = 0.55
    for o in bpy.data.objects:
        if o.type not in ("MESH", "CURVE", "FONT") or o.name.startswith("BreathPuff"):
            continue
        o.is_holdout = True; o.visible_diffuse = False; o.visible_glossy = False; o.visible_transmission = False
    puffs_ = [o for o in bpy.data.objects if o.name.startswith("BreathPuff")]
    for f in frames():
        out = f"{OUT}/{SID}_breath_{f:04d}.exr"
        if os.path.exists(out): continue
        sc.frame_set(f)
        live = [o for o in puffs_ if o.get("puff", 0) > 0.01 and o.location.y > -20]
        if not live: continue
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
    print("BREATH", SID)
    sys.exit(0)

# ------------------------------------------------------------------ THERMAL
if PASS == "thermal":
    common_settings()
    sc.render.resolution_x, sc.render.resolution_y = int(540 * SCALE * 2) // 2, int(960 * SCALE * 2) // 2
    if Q != "final":
        sc.render.resolution_x, sc.render.resolution_y = 270, 480
    sc.cycles.samples = 6; sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    sc["thermal_mode"] = 1.0
    if sc.animation_data and sc.animation_data.action:
        for fc in list(sc.animation_data.action.fcurves):
            if fc.data_path == '["thermal_mode"]': sc.animation_data.action.fcurves.remove(fc)
    mt_c = bpy.data.materials["M_Thermal_Char"]; mt_e = bpy.data.materials["M_Thermal_Env"]
    for n in mt_e.node_tree.nodes:  # more readable room structure in the thermal look
        if n.type == "MATH" and n.operation == "MULTIPLY_ADD":
            if abs(n.inputs[1].default_value - 0.06) < 1e-4: n.inputs[1].default_value = 0.17
            if abs(n.inputs[1].default_value - 0.018) < 1e-4: n.inputs[1].default_value = 0.035; n.inputs[2].default_value = 0.06
    # breath puffs keep M_Breath here (warm emission from thermal_mode): give them the same soft falloff as the
    # breath pass, and make them emission-only (no density: nothing to scatter with the lights off, and the
    # extinction only adds a dark, noisy fringe at 6 spp)
    mb = soften_breath()
    pvb = next(n for n in mb.node_tree.nodes if n.type == "PRINCIPLED_VOLUME")
    for l in list(pvb.inputs["Density"].links): mb.node_tree.links.remove(l)
    pvb.inputs["Density"].default_value = 0.0
    for o in bpy.data.objects:
        if o.type not in ("MESH", "CURVE", "FONT") or o.name.startswith("BreathPuff"):
            continue
        if o.name == "FoilBlanket" or o.name.startswith("Phone"):
            o.hide_render = True; continue
        m = mt_c if o in char_objs else mt_e
        if o.type == "MESH" and o.data.users > 1 and o not in char_objs:
            pass
        for slot in o.material_slots:
            slot.link = "OBJECT"; slot.material = m
        if not o.material_slots:
            o.data.materials.append(m) if o.type == "MESH" and o.data.users == 1 else None
    for c in CHAR_COLLS:
        if c.replace("CHR_", "") not in S["chars"]:
            for o in bpy.data.collections[c].all_objects: o.hide_render = True
    for l in bpy.data.lights:
        l.energy = 0
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_depth = "16"
    for f in frames():
        out = f"{OUT}/{SID}_thermal_{f:04d}.png"
        if os.path.exists(out): continue
        sc.frame_set(f); sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
    print("THERMAL", SID)
    sys.exit(0)
