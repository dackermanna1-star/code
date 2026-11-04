"""Build the industrial walk-in freezer set.

Run: blender -b --python build_environment.py -- /opt/work/blend/freezer_env.blend

Layout (metres, +Y = deeper into the freezer, door in the front wall at Y=-4.5):
  interior X[-3,3]  Y[-4.5,6.5]  Z[0,3.6]
  left wall  : chrome wire shelving with boxes, totes and crates
  right wall : pallet racking with shrink-wrapped pallets
  back wall  : 3-fan evaporator unit near the ceiling, refrigerant lines
Poly Haven (CC0) props are appended from /opt/assets/polyhaven/models.
"""
import bpy, bmesh, math, random, os, sys, glob
from mathutils import Vector, Matrix, Euler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_materials as LM

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/opt/work/blend/freezer_env.blend"
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc["frost"] = 0.35
W, D0, D1, H = 3.0, -4.5, 6.5, 3.6  # half width, front y, back y, height


# ---------------------------------------------------------------- helpers
def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or sc.collection).children.link(c)
    return c

C_ENV = coll("ENV")
C_STRUCT = coll("ENV_Structure", C_ENV)
C_DOOR = coll("ENV_Door", C_ENV)
C_SHELF = coll("ENV_Shelving", C_ENV)
C_PROD = coll("ENV_Products", C_ENV)
C_EQUIP = coll("ENV_Equipment", C_ENV)
C_ICE = coll("ENV_Ice", C_ENV)
C_LGT = coll("LGT_Practicals")
C_LIB = coll("ASSET_LIB")
C_LIB.hide_render = True
sc.view_layers[0].layer_collection.children["ASSET_LIB"].exclude = True


def link(o, c):
    for uc in o.users_collection:
        uc.objects.unlink(o)
    c.objects.link(o)
    return o


def box(name, size, loc, mat, c, bevel=0.0, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if mat: me.materials.append(mat)
    if bevel > 0:
        b = o.modifiers.new("Bevel", "BEVEL"); b.width = bevel; b.segments = 2; b.limit_method = "ANGLE"
    for p in me.polygons: p.use_smooth = True
    return o


def cyl(name, r, h, loc, mat, c, verts=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=h)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if mat: me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return o


def tube_curve(name, pts, r, mat, c, res=8):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = r; cu.bevel_resolution = 3; cu.resolution_u = res
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    o = bpy.data.objects.new(name, cu); c.objects.link(o)
    if mat: cu.materials.append(mat)
    return o


def add_frost_to_material(mat, bias=0.0):
    """Route an imported Principled material through the frost overlay."""
    if not mat or not mat.use_nodes or "frosted" in mat:
        return
    nt = mat.node_tree; N, L = nt.nodes, nt.links
    bsdf = next((n for n in N if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf: return
    fg = N.new("ShaderNodeGroup"); fg.node_tree = LM.frost_group()
    fa = LM.scene_attr(nt, "frost"); L.new(fa.outputs["Fac"], fg.inputs["Amount"])
    fg.inputs["Bias"].default_value = bias
    for sock in ["Color", "Roughness", "Metallic", "Normal"]:
        bs = bsdf.inputs["Base Color" if sock == "Color" else sock]
        if bs.is_linked:
            L.new(bs.links[0].from_socket, fg.inputs[sock])
        elif sock == "Normal":
            g = N.new("ShaderNodeNewGeometry"); L.new(g.outputs["Normal"], fg.inputs["Normal"])
        else:
            v = bs.default_value
            fg.inputs[sock].default_value = v
        L.new(fg.outputs[sock], bs)
    mat["frosted"] = True


def load_asset(aid, join=True):
    """Append a Poly Haven model into ASSET_LIB, origin at bottom centre."""
    f = glob.glob(f"/opt/assets/polyhaven/models/{aid}/*.blend")[0]
    with bpy.data.libraries.load(f) as (src, dst):
        dst.objects = src.objects
    objs = [o for o in dst.objects if o and o.type == "MESH" and "LOD1" not in o.name]
    for o in dst.objects:
        if o and o not in objs:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in objs:
        C_LIB.objects.link(o)
    bpy.context.view_layer.update()
    if join and len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
            bpy.ops.object.join()
        objs = [objs[0]]
    o = objs[0]
    o.name = "LIB_" + aid
    # bake transforms
    o.data = o.data.copy() if o.data.users > 1 else o.data
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
    if o.parent: o.parent = None
    pts = [v.co for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    o.data.transform(Matrix.Translation(-off))
    o["dims"] = list(mx - mn)
    for m in o.data.materials:
        add_frost_to_material(m, bias=0.05)
    return o


def inst(lib, name, loc, rot_z=0.0, scale=1.0, c=None, rot=None):
    o = bpy.data.objects.new(name, lib.data)
    (c or C_PROD).objects.link(o)
    o.location = loc
    o.rotation_euler = rot if rot else (0, 0, rot_z)
    o.scale = (scale, scale, scale) if not isinstance(scale, tuple) else scale
    return o


# ---------------------------------------------------------------- materials
M_WALL = LM.pbr("M_WallPanel", "box_profile_metal_sheet", scale=0.55, tint=(0.86, 0.9, 0.95),
                metal=0.25, frost_bias=-0.05, normal_strength=0.5, desat=(0.0, 2.4))
M_CEIL = LM.pbr("M_CeilingPanel", "factory_wall", scale=0.4, tint=(0.85, 0.88, 0.92), metal=0.2, frost_bias=0.0, desat=(0.0, 1.9))
M_FLOOR = LM.pbr("M_Floor", "concrete_floor_worn_001", scale=0.35, tint=(0.78, 0.82, 0.88), frost_bias=0.02)
M_STEEL = LM.pbr("M_Stainless", None, rough=0.32, metal=1.0, frost_bias=0.0, brushed=True, scale=0.9)
M_DIAMOND = LM.pbr("M_DiamondPlate", "metal_plate", scale=1.2, metal=0.85, frost_bias=0.1)
M_CHROME = LM.pbr("M_ChromeWire", None, color=(0.78, 0.8, 0.83), rough=0.22, metal=1.0, frost_bias=0.08)
M_RACK_BLUE = LM.pbr("M_RackUpright", None, color=(0.05, 0.16, 0.45), rough=0.42, metal=0.3, frost_bias=0.0)
M_RACK_ORANGE = LM.pbr("M_RackBeam", None, color=(0.85, 0.28, 0.03), rough=0.38, metal=0.3, frost_bias=0.0)
M_WOOD = LM.pbr("M_PalletWood", None, color=(0.42, 0.32, 0.2), rough=0.8, frost_bias=0.1)
M_RUBBER = LM.pbr("M_Rubber", None, color=(0.02, 0.02, 0.022), rough=0.6, frost=False)
M_WHITE = LM.pbr("M_PowderWhite", None, color=(0.82, 0.84, 0.86), rough=0.35, metal=0.1, frost_bias=0.05)
M_INSUL = LM.pbr("M_PipeInsulation", None, color=(0.02, 0.022, 0.025), rough=0.75, frost_bias=0.25)
M_COPPER = LM.pbr("M_Copper", None, color=(0.75, 0.42, 0.25), rough=0.3, metal=1.0, frost_bias=0.2)
M_ICE = LM.ice()
M_YELLOW = LM.pbr("M_SafetyYellow", None, color=(0.9, 0.62, 0.02), rough=0.35, frost_bias=-0.1)
M_RED = LM.pbr("M_SafetyRed", None, color=(0.7, 0.02, 0.02), rough=0.3, frost_bias=-0.1)
M_LED = LM.emission("M_LEDDiffuser", (0.82, 0.92, 1.0), 9.0); M_LED.cycles.emission_sampling = "NONE"
M_SCREEN = LM.emission("M_DisplayDigits", (1.0, 0.18, 0.08), 6.0); M_SCREEN.cycles.emission_sampling = "NONE"
M_SCREEN_BG = LM.pbr("M_DisplayGlass", None, color=(0.01, 0.01, 0.012), rough=0.08, frost=False)
M_WARM = LM.emission("M_WarmLeak", (1.0, 0.55, 0.22), 25.0)
M_SHRINK = bpy.data.materials.new("M_ShrinkWrap"); M_SHRINK.use_nodes = True
_b = M_SHRINK.node_tree.nodes["Principled BSDF"]
_b.inputs["Base Color"].default_value = (0.9, 0.93, 0.96, 1); _b.inputs["Roughness"].default_value = 0.12
_b.inputs["Transmission Weight"].default_value = 0.92; _b.inputs["Alpha"].default_value = 0.65
_nz = M_SHRINK.node_tree.nodes.new("ShaderNodeTexWave"); _nz.inputs["Scale"].default_value = 6; _nz.inputs["Distortion"].default_value = 6
_bp = M_SHRINK.node_tree.nodes.new("ShaderNodeBump"); _bp.inputs["Strength"].default_value = 0.2
M_SHRINK.node_tree.links.new(_nz.outputs[1], _bp.inputs["Height"]); M_SHRINK.node_tree.links.new(_bp.outputs[0], _b.inputs["Normal"])

# ---------------------------------------------------------------- structure
L_ = D1 - D0
floor = box("Floor", (2 * W + 0.4, L_ + 0.4, 0.2), (0, (D0 + D1) / 2, -0.1), M_FLOOR, C_STRUCT)
ceil = box("Ceiling", (2 * W + 0.4, L_ + 0.4, 0.15), (0, (D0 + D1) / 2, H + 0.075), M_CEIL, C_STRUCT)
box("Wall_Left", (0.15, L_, H), (-W - 0.075, (D0 + D1) / 2, H / 2), M_WALL, C_STRUCT)
box("Wall_Right", (0.15, L_, H), (W + 0.075, (D0 + D1) / 2, H / 2), M_WALL, C_STRUCT)
box("Wall_Back", (2 * W, 0.15, H), (0, D1 + 0.075, H / 2), M_WALL, C_STRUCT)
# front wall with door opening (door 1.2 x 2.2 at x in [-0.6,0.6])
DW, DH = 1.2, 2.2
box("Wall_Front_L", (W - DW / 2, 0.15, H), (-(W + DW / 2) / 2, D0 - 0.075, H / 2), M_WALL, C_STRUCT)
box("Wall_Front_R", (W - DW / 2, 0.15, H), ((W + DW / 2) / 2, D0 - 0.075, H / 2), M_WALL, C_STRUCT)
box("Wall_Front_Top", (DW, 0.15, H - DH), (0, D0 - 0.075, DH + (H - DH) / 2), M_WALL, C_STRUCT)
# panel seams (aluminium H-joints) and floor cove trim
for i, x in enumerate([-W + 1.2 * k for k in range(1, 5)]):
    box(f"Seam_Back_{i}", (0.035, 0.012, H), (x, D1 - 0.006, H / 2), M_STEEL, C_STRUCT)
for side, sx in [("L", -W), ("R", W)]:
    for i, y in enumerate([D0 + 1.2 * k for k in range(1, 10)]):
        box(f"Seam_{side}_{i}", (0.012, 0.035, H), (sx - math.copysign(0.006, sx) * -1 if False else sx + (0.006 if sx < 0 else -0.006), y, H / 2), M_STEEL, C_STRUCT)
    box(f"Cove_{side}", (0.05, L_, 0.12), (sx + (0.025 if sx < 0 else -0.025), (D0 + D1) / 2, 0.06), M_STEEL, C_STRUCT, bevel=0.01)
box("Cove_Back", (2 * W, 0.05, 0.12), (0, D1 - 0.025, 0.06), M_STEEL, C_STRUCT, bevel=0.01)
for i, x in enumerate([-W + 1.0 * k for k in range(1, 6)]):
    box(f"CeilSeam_{i}", (0.03, L_, 0.01), (x, (D0 + D1) / 2, H - 0.005), M_STEEL, C_STRUCT)
# bumper rails along walls (protect panels from carts)
for side, sx in [("L", -W + 0.05), ("R", W - 0.05)]:
    box(f"Bumper_{side}", (0.06, L_ - 0.6, 0.12), (sx, (D0 + D1) / 2 + 0.3, 0.45), M_YELLOW, C_STRUCT, bevel=0.015)

# ---------------------------------------------------------------- door
# Door frame trim
for nm, sz, lc in [("Frame_L", (0.08, 0.06, DH + 0.08), (-DW / 2 - 0.04, D0 + 0.02, DH / 2)),
                   ("Frame_R", (0.08, 0.06, DH + 0.08), (DW / 2 + 0.04, D0 + 0.02, DH / 2)),
                   ("Frame_T", (DW + 0.16, 0.06, 0.08), (0, D0 + 0.02, DH + 0.04))]:
    box("Door" + nm, sz, lc, M_STEEL, C_DOOR, bevel=0.008)
# warm light leaking under / around the door from the dock outside
leak = box("Door_WarmLeak", (DW - 0.04, 0.02, 0.012), (0, D0 - 0.12, 0.006), M_WARM, C_DOOR)
leak.visible_camera = True
# hinge pivot
pivot = bpy.data.objects.new("Door_Pivot", None); C_DOOR.objects.link(pivot)
pivot.location = (-DW / 2, D0 - 0.06, 0); pivot.empty_display_size = 0.3
slab = box("Door_Slab", (DW - 0.02, 0.12, DH - 0.01), (DW / 2, 0, DH / 2), M_STEEL, C_DOOR, bevel=0.01)
slab.parent = pivot
gasket = box("Door_Gasket", (DW + 0.0, 0.02, DH + 0.0), (DW / 2, 0.065, DH / 2), M_RUBBER, C_DOOR)
gasket.parent = pivot
gasket.modifiers.new("solid", "WIREFRAME").thickness = 0.03
kick = box("Door_KickPlate", (DW - 0.08, 0.006, 0.35), (DW / 2, 0.063, 0.2), M_DIAMOND, C_DOOR, bevel=0.003)
kick.parent = pivot
# inside safety release: rod + mushroom cap near the latch side, 1.05 m high
REL = Vector((DW - 0.16, 0.06, 1.05))
rod = cyl("Release_Rod", 0.012, 0.09, (REL.x, REL.y + 0.045, REL.z), M_STEEL, C_DOOR, rot=(math.pi / 2, 0, 0))
rod.parent = pivot
cap = cyl("Release_Cap", 0.045, 0.035, (REL.x, REL.y + 0.1, REL.z), M_RED, C_DOOR, verts=24, rot=(math.pi / 2, 0, 0))
cap.parent = pivot
cap.modifiers.new("Bevel", "BEVEL").width = 0.012
plate = box("Release_Backplate", (0.12, 0.008, 0.16), (REL.x, REL.y + 0.004, REL.z), M_YELLOW, C_DOOR, bevel=0.004)
plate.parent = pivot
# label text "EMERGENCY RELEASE - PUSH"
for i, (txt, z, sz) in enumerate([("EMERGENCY", REL.z + 0.11, 0.028), ("RELEASE", REL.z + 0.08, 0.028), ("PUSH", REL.z - 0.1, 0.03)]):
    cu = bpy.data.curves.new(f"ReleaseLabel_{i}", "FONT"); cu.body = txt; cu.size = sz; cu.align_x = "CENTER"; cu.extrude = 0.0005
    t = bpy.data.objects.new(f"ReleaseLabel_{i}", cu); C_DOOR.objects.link(t); t.parent = pivot
    t.location = (REL.x, REL.y + 0.009, z); t.rotation_euler = (math.pi / 2, 0, math.pi)
    cu.materials.append(M_RED if txt != "PUSH" else M_RUBBER)
# ice encasing the release (animated scale/visibility per shot)
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
for v in bm.verts:
    n = v.co.normalized()
    v.co = Vector((n.x * 0.085, n.y * 0.075, n.z * 0.11)) * (1 + 0.18 * math.sin(7 * n.x + 3) * math.cos(5 * n.z))
me = bpy.data.meshes.new("Release_Ice"); bm.to_mesh(me); bm.free()
ice = bpy.data.objects.new("Release_Ice", me); C_DOOR.objects.link(ice); ice.parent = pivot
ice.location = (REL.x, REL.y + 0.06, REL.z - 0.01); me.materials.append(M_ICE)
for p in me.polygons: p.use_smooth = True
ice.modifiers.new("disp", "DISPLACE").strength = 0.012
# frost crust around door perimeter (inside)
crust = box("Door_FrostCrust", (DW + 0.18, 0.03, DH + 0.1), (0, D0 + 0.055, DH / 2), LM.pbr("M_FrostCrust", None, color=(0.9, 0.95, 1.0), rough=0.6, frost=False), C_DOOR)
crust.modifiers.new("w", "WIREFRAME").thickness = 0.06

# ---------------------------------------------------------------- wall-mounted details near the door
disp_box = box("TempDisplay_Housing", (0.22, 0.05, 0.12), (1.05, D0 + 0.025, 1.65), M_WHITE, C_EQUIP, bevel=0.008)
box("TempDisplay_Glass", (0.17, 0.006, 0.065), (1.05, D0 + 0.052, 1.66), M_SCREEN_BG, C_EQUIP)
cu = bpy.data.curves.new("TempDisplay_Digits", "FONT"); cu.body = "-20.4°C"; cu.size = 0.045; cu.align_x = "CENTER"; cu.align_y = "CENTER"
digits = bpy.data.objects.new("TempDisplay_Digits", cu); C_EQUIP.objects.link(digits)
digits.location = (1.05, D0 + 0.056, 1.66); digits.rotation_euler = (math.pi / 2, 0, math.pi); cu.materials.append(M_SCREEN)
cu2 = bpy.data.curves.new("TempDisplay_Label", "FONT"); cu2.body = "FREEZER 2"; cu2.size = 0.018; cu2.align_x = "CENTER"
lab = bpy.data.objects.new("TempDisplay_Label", cu2); C_EQUIP.objects.link(lab)
lab.location = (1.05, D0 + 0.052, 1.605); lab.rotation_euler = (math.pi / 2, 0, math.pi); cu2.materials.append(M_RUBBER)
# light switch with red pilot lamp
box("LightSwitch", (0.08, 0.04, 0.12), (0.85, D0 + 0.02, 1.2), M_WHITE, C_EQUIP, bevel=0.006)
cyl("LightSwitch_Pilot", 0.008, 0.01, (0.85, D0 + 0.045, 1.24), LM.emission("M_Pilot", (1, 0.05, 0.02), 30), C_EQUIP, rot=(math.pi / 2, 0, 0))

# ---------------------------------------------------------------- wire shelving (left wall)
def wire_shelf_unit(name, origin, width=1.22, depth=0.61, height=2.13, levels=(0.15, 0.6, 1.05, 1.5, 1.95)):
    parts = []
    ox, oy, oz = origin
    for sx in (-width / 2, width / 2):
        for sy in (-depth / 2, depth / 2):
            p = cyl(f"{name}_post", 0.0125, height, (ox + sx, oy + sy, height / 2), M_CHROME, C_SHELF, verts=12)
            parts.append(p)
            # leveling foot
            parts.append(cyl(f"{name}_foot", 0.02, 0.02, (ox + sx, oy + sy, 0.01), M_RUBBER, C_SHELF, verts=12))
    for lz in levels:
        # frame truss
        for sy in (-depth / 2, depth / 2):
            for dz in (0.0, -0.025):
                parts.append(tube_curve(f"{name}_truss", [(ox - width / 2, oy + sy, lz + dz), (ox + width / 2, oy + sy, lz + dz)], 0.0035, M_CHROME, C_SHELF))
            # zig zag
            pts = []
            n = 24
            for k in range(n + 1):
                pts.append((ox - width / 2 + width * k / n, oy + sy, lz - (0.025 if k % 2 else 0.0)))
            parts.append(tube_curve(f"{name}_zig", pts, 0.0022, M_CHROME, C_SHELF))
        for sx in (-width / 2, width / 2):
            parts.append(tube_curve(f"{name}_side", [(ox + sx, oy - depth / 2, lz), (ox + sx, oy + depth / 2, lz)], 0.0035, M_CHROME, C_SHELF))
        # deck wires
        nw = 30
        for k in range(1, nw):
            x = ox - width / 2 + width * k / nw
            parts.append(tube_curve(f"{name}_w", [(x, oy - depth / 2, lz), (x, oy + depth / 2, lz)], 0.0019, M_CHROME, C_SHELF))
        for k in range(1, 4):
            y = oy - depth / 2 + depth * k / 4
            parts.append(tube_curve(f"{name}_cw", [(ox - width / 2, y, lz - 0.004), (ox + width / 2, y, lz - 0.004)], 0.0025, M_CHROME, C_SHELF))
    # convert curves to a single mesh for speed
    for p in parts:
        p.select_set(False)
    curves = [p for p in parts if p.type == "CURVE"]
    with bpy.context.temp_override(selected_editable_objects=curves, selected_objects=curves, active_object=curves[0]):
        bpy.ops.object.convert(target="MESH")
    meshes = parts
    with bpy.context.temp_override(selected_editable_objects=meshes, selected_objects=meshes, active_object=meshes[0]):
        bpy.ops.object.join()
    u = meshes[0]; u.name = name
    return u


SHELF_LEVELS = (0.15, 0.6, 1.05, 1.5, 1.95)
shelf_proto = wire_shelf_unit("WireShelf_A", (0, 0, 0))
shelf_proto.data.name = "WireShelfMesh"
link(shelf_proto, C_LIB)
SHELF_Y = [-3.3, -2.0, -0.7, 0.6]
shelves = []
for i, y in enumerate(SHELF_Y):
    o = bpy.data.objects.new(f"WireShelf_{i}", shelf_proto.data); C_SHELF.objects.link(o)
    o.location = (-W + 0.36, y, 0); o.rotation_euler = (0, 0, math.pi / 2)
    shelves.append(o)

# ---------------------------------------------------------------- pallet racking (right wall)
def pallet_rack(name, x, y0, y1, depth=1.0, levels=(0.0, 1.25, 2.45), height=3.3):
    objs = []
    for y in (y0, y1):
        for dx in (-depth / 2, depth / 2):
            objs.append(box(f"{name}_upright", (0.08, 0.075, height), (x + dx, y, height / 2), M_RACK_BLUE, C_SHELF, bevel=0.004))
        # bracing
        for k in range(5):
            z0 = 0.2 + k * 0.62; z1 = z0 + 0.62
            o = box(f"{name}_brace", (0.02, 0.03, math.hypot(depth, 0.62)), (x, y, (z0 + z1) / 2), M_RACK_BLUE, C_SHELF)
            o.rotation_euler = (0, math.atan2(depth, 0.62) * (1 if k % 2 else -1), 0)
            objs.append(o)
        objs.append(box(f"{name}_baseplate", (depth + 0.15, 0.15, 0.01), (x, y, 0.005), M_RACK_BLUE, C_SHELF))
    for lz in levels[1:]:
        for dx in (-depth / 2 + 0.05, depth / 2 - 0.05):
            objs.append(box(f"{name}_beam", (0.05, y1 - y0 - 0.08, 0.12), (x + dx, (y0 + y1) / 2, lz), M_RACK_ORANGE, C_SHELF, bevel=0.006))
    # floor anchor yellow guard
    objs.append(box(f"{name}_guard", (0.14, 0.25, 0.4), (x - depth / 2 - 0.1, y0, 0.2), M_YELLOW, C_SHELF, bevel=0.02))
    return objs, levels


def pallet(name, loc, c=C_PROD):
    x, y, z = loc
    objs = []
    for k in range(3):  # stringers
        objs.append(box(f"{name}_str", (1.0, 0.09, 0.1), (x, y - 0.5 + k * 0.5, z + 0.07), M_WOOD, c, bevel=0.004))
    for k in range(7):
        objs.append(box(f"{name}_top", (0.1, 1.2, 0.022), (x - 0.45 + k * 0.15, y, z + 0.13), M_WOOD, c, bevel=0.002))
    for k in range(3):
        objs.append(box(f"{name}_bot", (0.1, 1.2, 0.022), (x - 0.45 + k * 0.45, y, z + 0.011), M_WOOD, c, bevel=0.002))
    return objs


lib_box = load_asset("cardboard_box_01")
lib_crate = load_asset("plastic_crate_01")
lib_crate3 = load_asset("plastic_crate_03")
lib_tote = load_asset("industrial_pastic_container")
lib_bin = load_asset("plastic_container")
lib_sign = load_asset("WetFloorSign_01")
lib_crowbar = load_asset("crowbar_01")
lib_truck = load_asset("hand_truck")
lib_util = load_asset("utility_box_01")
lib_cam = load_asset("security_camera_01")
lib_wlamp = load_asset("industrial_wall_lamp")
BOXD = Vector(lib_box["dims"])  # ~0.39 x 0.52 x 0.34


def box_stack(name, x, y, z, nx, ny, nz, rot=0.0, scale=0.95, jitter=0.02):
    objs = []
    sx, sy, sz = BOXD.x * scale, BOXD.y * scale, BOXD.z * scale
    for k in range(nz):
        for i in range(nx):
            for j in range(ny):
                lx = (i - (nx - 1) / 2) * sx * 1.02; ly = (j - (ny - 1) / 2) * sy * 1.02
                c, s = math.cos(rot), math.sin(rot)
                o = inst(lib_box, f"{name}_box", (x + c * lx - s * ly + random.uniform(-jitter, jitter),
                                                    y + s * lx + c * ly + random.uniform(-jitter, jitter),
                                                    z + k * sz * 1.005), rot + random.uniform(-0.04, 0.04), scale)
                objs.append(o)
    return objs


RACK_X = W - 0.62
for bi, (y0, y1) in enumerate([(-2.6, 0.2), (0.2, 3.0), (3.0, 5.8)]):
    objs, levels = pallet_rack(f"Rack_{bi}", RACK_X, y0, y1)
    for li, lz in enumerate(levels):
        for pj, py in enumerate([y0 + 0.72, y1 - 0.72]):
            if random.random() < 0.12 and li > 0:
                continue
            base = lz + (0.06 if li > 0 else 0)
            pallet(f"Pallet_{bi}_{li}_{pj}", (RACK_X, py, base))
            nz = 2 if li == 2 else 3
            stk = box_stack(f"Stack_{bi}_{li}_{pj}", RACK_X, py, base + 0.145, 2, 2, nz, rot=math.pi / 2, scale=1.0, jitter=0.01)
            # shrink wrap around the stack
            wz = BOXD.z * nz
            sw = box(f"Wrap_{bi}_{li}_{pj}", (1.06, 1.1, wz * 0.92), (RACK_X, py, base + 0.145 + wz * 0.5), M_SHRINK, C_PROD, bevel=0.03)
            sw.modifiers.new("disp", "DISPLACE").strength = 0.008
            sw.visible_shadow = False

# products on wire shelves (left)
for si, y in enumerate(SHELF_Y):
    for li, lz in enumerate(SHELF_LEVELS):
        r = random.random()
        x = -W + 0.36
        top = lz + 0.004
        if li == 4 and r < 0.5:
            continue
        if r < 0.45:
            box_stack(f"ShelfBox_{si}_{li}", x, y, top, 1, 2, 1 if li < 4 else 1, rot=0, scale=0.92 + random.uniform(-0.1, 0.05))
        elif r < 0.7:
            for k in range(3):
                inst(lib_crate, f"Crate_{si}_{li}", (x + random.uniform(-0.05, 0.05), y - 0.4 + k * 0.4, top), math.pi / 2 + random.uniform(-0.1, 0.1), 0.95)
        elif r < 0.88:
            for k in range(2):
                inst(lib_tote, f"Tote_{si}_{li}", (x, y - 0.3 + k * 0.62, top), random.uniform(-0.05, 0.05), 0.92)
        else:
            inst(lib_bin, f"Bin_{si}_{li}", (x, y, top), math.pi / 2, 0.85)

# floor clutter, back of room
box_stack("FloorStack_A", 1.2, 5.6, 0.0, 2, 2, 3, rot=0.15)
box_stack("FloorStack_B", -1.6, 5.3, 0.0, 2, 1, 2, rot=-0.3)
pallet("Pallet_Floor", (-1.6, 5.3, -0.15))
inst(lib_truck, "HandTruck", (-2.45, 1.75, 0), 1.2, 1.0, C_EQUIP)
inst(lib_util, "UtilityBox", (W - 0.25, D0 + 0.6, 0.9), -math.pi / 2, 0.8, C_EQUIP)
inst(lib_cam, "SecurityCamera", (-W + 0.15, D0 + 0.2, H - 0.35), -0.6, 1.0, C_EQUIP)
for k, x in enumerate([-1.2, 1.4]):
    o = inst(lib_wlamp, f"BulkheadLamp_{k}", (x, D0 + 0.02, 2.55), 0.0, 0.9, C_EQUIP, rot=(math.pi / 2, 0, math.pi))
# crowbar resting on a shelf close to the door
inst(lib_crowbar, "Crowbar", (-W + 0.45, -3.25, 1.06), rot=(0, math.pi / 2, 0.3), c=C_EQUIP)
# wet floor sign near the ice patch, knocked slightly askew
inst(lib_sign, "WetFloorSign", (0.95, -0.2, 0), 2.6, 1.0, C_EQUIP)
# flattened cardboard sheets leaning on the shelf end (used in the "best move" beat)
M_CARD = [m for m in lib_box.data.materials][0]
for k in range(3):
    s = box(f"CardboardSheet_{k}", (0.9, 0.012, 1.1), (-W + 0.75 + k * 0.03, 1.45 + k * 0.02, 0.56), M_CARD, C_PROD)
    s.rotation_euler = (math.radians(-14 - k * 3), 0, math.radians(88 + k * 2))

# ---------------------------------------------------------------- evaporator (back wall, near ceiling)
EV = Vector((0.0, D1 - 0.45, H - 0.55))
ev_house = box("Evap_Housing", (2.6, 0.75, 0.62), EV, M_WHITE, C_EQUIP, bevel=0.02)
# coil fins at the back (visible from below/side)
fins = box("Evap_Coil", (2.4, 0.4, 0.5), (EV.x, EV.y + 0.12, EV.z - 0.02), M_STEEL, C_EQUIP)
arr = fins.modifiers.new("arr", "ARRAY")
fins.scale = (0.004 / 2.4 * 1.0, 1, 1); fins.location.x = EV.x - 1.2
arr.count = 200; arr.relative_offset_displace = (0, 0, 0); arr.use_relative_offset = False
arr.use_constant_offset = True; arr.constant_offset_displace = (0.012, 0, 0)
# drip pan + drain line with icicles
box("Evap_DripPan", (2.7, 0.85, 0.05), (EV.x, EV.y, EV.z - 0.34), M_STEEL, C_EQUIP, bevel=0.01)
tube_curve("Evap_Drain", [(1.1, D1 - 0.3, EV.z - 0.36), (1.1, D1 - 0.08, EV.z - 0.36), (1.1, D1 - 0.08, 0.15)], 0.02, M_INSUL, C_EQUIP)
FANS = []
for k, fx in enumerate([-0.82, 0.0, 0.82]):
    fc = Vector((EV.x + fx, EV.y - 0.38, EV.z))
    shroud = cyl(f"Evap_FanShroud_{k}", 0.27, 0.06, fc, M_WHITE, C_EQUIP, verts=32, rot=(math.pi / 2, 0, 0))
    sol = shroud.modifiers.new("hole", "SOLIDIFY")
    # guard rings
    for rr in (0.08, 0.15, 0.22, 0.27):
        t = bpy.data.curves.new(f"guard{k}", "CURVE"); t.dimensions = "3D"; t.bevel_depth = 0.003
        sp = t.splines.new("NURBS"); n = 24; sp.points.add(n - 1)
        for j in range(n):
            a = 2 * math.pi * j / n; sp.points[j].co = (rr * math.cos(a), 0, rr * math.sin(a), 1)
        sp.use_cyclic_u = True; sp.order_u = 3
        g = bpy.data.objects.new(f"Evap_Guard_{k}", t); C_EQUIP.objects.link(g); g.location = fc + Vector((0, -0.045, 0)); t.materials.append(M_CHROME)
    for j in range(8):
        a = 2 * math.pi * j / 8
        tube_curve(f"Evap_Spoke_{k}", [tuple(fc + Vector((0, -0.045, 0))), tuple(fc + Vector((0.27 * math.cos(a), -0.045, 0.27 * math.sin(a))))], 0.003, M_CHROME, C_EQUIP)
    # hub + blades (rotating)
    hub = bpy.data.objects.new(f"Evap_FanRotor_{k}", None); C_EQUIP.objects.link(hub); hub.location = fc + Vector((0, -0.01, 0))
    hub.rotation_mode = "XYZ"
    cyl(f"Evap_Hub_{k}", 0.05, 0.05, (0, 0, 0), M_RUBBER, C_EQUIP, rot=(math.pi / 2, 0, 0)).parent = hub
    for j in range(5):
        bl = box(f"Evap_Blade_{k}_{j}", (0.09, 0.008, 0.22), (0, 0, 0.13), M_RUBBER, C_EQUIP, bevel=0.01)
        bl.rotation_euler = (0, 0, 0)
        piv = bpy.data.objects.new(f"Evap_BladePivot_{k}_{j}", None); C_EQUIP.objects.link(piv); piv.parent = hub
        piv.rotation_euler = (0, 2 * math.pi * j / 5, 0)
        bl.parent = piv; bl.rotation_euler = (0, 0, math.radians(28))
    # spin driver (about local Y = fan axis)
    fcu = hub.driver_add("rotation_euler", 1)
    fcu.driver.expression = f"frame*0.21+{k*1.3}"
    FANS.append(hub)
# icicles hanging from the drip pan
M_ICICLE = LM.ice("M_Icicle", (0.8, 0.9, 0.97))
for k in range(26):
    x = random.uniform(-1.3, 1.3); y = EV.y + random.uniform(-0.4, -0.3); L = random.uniform(0.04, 0.22)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.012 + L * 0.06, radius2=0.0008, depth=L)
    for v in bm.verts:
        v.co.x += 0.004 * math.sin(v.co.z * 60 + k)
    me = bpy.data.meshes.new("Icicle"); bm.to_mesh(me); bm.free(); me.materials.append(M_ICICLE)
    o = bpy.data.objects.new(f"Icicle_{k}", me); C_ICE.objects.link(o); o.location = (x, y, EV.z - 0.365 - L / 2); o.rotation_euler = (math.pi, 0, 0)

# refrigerant lines along the ceiling from evaporator to the front-right corner
tube_curve("Pipe_Suction", [(1.0, D1 - 0.3, H - 0.25), (2.6, D1 - 0.3, H - 0.25), (2.6, D0 + 0.4, H - 0.25), (2.6, D0 + 0.4, H)], 0.045, M_INSUL, C_EQUIP)
tube_curve("Pipe_Liquid", [(0.9, D1 - 0.3, H - 0.35), (2.75, D1 - 0.3, H - 0.35), (2.75, D0 + 0.5, H - 0.35), (2.75, D0 + 0.5, H)], 0.012, M_COPPER, C_EQUIP)
for k, y in enumerate([D1 - 1.5 - 1.6 * i for i in range(6)]):
    box(f"PipeHanger_{k}", (0.3, 0.03, 0.35), (2.65, y, H - 0.17), M_STEEL, C_EQUIP)

# ---------------------------------------------------------------- ceiling light fixtures + lights
FIX = []
for k, y in enumerate([-3.2, -0.6, 2.0, 4.6]):
    for j, x in enumerate([-1.3, 1.3]):
        hsg = box(f"LEDFixture_{k}_{j}", (0.16, 1.4, 0.09), (x, y, H - 0.06), M_WHITE, C_EQUIP, bevel=0.02)
        dif = box(f"LEDDiffuser_{k}_{j}", (0.12, 1.32, 0.02), (x, y, H - 0.11), M_LED, C_EQUIP, bevel=0.008)
        dif.visible_shadow = False
        ld = bpy.data.lights.new(f"LED_{k}_{j}", "AREA"); ld.shape = "RECTANGLE"; ld.size = 0.12; ld.size_y = 1.32
        ld.energy = 140; ld.color = (0.78, 0.9, 1.0)
        lo = bpy.data.objects.new(f"LED_{k}_{j}", ld); C_LGT.objects.link(lo); lo.location = (x, y, H - 0.125)
        FIX.append(lo)
# warm spill outside the door (only visible when the door opens)
wl = bpy.data.lights.new("Dock_Warm", "AREA"); wl.shape = "RECTANGLE"; wl.size = 1.4; wl.size_y = 2.4
wl.energy = 0; wl.color = (1.0, 0.62, 0.32)
wlo = bpy.data.objects.new("Dock_Warm", wl); C_LGT.objects.link(wlo); wlo.location = (0, D0 - 1.2, 1.3); wlo.rotation_euler = (math.radians(-90), 0, 0)
# exterior dock backdrop (seen through open door)
dock = box("Dock_Backdrop", (4.0, 0.1, 3.0), (0, D0 - 2.6, 1.5), LM.emission("M_DockGlow", (1.0, 0.7, 0.45), 1.8), C_STRUCT)
box("Dock_Floor", (4.0, 2.4, 0.1), (0, D0 - 1.3, -0.05), LM.pbr("M_DockFloor", "concrete_floor_worn_001", scale=0.3, tint=(1.0, 0.92, 0.85), frost=False), C_STRUCT)

# ---------------------------------------------------------------- ice and frost on the floor
ice_mat_floor = LM.pbr("M_FloorIce", None, color=(0.16, 0.19, 0.22), rough=0.03, metal=0.0, frost=False)
ice_mat_floor.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 1.0
for k, (x, y, sx, sy) in enumerate([(0.35, 0.3, 0.9, 1.4), (-0.4, 1.4, 0.5, 0.7), (1.8, 4.8, 0.8, 0.6), (-1.9, -2.2, 0.4, 0.5), (0.3, 5.9, 1.2, 0.5)]):
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=40, radius=1.0)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x); rr = 1 + 0.25 * math.sin(3 * a + k) + 0.12 * math.sin(7 * a + 2 * k)
        v.co.x *= sx * rr; v.co.y *= sy * rr
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"FloorIce_{k}"); bm.to_mesh(me); bm.free(); me.materials.append(ice_mat_floor)
    o = bpy.data.objects.new(f"FloorIce_{k}", me); C_ICE.objects.link(o); o.location = (x, y, 0.0015)
    s = o.modifiers.new("solid", "SOLIDIFY"); s.thickness = 0.004; s.offset = 1.0

# ---------------------------------------------------------------- world + render defaults
w = bpy.data.worlds.new("W_Freezer"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.03, 0.045, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.4
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
sc.render.fps = 30
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast"
bpy.context.view_layer.use_pass_mist = True
sc.world.mist_settings.start = 1.5; sc.world.mist_settings.depth = 14.0; sc.world.mist_settings.falloff = "LINEAR"
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SAVED", OUT, len(bpy.data.objects), "objects")
