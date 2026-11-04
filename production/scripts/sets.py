"""Environment builders. Each returns a dict of anchor points. World axes: +X east, +Y north."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler
import ylib as Y
import architecture as A
import vehicles as V

TEX = "/home/user/code/production/textures"


def img_mat(name, path, rough=0.7, emission=0.0, alpha=False, uv=True):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    if emission:
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emission
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        m.surface_render_method = 'BLENDED' if alpha == 'blend' else 'DITHERED'
    return m


def plane(name, size, loc, rot=(0, 0, 0), mat=None, c=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        Y.assign(o, mat)
    if c:
        Y.link_to(o, c)
    return o


def ground(name, size, mat, c, subdiv=0, noise=0.0, loc=(0, 0, 0)):
    o = plane(name, size, loc, mat=mat, c=c)
    if subdiv:
        md = o.modifiers.new("sub", 'SUBSURF'); md.subdivision_type = 'SIMPLE'; md.levels = md.render_levels = subdiv
        if noise:
            tx = bpy.data.textures.new(name + "_n", 'CLOUDS'); tx.noise_scale = 6
            d = o.modifiers.new("disp", 'DISPLACE'); d.texture = tx; d.strength = noise; d.texture_coords = 'GLOBAL'
    return o


# ------------------------------------------------------------------ plants
def leaf_cluster(name, c, col=(0.08, 0.2, 0.05)):
    """Low sweet-potato style vine clump (heart-ish leaves)."""
    leafm = Y.mat_basic("M_Leaf_" + name, (*col, 1), rough=0.6, sss=0.15)
    P = []
    rnd = random.Random(hash(name) & 0xffff)
    for i in range(9):
        bpy.ops.mesh.primitive_circle_add(vertices=10, radius=0.09, fill_type='TRIFAN')
        l = bpy.context.active_object
        l.scale = (1.0, 0.8, 1)
        a = rnd.uniform(0, 6.28)
        l.location = (0.12 * math.cos(a) * rnd.uniform(0.3, 1.2), 0.12 * math.sin(a) * rnd.uniform(0.3, 1.2), rnd.uniform(0.04, 0.2))
        l.rotation_euler = (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), a)
        Y.assign(l, leafm)
        P.append(l)
    o = A._join(P, name)
    Y.link_to(o, c)
    return o


def scatter(name, src, c, area, count, seed=1, zrot=True, scale=(0.8, 1.3), avoid=None, z=0.0, rows=None):
    """Scatter linked duplicates of src across area=(xmin,xmax,ymin,ymax)."""
    rnd = random.Random(seed)
    out = []
    i = 0
    tries = 0
    while len(out) < count and tries < count * 10:
        tries += 1
        if rows:
            r = rnd.randrange(rows[0])
            y = area[2] + (area[3] - area[2]) * (r + 0.5) / rows[0] + rnd.uniform(-0.05, 0.05)
            x = rnd.uniform(area[0], area[1])
        else:
            x, y = rnd.uniform(area[0], area[1]), rnd.uniform(area[2], area[3])
        if avoid and avoid(x, y):
            continue
        s = rnd.uniform(*scale)
        o = Y.instance(src, f"{name}{i}", (x, y, z), (0, 0, rnd.uniform(0, 6.28) if zrot else 0), s, c)
        out.append(o)
        i += 1
    return out


# ------------------------------------------------------------------ Hiroshima street (Eba district, 1945)
def hiro_street(c, state="intact"):
    """state: intact | ruins | night"""
    m = A.M()
    rng = random.Random(1945)
    road_m = Y.mat_pbr("M_RoadDirt", "raked_dirt", scale=0.18, tint=(0.75, 0.68, 0.58, 1), bump=0.8)
    ground("Road", (160, 12.4), road_m, c, loc=(0, 0, 0))
    edge_m = Y.mat_pbr("M_Gravel", "gravel_floor", scale=0.3, tint=(0.7, 0.66, 0.6, 1))
    # tram rails (single track, Hiroden 1067 mm gauge) at y=+1.4
    rail_m = Y.mat_basic("M_Rail", (0.25, 0.22, 0.2, 1), rough=0.35, metal=0.9)
    for yy in (1.4 - 0.533, 1.4 + 0.533):
        Y.box(f"Rail{yy:.2f}", (160, 0.07, 0.06), (0, yy, 0.03), mat=rail_m, c=c)
    sleeper_m = Y.mat_pbr("M_Sleeper", "dark_planks", scale=1.0, tint=(0.35, 0.3, 0.26, 1))
    sl = Y.box("Sleeper0", (0.2, 1.6, 0.04), (-79, 1.4, 0.01), mat=sleeper_m, c=c)
    for i in range(1, 260):
        Y.instance(sl, f"Sleeper{i}", (-79 + i * 0.62, 1.4, 0.01), c=c)
    # rows of houses (north side faces -Y at y=+6.6, south side faces +Y at y=-6.6)
    houses = []
    for side in (1, -1):
        x = -78
        while x < (70 if side > 0 else 22):
            w = rng.uniform(4.0, 6.8)
            dmg = 0.0
            h = A.machiya(f"House_{'N' if side > 0 else 'S'}{len(houses)}", w=w, d=rng.uniform(7, 10),
                          floors=2 if rng.random() < 0.7 else 1, rng=rng, mats=m, shop=rng.random() < 0.22)
            h.location = (x + w / 2, side * 6.6, 0)
            h.rotation_euler.z = 0 if side > 0 else math.pi
            Y.link_to(h, c)
            houses.append(h)
            # alley gaps
            x += w + (rng.uniform(1.2, 2.2) if rng.random() < 0.15 else rng.uniform(0.02, 0.15))
    # wartime fire-defence water tanks and bucket stacks in front of some houses
    tank = A.water_tank("WaterTank", m)
    Y.link_to(tank, c)
    tank.location = (-30, -5.7, 0)
    for i, x in enumerate((-52, -8, 14, 33, -64)):
        side = 1 if i % 2 else -1
        Y.instance(tank, f"WaterTank{i}", (x, side * 5.7, 0), (0, 0, 0 if side < 0 else math.pi), c=c)
    # utility poles (south side) with wires
    pole = A.utility_pole("Pole", 8.5)
    Y.link_to(pole, c)
    pole.location = (-77, -5.2, 0)
    for i in range(1, 15):
        Y.instance(pole, f"Pole{i}", (-77 + i * 11, -5.2, 0), (0, 0, rng.uniform(-0.03, 0.03)), c=c)
    wm = Y.mat_basic("M_Wire", (0.02, 0.02, 0.02, 1), rough=0.5)
    for i in range(14):
        for k, xo in enumerate((-0.65, -0.25, 0.25, 0.65)):
            w_ = A.wire(f"Wire{i}_{k}", (-77 + i * 11, -5.2 + xo * 0.0 + 0, 8.2 - (k // 2) * 0.7), (-77 + (i + 1) * 11, -5.2, 8.2 - (k // 2) * 0.7), sag=0.35, mat=wm)
            w_.location.y += xo * 0.0
            w_.data.splines[0].points.foreach_set("co", [v for p in w_.data.splines[0].points for v in (p.co[0], p.co[1] + xo, p.co[2], 1)])
            Y.link_to(w_, c)
    # tram catenary over the track
    tpole = Y.cyl("TramPole", 0.08, 6.5, (-70, 6.0, 3.25), mat=Y.mat_basic("M_TramPole", (0.12, 0.12, 0.12, 1), rough=0.5, metal=0.6), c=c, verts=10)
    for i in range(1, 9):
        Y.instance(tpole, f"TramPole{i}", (-70 + i * 18, 6.0, 3.25), c=c)
    A.wire("TramWire", (-80, 1.4, 5.6), (80, 1.4, 5.6), sag=0.0, segs=2, mat=wm)
    Y.link_to(bpy.data.objects["TramWire"], c)
    # tram stop: low platform + sign post (no text)
    plat_m = Y.mat_pbr("M_Platform", "concrete_wall_003", scale=0.6, tint=(0.75, 0.73, 0.7, 1))
    Y.box("TramStop", (8, 1.4, 0.25), (-12, 3.2, 0.125), mat=plat_m, c=c)
    # props from Poly Haven
    try:
        crate = Y.import_gltf("wooden_crate_01", c)
        crate.location = (-18, -5.4, 0)
        Y.instance(crate, "Crate2", (-18.6, -5.2, 0.0), (0, 0, 0.4), c=c)
        Y.instance(crate, "Crate3", (9, 5.3, 0.0), (0, 0, 1.2), c=c)
        barrel = Y.import_gltf("wooden_barrels_01", c)
        barrel.location = (-40, 5.4, 0)
        bucket = Y.import_gltf("wooden_bucket_01", c)
        bucket.location = (-29.4, -5.3, 0)
        for i in range(4):
            Y.instance(bucket, f"Bucket{i}", (-30.5 + i * 0.35, -5.25, 0), (0, 0, i), c=c)
        bask = Y.import_gltf("wicker_basket_01", c)
        bask.location = (12.5, -5.6, 0)
    except Exception as e:
        print("prop import failed", e)
    # open field to the west-south (sweet potato field) beyond the last southern house
    field_m = Y.mat_pbr("M_Field", "brown_mud_dry", scale=0.25, tint=(0.55, 0.45, 0.35, 1))
    ground("Field", (70, 50), field_m, c, loc=(-112, -32, -0.02))
    ground("FieldE", (60, 60), field_m, c, loc=(55, -36, -0.02))
    leaf = leaf_cluster("PotatoLeaf", c)
    leaf.location = (0, 0, -50)
    scatter("Potato", leaf, c, (24, 80, -60, -8), 700, seed=3, rows=(26,), scale=(0.9, 1.6))
    # distant shipyard cranes and the sea to the south-west + mountains ring
    crane_m = Y.mat_basic("M_DistCrane", (0.18, 0.18, 0.2, 1), rough=0.8)
    for i, (x, y) in enumerate(((-260, -300), (-210, -330), (-320, -280))):
        Y.box(f"DistCraneTower{i}", (3, 3, 38), (x, y, 19), mat=crane_m, c=c)
        Y.box(f"DistCraneBoom{i}", (40, 2, 2), (x + 10, y, 38), mat=crane_m, c=c)
    sea = Y.mat_basic("M_SeaFar", (0.12, 0.2, 0.25, 1), rough=0.15)
    ground("SeaFar", (3000, 1500), sea, c, loc=(-400, -1100, -0.5))
    for i, (d, h, rot) in enumerate(((1400, 260, 0.3), (1600, 340, 1.9), (1500, 300, 3.6), (1700, 380, 5.0))):
        mt = A.mountains(f"Mountains{i}", dist=d, height=h, width=3200, seed=i + 7,
                         mat=Y.mat_basic("M_Hills", (0.2, 0.26, 0.22, 1), rough=0.95))
        mt.rotation_euler.z = rot
        mt.location = (math.sin(-rot) * d, math.cos(rot) * d, -5)
        Y.link_to(mt, c)
    # far city blocks to the north-east (towards the city centre) so the horizon is not empty
    blk_m = Y.mat_basic("M_FarRoofs", (0.12, 0.12, 0.14, 1), rough=0.8)
    blk = Y.box("FarBlock", (8, 8, 5), (0, 0, -40), mat=blk_m, c=c)
    rr = random.Random(5)
    for i in range(260):
        x, y = rr.uniform(80, 700), rr.uniform(20, 600)
        Y.instance(blk, f"FarBlock{i}", (x, y, 2.5), (0, 0, rr.uniform(0, 1)), (rr.uniform(0.6, 1.6), rr.uniform(0.6, 1.4), rr.uniform(0.6, 1.3)), c=c)
    return {"houses": houses, "walk_y": -3.2, "stop_x": -12}


# ------------------------------------------------------------------ smoke / dust sprites
def sprite_mat(name, idx=0, color=(0.6, 0.55, 0.5), alpha_mul=1.0, emit=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = 'BLENDED'
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(f"{TEX}/smoke_{idx % 6}.png", check_existing=True)
    t.extension = 'CLIP'
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Roughness"].default_value = 1
    if emit:
        bs.inputs["Emission Color"].default_value = (*color, 1)
        bs.inputs["Emission Strength"].default_value = emit
    mm = nt.nodes.new("ShaderNodeMath"); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = alpha_mul
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    mm2 = nt.nodes.new("ShaderNodeMath"); mm2.operation = 'MULTIPLY'
    nt.links.new(t.outputs["Alpha"], mm.inputs[0])
    nt.links.new(mm.outputs[0], mm2.inputs[0])
    nt.links.new(oi.outputs["Alpha"], mm2.inputs[1])     # per-object fade via object colour alpha
    nt.links.new(mm2.outputs[0], bs.inputs["Alpha"])
    nt.links.new(bs.outputs[0], out.inputs["Surface"])
    return m


def sprite(name, mat, loc, size, c, cam=None):
    o = plane(name, (size, size), loc, (math.pi / 2, 0, 0), mat=mat, c=c)
    if cam:
        con = o.constraints.new('TRACK_TO')
        con.target = cam
        con.track_axis = 'TRACK_Z'
        con.up_axis = 'UP_Y'
    o.color = (1, 1, 1, 1)
    return o


# ------------------------------------------------------------------ Mitsubishi Nagasaki shipyard design office
def drafting_table(name, c, bp_idx=1, rng=None):
    rng = rng or random.Random(1)
    wood = Y.mat_pbr("M_DeskWood", "fine_grained_wood", scale=1.2, tint=(0.55, 0.4, 0.28, 1))
    P = []
    for sx in (-0.62, 0.62):
        for sy in (-0.32, 0.32):
            P.append(Y.box(f"{name}_leg{sx}{sy}", (0.05, 0.05, 0.9), (sx, sy, 0.45), mat=wood))
    P.append(Y.box(f"{name}_rail", (1.3, 0.05, 0.06), (0, 0.32, 0.25), mat=wood))
    board = Y.box(f"{name}_board", (1.45, 0.95, 0.035), (0, 0, 0.98), (math.radians(-14), 0, 0), mat=wood, bevel=0.005)
    P.append(board)
    paper = plane(f"{name}_paper", (1.15, 0.8), (0, -0.005, 1.0), (math.radians(-14), 0, 0),
                  mat=img_mat(f"M_Blueprint{bp_idx}", f"{TEX}/blueprint_{bp_idx}.png", rough=0.85))
    # T-square / ruler
    ruler = Y.box(f"{name}_ruler", (1.2, 0.05, 0.008), (0.0, -0.1, 1.003), (math.radians(-14), 0, 0),
                  mat=Y.mat_basic("M_Ruler", (0.75, 0.62, 0.38, 1), rough=0.4))
    P.append(ruler)
    o = A._join(P, name)
    Y.link_to(o, c); Y.link_to(paper, c)
    paper.parent = o
    return o


def office(c, era="1945"):
    m = A.M()
    floor_m = Y.mat_pbr("M_OfficeFloor", "old_wooden_floor_02", scale=0.25, tint=(0.75, 0.6, 0.45, 1))
    wall_m = Y.mat_pbr("M_OfficeWall", "plastered_wall", scale=0.35, tint=(0.82, 0.78, 0.68, 1), dirt=0.25)
    wain_m = Y.mat_pbr("M_Wainscot", "dark_planks", scale=0.5, tint=(0.4, 0.3, 0.22, 1))
    beam_m = Y.mat_pbr("M_Beam", "japanese_cedar_planks", scale=0.4, tint=(0.35, 0.26, 0.2, 1))
    W, D, H = 18.0, 11.0, 4.2
    ground("OfficeFloor", (W, D), floor_m, c)
    # walls: north (back, y=+D/2), east, west solid; south (y=-D/2) with windows
    Y.box("WallN", (W, 0.2, H), (0, D / 2, H / 2), mat=wall_m, c=c)
    Y.box("WallE", (0.2, D, H), (W / 2, 0, H / 2), mat=wall_m, c=c)
    Y.box("WallW", (0.2, D, H), (-W / 2, 0, H / 2), mat=wall_m, c=c)
    for nm, sz, loc in (("WainN", (W, 0.05, 1.0), (0, D / 2 - 0.12, 0.5)), ("WainE", (0.05, D, 1.0), (W / 2 - 0.12, 0, 0.5)), ("WainW", (0.05, D, 1.0), (-W / 2 + 0.12, 0, 0.5))):
        Y.box(nm, sz, loc, mat=wain_m, c=c)
    Y.box("Ceiling", (W, D, 0.15), (0, 0, H + 0.075), mat=wall_m, c=c)
    for i in range(7):
        Y.box(f"Beam{i}", (0.25, D, 0.3), (-W / 2 + 1.5 + i * 2.5, 0, H - 0.15), mat=beam_m, c=c)
    # south wall with 6 tall windows
    win_w, win_h, sill = 1.8, 2.3, 0.95
    xs = [-7.5 + i * 3.0 for i in range(6)]
    y = -D / 2
    Y.box("WallS_low", (W, 0.25, sill), (0, y, sill / 2), mat=wall_m, c=c)
    Y.box("WallS_top", (W, 0.25, H - sill - win_h), (0, y, sill + win_h + (H - sill - win_h) / 2), mat=wall_m, c=c)
    edges = [-W / 2] + sum([[x - win_w / 2, x + win_w / 2] for x in xs], []) + [W / 2]
    for i in range(0, len(edges), 2):
        a, b = edges[i], edges[i + 1]
        Y.box(f"WallS_pier{i}", (b - a, 0.25, win_h), ((a + b) / 2, y, sill + win_h / 2), mat=wall_m, c=c)
    frame_m = Y.mat_basic("M_WinFrame", (0.28, 0.22, 0.16, 1), rough=0.6)
    glass_m = Y.mat_basic("M_OfficeGlass", (0.9, 0.95, 1.0, 1), rough=0.02, alpha=0.12)
    tape_m = m["tape"]
    windows = []
    for i, x in enumerate(xs):
        g = plane(f"Glass{i}", (win_w, win_h), (x, y, sill + win_h / 2), (math.pi / 2, 0, 0), mat=glass_m, c=c)
        windows.append(g)
        for k in range(1, 4):
            Y.box(f"WinMul{i}_{k}", (0.04, 0.06, win_h), (x - win_w / 2 + win_w * k / 4, y, sill + win_h / 2), mat=frame_m, c=c)
        for k in range(1, 3):
            Y.box(f"WinTr{i}_{k}", (win_w, 0.06, 0.04), (x, y, sill + win_h * k / 3), mat=frame_m, c=c)
        Y.box(f"WinFrame{i}", (win_w + 0.1, 0.1, 0.08), (x, y, sill), mat=frame_m, c=c)
        if era == "1945":
            for col in range(4):
                for row in range(3):
                    cx = x - win_w / 2 + win_w * (col + 0.5) / 4
                    cz = sill + win_h * (row + 0.5) / 3
                    pw, ph = win_w / 4, win_h / 3
                    dg = math.hypot(pw, ph); ang = math.atan2(ph, pw)
                    for sg in (1, -1):
                        Y.box(f"WTape{i}{col}{row}{sg}", (dg * 0.9, 0.005, 0.03), (cx, y - 0.04, cz), (0, sg * ang, 0), mat=tape_m, c=c)
    # outside: bright backdrop (harbour hills) seen through windows
    bd = Y.mat_basic("M_Backdrop", (0.55, 0.62, 0.62, 1), rough=1, emission=(0.75, 0.82, 0.85, 1), estr=1.2)
    plane("OutsideBackdrop", (60, 20), (0, -40, 6), (math.pi / 2, 0, 0), mat=bd, c=c)
    hills = A.mountains("OfficeHills", dist=-35, height=10, width=80, seed=4,
                        mat=Y.mat_basic("M_OfficeHillsMat", (0.25, 0.32, 0.28, 1), rough=1, emission=(0.3, 0.38, 0.35, 1), estr=0.8))
    Y.link_to(hills, c)
    hills.location = (0, -36, -2); hills.scale = (1, 0.05, 1)
    # drafting tables in 3 rows, facing south (windows)
    rng = random.Random(9)
    tables = []
    for r_, ty in enumerate((-1.6, 0.9, 3.4)):
        for k, tx in enumerate((-6.0, -3.0, 0.0, 3.0, 6.0)):
            if r_ == 0 and k == 4:
                continue  # space for the supervisor's desk
            t = drafting_table(f"Draft{r_}{k}", c, bp_idx=1 + (r_ * 5 + k) % 4, rng=rng)
            t.location = (tx, ty, 0)
            tables.append(t)
    # supervisor desk at front-right (south-east) facing north
    desk_anchor = Vector((6.0, -2.2, 0))
    try:
        desk = Y.import_gltf("WoodenTable_01", c)
        desk.location = desk_anchor
        chair = Y.import_gltf("WoodenChair_01", c)
        chair.location = desk_anchor + Vector((0, -0.75, 0)); chair.rotation_euler.z = 0
        lamp = Y.import_gltf("desk_lamp_arm_01", c)
        lamp.location = desk_anchor + Vector((0.45, 0.1, 0.76))
        notes = Y.import_gltf("office_notepads", c); notes.location = desk_anchor + Vector((-0.2, 0.0, 0.76))
        stat = Y.import_gltf("stationery_supplies", c); stat.location = desk_anchor + Vector((0.2, -0.1, 0.76))
        cw = Y.mat_pbr("M_CabWood", "dark_planks", scale=0.8, tint=(0.45, 0.33, 0.24, 1))
        for ci, cy in enumerate((1.2, 2.2, 3.2)):
            P = [Y.box(f"Cab{ci}", (0.6, 0.9, 1.5), (8.6, cy, 0.75), mat=cw, bevel=0.01)]
            for k in range(4):
                P.append(Y.box(f"Cab{ci}_dr{k}", (0.02, 0.8, 0.3), (8.29, cy, 0.25 + k * 0.36), mat=cw, bevel=0.005))
                P.append(Y.box(f"Cab{ci}_h{k}", (0.03, 0.12, 0.025), (8.27, cy, 0.3 + k * 0.36), mat=Y.mat_basic("M_Brass", (0.6, 0.45, 0.2, 1), rough=0.35, metal=1.0)))
            Y.link_to(A._join(P, f"FilingCabinet{ci}"), c)
        shelf = Y.import_gltf("wooden_bookshelf_worn", c); shelf.location = (-8.5, 2.0, 0); shelf.rotation_euler.z = -math.pi / 2
        binder = Y.import_gltf("binder_notebook", c); binder.location = desk_anchor + Vector((-0.45, 0.15, 0.76))
        hl = Y.import_gltf("hanging_industrial_lamp", c)
        hl.location = (-4.5, 0.5, H - 1.2)
        for i, (lx, ly) in enumerate(((-1.5, 0.5), (1.5, 0.5), (4.5, 0.5), (-4.5, 3.0), (-1.5, 3.0), (1.5, 3.0), (4.5, 3.0), (-4.5, -1.8), (-1.5, -1.8), (1.5, -1.8))):
            Y.instance(hl, f"HangLamp{i}", (lx, ly, H - 1.2), c=c)
        stool = Y.import_gltf("wooden_stool_02", c)
        stool.location = (0, 0, -20)
    except Exception as e:
        print("office props failed", e)
        stool = None
    # wall clock (custom face, hands set per shot)
    clock_face = Y.cyl("ClockBody", 0.24, 0.06, (0, D / 2 - 0.14, 3.05), (math.pi / 2, 0, 0), mat=Y.mat_basic("M_ClockWood", (0.25, 0.15, 0.08, 1), rough=0.4), c=c, verts=48)
    face = plane("ClockFace", (0.43, 0.43), (0, D / 2 - 0.175, 3.05), (math.pi / 2, 0, 0),
                 mat=img_mat("M_ClockFace", f"{TEX}/clock_face.png", rough=0.3, alpha=True), c=c)
    hands = {}
    hm = Y.mat_basic("M_ClockHand", (0.03, 0.03, 0.03, 1), rough=0.4)
    for nm, L, wdt in (("Hour", 0.11, 0.014), ("Minute", 0.17, 0.009), ("Second", 0.18, 0.003)):
        h = Y.box("ClockHand" + nm, (wdt, 0.004, L), (0, 0, L / 2 - 0.02), mat=hm, c=c)
        piv = bpy.data.objects.new("ClockPivot" + nm, None); c.objects.link(piv)
        piv.location = (0, D / 2 - 0.19 - (0.004 if nm == "Second" else 0.0), 3.05)
        h.parent = piv
        hands[nm] = piv
    return {"tables": tables, "desk": desk_anchor, "windows": windows, "xs": xs, "win_y": y, "sill": sill, "win_h": win_h,
            "hands": hands, "stool": stool, "W": W, "D": D, "H": H}


def set_clock(hands, hh, mm, ss=0):
    """Rotate hand pivots (rotation about -Y because the clock faces -Y)."""
    hands["Hour"].rotation_euler = (0, math.radians((hh % 12 + mm / 60) * 30), 0)
    hands["Minute"].rotation_euler = (0, math.radians(mm * 6 + ss * 0.1), 0)
    hands["Second"].rotation_euler = (0, math.radians(ss * 6), 0)


# ------------------------------------------------------------------ Yamaguchi family home, Nagasaki
def shoji(name, w, h, c, paper=True, torn=0.0, rng=None):
    rng = rng or random.Random(3)
    fr = Y.mat_pbr("M_ShojiFrame", "hinoki_planks", scale=2.0, tint=(0.62, 0.48, 0.34, 1))
    wm = img_mat("M_Washi", f"{TEX}/washi.png", rough=0.9)
    if "M_Washi" in bpy.data.materials:
        b = wm.node_tree.nodes["Principled BSDF"]
        b.inputs["Subsurface Weight"].default_value = 0.3
        b.inputs["Transmission Weight"].default_value = 0.35
    P = []
    P.append(Y.box(name + "_t", (w, 0.04, 0.04), (0, 0, h - 0.02), mat=fr))
    P.append(Y.box(name + "_b", (w, 0.04, 0.05), (0, 0, 0.025), mat=fr))
    P.append(Y.box(name + "_l", (0.04, 0.04, h), (-w / 2 + 0.02, 0, h / 2), mat=fr))
    P.append(Y.box(name + "_r", (0.04, 0.04, h), (w / 2 - 0.02, 0, h / 2), mat=fr))
    for k in range(1, 4):
        P.append(Y.box(name + f"_v{k}", (0.015, 0.03, h), (-w / 2 + w * k / 4, 0, h / 2), mat=fr))
    for k in range(1, 7):
        P.append(Y.box(name + f"_h{k}", (w, 0.03, 0.015), (0, 0, h * k / 7), mat=fr))
    o = A._join(P, name)
    Y.link_to(o, c)
    if paper:
        pp = plane(name + "_paper", (w - 0.04, h - 0.06), (0, 0.012, h / 2), (math.pi / 2, 0, 0), mat=wm, c=c)
        if torn > 0:
            bm = bmesh.new(); bm.from_mesh(pp.data)
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=8, use_grid_fill=True)
            kill = [f for f in bm.faces if rng.random() < torn]
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            bm.to_mesh(pp.data); bm.free()
        pp.parent = o
    return o


def home(c, state="intact"):
    """Small Nagasaki house: 6-mat room + genkan (entrance) + engawa to a garden. state: intact|damaged|later"""
    rng = random.Random(77)
    tat = img_mat("M_Tatami", f"{TEX}/tatami.png", rough=0.8)
    wood = Y.mat_pbr("M_HomeWood", "hinoki_planks", scale=0.8, tint=(0.62, 0.47, 0.33, 1))
    dark = Y.mat_pbr("M_HomeDark", "japanese_cedar_planks", scale=0.7, tint=(0.33, 0.24, 0.17, 1))
    wall = Y.mat_pbr("M_HomeWall", "plastered_wall", scale=0.5, tint=(0.78, 0.68, 0.52, 1), dirt=0.25 if state != "damaged" else 0.8)
    earth = Y.mat_pbr("M_Doma", "brown_mud_dry", scale=0.5, tint=(0.5, 0.42, 0.34, 1))
    FL = 0.45   # raised floor height above the earthen genkan
    # tatami room 3.6 x 2.7 m (6 mats of 0.9 x 1.8)
    for i in range(2):
        for j in range(3):
            t = plane(f"Tatami{i}{j}", (1.8, 0.9), (-0.9 + i * 1.8, -0.9 + j * 0.9, FL), (0, 0, 0), mat=tat, c=c)
            t.rotation_euler.z = 0 if (i + j) % 2 else 0.0
    Y.box("FloorBase", (3.8, 3.0, FL), (0, 0, FL / 2 - 0.01), mat=dark, c=c)
    # genkan (south side, y < -1.35): earthen floor + step
    ground("Doma", (3.8, 1.6), earth, c, loc=(0, -2.15, 0.0))
    Y.box("Kamachi", (3.8, 0.22, 0.1), (0, -1.46, FL - 0.05), mat=wood, c=c)
    Y.box("StepStone", (0.7, 0.4, 0.2), (-0.4, -1.75, 0.1), mat=Y.mat_pbr("M_StepStone", "japanese_stone_wall", scale=1, tint=(0.6, 0.6, 0.58, 1)), c=c)
    H = 2.5
    # walls: west plaster, north shoji/fusuma to garden (engawa), east tokonoma, genkan front door south
    Y.box("WallW", (0.12, 4.6, H + FL), (-1.95, -0.8, (H + FL) / 2), mat=wall, c=c)
    Y.box("WallE", (0.12, 4.6, H + FL), (1.95, -0.8, (H + FL) / 2), mat=wall, c=c)
    Y.box("Ceiling", (4.0, 4.8, 0.06), (0, -0.8, FL + H + 0.03), mat=wood, c=c)
    for i in range(9):
        Y.box(f"CeilBatten{i}", (0.03, 4.8, 0.03), (-1.9 + i * 0.475, -0.8, FL + H - 0.01), mat=dark, c=c)
    Y.box("Kamoi", (3.9, 0.12, 0.08), (0, 1.38, FL + 1.8), mat=wood, c=c)
    Y.box("Ranma", (3.9, 0.06, H - 1.84), (0, 1.38, FL + 1.84 + (H - 1.84) / 2), mat=wall, c=c)
    # garden side shoji (north)
    tornv = 0.25 if state == "damaged" else 0.0
    for k in range(4):
        sj = shoji(f"ShojiN{k}", 0.95, 1.8, c, torn=tornv, rng=rng)
        sj.location = (-1.45 + k * 0.97, 1.36, FL)
        if state == "damaged" and k == 2:
            sj.rotation_euler = (math.radians(-35), 0, math.radians(8))
            sj.location = (-1.45 + k * 0.97, 1.0, FL + 0.1)
    # engawa + garden beyond
    Y.box("Engawa", (4.0, 0.9, 0.06), (0, 1.85, FL - 0.03), mat=wood, c=c)
    ground("Garden", (30, 20), Y.mat_pbr("M_GardenGround", "forrest_ground_01" if False else "gravel_floor", scale=0.4, tint=(0.55, 0.55, 0.48, 1)), c, loc=(0, 12, -0.02))
    try:
        sh = Y.import_gltf("shrub_02", c); sh.location = (-1.5, 3.4, 0)
        Y.instance(sh, "Shrub3", (2.6, 5.5, 0), (0, 0, 2.2), 1.6, c)
        Y.instance(sh, "Shrub2", (1.0, 3.8, 0), (0, 0, 1.2), 0.8, c)
    except Exception as e:
        print("garden failed", e)
    Y.box("GardenWall", (30, 0.3, 1.8), (0, 8.0, 0.9), mat=Y.mat_pbr("M_GardenWall", "plastered_wall", scale=0.5, tint=(0.7, 0.66, 0.58, 1)), c=c)
    # tokonoma alcove on the east wall with a hanging scroll (ink landscape, no text) and vase
    Y.box("TokoBase", (0.6, 1.4, 0.1), (1.6, 0.3, FL + 0.05), mat=Y.mat_pbr("M_Toko", "fine_grained_wood", scale=1, tint=(0.5, 0.36, 0.24, 1)), c=c)
    Y.box("TokoPost", (0.1, 0.1, H), (1.3, -0.4, FL + H / 2), mat=Y.mat_pbr("M_TokoPost", "bark_brown_01" if False else "dark_planks", scale=2, tint=(0.4, 0.3, 0.2, 1)), c=c)
    scroll = plane("Scroll", (0.45, 1.2), (1.88, 0.3, FL + 1.25), (math.pi / 2, 0, -math.pi / 2),
                   mat=img_mat("M_Scroll", f"{TEX}/washi.png", rough=0.9), c=c)
    try:
        vase = Y.import_gltf("ceramic_vase_01", c) if False else None
    except Exception:
        vase = None
    # genkan sliding door (glass lattice) on the south wall
    Y.box("WallS_L", (1.4, 0.12, H + FL), (-1.25, -2.95, (H + FL) / 2), mat=wall, c=c)
    Y.box("WallS_R", (1.0, 0.12, H + FL), (1.45, -2.95, (H + FL) / 2), mat=wall, c=c)
    Y.box("WallS_T", (1.4, 0.12, 0.6), (0.25, -2.95, 2.0 + 0.3 + 0.35), mat=wall, c=c)
    door = shoji("GenkanDoor", 0.75, 2.0, c, paper=False)
    door.location = (-0.15, -2.95, 0)
    dglass = Y.mat_basic("M_DoorGlass", (0.8, 0.85, 0.85, 1), rough=0.05, alpha=0.15)
    plane("GenkanDoorGlass", (0.72, 1.95), (-0.15, -2.95, 1.0), (math.pi / 2, 0, 0), mat=dglass, c=c)
    ground("Street", (30, 20), Y.mat_pbr("M_HomeStreet", "raked_dirt", scale=0.2, tint=(0.7, 0.62, 0.52, 1)), c, loc=(0, -13, -0.01))
    # furniture: round chabudai, zabuton, tea set
    tw = Y.mat_pbr("M_Chabudai", "fine_grained_wood", scale=1.5, tint=(0.45, 0.28, 0.18, 1))
    top = Y.cyl("ChabudaiTop", 0.42, 0.03, (-0.3, 0.2, FL + 0.31), mat=tw, c=c, verts=40)
    for k in range(4):
        a = k * math.pi / 2 + 0.6
        Y.box(f"ChabudaiLeg{k}", (0.04, 0.04, 0.29), (-0.3 + 0.28 * math.cos(a), 0.2 + 0.28 * math.sin(a), FL + 0.145), mat=tw, c=c)
    zm = Y.mat_basic("M_Zabuton", (0.24, 0.12, 0.1, 1), rough=0.95)
    for k, (x, y) in enumerate(((-0.95, 0.2), (0.35, 0.2), (-0.3, 0.85))):
        z = Y.box(f"Zabuton{k}", (0.52, 0.55, 0.07), (x, y, FL + 0.035), mat=zm, c=c, bevel=0.03)
    try:
        tea = Y.import_gltf("tea_set_01", c); tea.location = (-0.3, 0.2, FL + 0.325); tea.scale = (0.9, 0.9, 0.9)
    except Exception as e:
        print("tea failed", e)
    if state == "damaged":
        # fallen plaster, scattered debris, broken roof light shafts
        deb = Y.mat_pbr("M_Debris", "concrete_debris", scale=1.0, tint=(0.6, 0.55, 0.5, 1))
        for i in range(60):
            Y.box(f"Debris{i}", (rng.uniform(0.05, 0.3), rng.uniform(0.05, 0.25), rng.uniform(0.02, 0.08)),
                  (rng.uniform(-1.8, 1.8), rng.uniform(-1.3, 1.3), FL + 0.03), (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 6)), mat=deb, c=c)
        for i in range(8):
            Y.box(f"Beam{i}", (0.1, rng.uniform(1.0, 2.5), 0.1), (rng.uniform(-1.5, 1.5), rng.uniform(-1.0, 1.0), FL + 0.06),
                  (rng.uniform(-0.2, 0.2), 0, rng.uniform(0, 3)), mat=dark, c=c)
        bpy.data.objects["Ceiling"].rotation_euler = (0.04, -0.02, 0)
    return {"FL": FL, "door": Vector((-0.15, -2.95, 0)), "table": Vector((-0.3, 0.2, FL)), "kamachi": Vector((0, -1.46, FL))}


# ------------------------------------------------------------------ city vistas at 1:100 scale (1 unit = 100 m)
def vista(c, city="hiro", f0=1, f1=100, cloud=True, cloud_stage=(0.6, 1.0), ruined=True):
    import fx
    rng = random.Random(1945 if city == "hiro" else 1909)
    if city == "hiro":
        # flat delta with rivers, ringed by hills; viewed from the south-west
        ground("Delta", (300, 300), Y.mat_pbr("M_DeltaAsh", "burned_ground_01" if ruined else "brown_mud_dry", scale=1.5, tint=(0.5, 0.42, 0.36, 1)), c)
        rv = Y.mat_basic("M_River", (0.05, 0.07, 0.08, 1), rough=0.15)
        for i, (x, w) in enumerate(((-12, 0.9), (-4, 0.7), (5, 1.0), (14, 0.8), (24, 0.9))):
            r = plane(f"River{i}", (w, 70), (x, 35, 0.02), (0, 0, 0.12 * (i - 2)), mat=rv, c=c)
        # rubble field: merged boxes (one object) — low silhouettes of destroyed buildings
        bm_ = bmesh.new()
        for i in range(2600):
            x, y = rng.uniform(-30, 40), rng.uniform(-10, 45)
            d = math.hypot(x - 5, y - 18)
            hgt = rng.uniform(0.02, 0.08) if d < 18 else rng.uniform(0.05, 0.2)
            bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((x, y, hgt / 2)) @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z') @ Matrix.Diagonal((rng.uniform(0.15, 0.5), rng.uniform(0.15, 0.5), hgt, 1)))
        me = bpy.data.meshes.new("Rubble"); bm_.to_mesh(me); bm_.free()
        rub = bpy.data.objects.new("Rubble", me); c.objects.link(rub)
        Y.assign(rub, Y.mat_basic("M_Rubble", (0.14, 0.12, 0.11, 1), rough=0.9))
        # the Industrial Promotion Hall skeleton (now the Atomic Bomb Dome), ~160 m from the hypocentre
        hall_m = Y.mat_basic("M_HallRuin", (0.32, 0.29, 0.26, 1), rough=0.8)
        hx, hy = 4.0, 18.5
        Y.box("HallBase", (0.35, 0.3, 0.17), (hx, hy, 0.085), mat=hall_m, c=c)
        for k in range(10):
            a = k * math.pi / 5
            Y.box(f"DomeRib{k}", (0.012, 0.012, 0.12), (hx + 0.07 * math.cos(a), hy + 0.07 * math.sin(a), 0.22), (0.5 * math.sin(a), -0.5 * math.cos(a), 0), mat=hall_m, c=c)
        hills = [(0, 120, 6, 0.0), (-75, 90, 5, 0.6), (75, 100, 6.5, -0.5), (-120, 40, 4, 1.2), (120, 60, 5, -1.1), (35, 140, 7, 0.2)]
        cloud_base = (5, 18, 0)
        cam_hint = ((-48, -62, 4.0), (5, 18, 52))
    else:
        # Nagasaki: harbour in the foreground, the Urakami valley beyond the ridge to the north
        ground("HarbourWater", (300, 120), Y.mat_basic("M_Harbour", (0.08, 0.13, 0.15, 1), rough=0.05), c, loc=(0, -40, 0))
        land = ground("Land", (300, 200), Y.mat_pbr("M_NagaLand", "forrest_ground_01" if False else "brown_mud_dry", scale=1.5, tint=(0.35, 0.36, 0.3, 1)), c, loc=(0, 80, 0.05))
        hills = [(-14, 16, 3.0, 0.2), (16, 20, 2.6, -0.3), (-32, 30, 3.6, 0.5), (0, 60, 4.5, 0.0), (36, 42, 3.8, -0.6)]
        # shipyard: cantilever crane silhouette and hull block on the south shore (foreground)
        cm = Y.mat_basic("M_ShipyardDark", (0.05, 0.05, 0.06, 1), rough=0.8)
        Y.box("CraneTower", (0.12, 0.12, 0.4), (-6, -6, 0.2), mat=cm, c=c)
        Y.box("CraneBoom", (0.75, 0.05, 0.05), (-5.9, -6, 0.42), mat=cm, c=c)
        Y.box("Hull", (1.6, 0.3, 0.18), (-3.5, -6.5, 0.09), mat=cm, c=c)
        bm_ = bmesh.new()
        for i in range(900):
            x, y = rng.uniform(-20, 20), rng.uniform(-4, 14)
            hgt = rng.uniform(0.04, 0.12)
            bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((x, y, 0.05 + hgt / 2)) @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z') @ Matrix.Diagonal((rng.uniform(0.1, 0.3), rng.uniform(0.1, 0.3), hgt, 1)))
        me = bpy.data.meshes.new("Town"); bm_.to_mesh(me); bm_.free()
        town = bpy.data.objects.new("Town", me); c.objects.link(town)
        Y.assign(town, Y.mat_basic("M_TownRoofs", (0.12, 0.12, 0.13, 1), rough=0.8))
        cloud_base = (2, 30, 0)
        cam_hint = ((-22, -52, 1.5), (2, 30, 48))
    hm = Y.mat_basic("M_VistaHills", (0.18, 0.22, 0.18, 1), rough=1.0)
    for i, (x, y, h, rot) in enumerate(hills):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(x, y, 0))
        o = bpy.context.active_object; o.name = f"VHill{i}"
        o.scale = (h * 2.6, h * 1.6, h); o.rotation_euler.z = rot
        tx = bpy.data.textures.new(f"VHillN{i}", 'CLOUDS'); tx.noise_scale = 0.4
        md = o.modifiers.new("d", 'DISPLACE'); md.texture = tx; md.strength = h * 0.25
        Y.assign(o, hm); Y.smooth(o); Y.link_to(o, c)
    if cloud:
        fx.mushroom_cloud("Cloud_" + city, c, cloud_base, height=90 if city == "hiro" else 80, cap_r=24, stem_r=4.2,
                          f0=f0, f1=f1, grow=cloud_stage, glow=0.35)
    return {"cam_hint": cam_hint, "cloud_base": cloud_base}


# ------------------------------------------------------------------ field ruins (S07) and night ruins (S09)
def hiro_ruins(c, night=False):
    import fx
    m = A.M()
    rng = random.Random(806)
    field_m = Y.mat_pbr("M_FieldAsh", "brown_mud_dry", scale=0.3, tint=(0.4, 0.33, 0.27, 1), dirt=0.6)
    ground("RuinField", (120, 120), field_m, c)
    leaf = leaf_cluster("PotatoLeafR", c, col=(0.12, 0.13, 0.05))
    leaf.location = (0, 0, -50)
    scatter("PotatoR", leaf, c, (-14, 14, -10, 12), 420, seed=8, rows=(20,), scale=(0.8, 1.5))
    # damaged houses along the field edge (north) and debris
    for i in range(7):
        w = rng.uniform(4.5, 6.5)
        h = A.machiya(f"RuinHouse{i}", w=w, d=8, floors=rng.choice((1, 2)), rng=rng, mats=m, tape=False, damaged=1.0)
        h.location = (-18 + i * 6.2, 15 + rng.uniform(-0.5, 1.5), -rng.uniform(0.2, 1.5))
        h.rotation_euler = (rng.uniform(-0.15, 0.15), rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.2))
        Y.link_to(h, c)
    deb = Y.mat_pbr("M_RuinDebris", "dark_planks", scale=1.0, tint=(0.25, 0.2, 0.17, 1))
    tile = m["ridge"]
    bm_ = bmesh.new()
    for i in range(500):
        x, y = rng.uniform(-20, 20), rng.uniform(4, 18)
        bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((x, y, 0.03)) @ Matrix.Rotation(rng.uniform(0, 3), 4, 'Z') @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, 'X') @ Matrix.Diagonal((rng.uniform(0.1, 1.6), rng.uniform(0.05, 0.2), rng.uniform(0.03, 0.12), 1)))
    me = bpy.data.meshes.new("RuinDebris"); bm_.to_mesh(me); bm_.free()
    o = bpy.data.objects.new("RuinDebris", me); c.objects.link(o); Y.assign(o, deb)
    for i in range(14):
        p_ = A.utility_pole(f"BrokenPole{i}", rng.uniform(3, 7))
        p_.location = (rng.uniform(-20, 20), rng.uniform(6, 18), 0)
        p_.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3))
        Y.link_to(p_, c)
    fires = []
    for i in range(6 if not night else 14):
        loc = (rng.uniform(-18, 18), rng.uniform(12, 30), 0.6)
        fires.append(loc)
    return {"fires": fires, "field": Vector((0, 0, 0))}


# ------------------------------------------------------------------ station (S10)
def station(c):
    rng = random.Random(10)
    plat_m = Y.mat_pbr("M_StationPlatform", "concrete_wall_003", scale=0.4, tint=(0.6, 0.58, 0.55, 1), dirt=0.6)
    ground("StationGround", (300, 60), Y.mat_pbr("M_Ballast", "gravel_floor", scale=0.4, tint=(0.45, 0.42, 0.4, 1)), c)
    Y.box("Platform", (120, 6, 0.9), (0, 4.2, 0.45), mat=plat_m, c=c)
    rail = Y.mat_basic("M_StRail", (0.25, 0.22, 0.2, 1), rough=0.35, metal=0.9)
    for yy in (-0.533, 0.533):
        Y.box(f"StRail{yy}", (300, 0.07, 0.15), (0, yy, 0.22), mat=rail, c=c)
    sl = Y.box("StSleeper0", (0.24, 2.0, 0.15), (-150, 0, 0.075), mat=Y.mat_pbr("M_StSleeper", "dark_planks", scale=1, tint=(0.3, 0.26, 0.22, 1)), c=c)
    bm_ = bmesh.new()
    for i in range(0, 470):
        bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((-150 + i * 0.64, 0, 0.075)) @ Matrix.Diagonal((0.24, 2.0, 0.15, 1)))
    me = bpy.data.meshes.new("StSleepers"); bm_.to_mesh(me); bm_.free()
    o = bpy.data.objects.new("StSleepers", me); c.objects.link(o); Y.assign(o, sl.data.materials[0])
    bpy.data.objects.remove(sl)
    # timber canopy on posts
    wood = Y.mat_pbr("M_CanopyWood", "dark_planks", scale=0.6, tint=(0.38, 0.3, 0.24, 1))
    roof = Y.mat_pbr("M_CanopyRoof", "corrugated_iron" if False else "green_metal_rust", scale=0.5, tint=(0.4, 0.38, 0.35, 1))
    for i in range(12):
        Y.box(f"CanopyPost{i}", (0.2, 0.2, 3.2), (-30 + i * 5.5, 5.6, 0.9 + 1.6), mat=wood, c=c)
    cr = Y.box("CanopyRoof", (64, 5.5, 0.12), (0, 4.6, 4.2), (math.radians(-6), 0, 0), mat=roof, c=c)
    # station building wall behind the platform
    Y.box("StationWall", (70, 0.3, 4.5), (0, 7.4, 0.9 + 2.25), mat=Y.mat_pbr("M_StationWall", "plastered_wall", scale=0.4, tint=(0.62, 0.56, 0.48, 1), dirt=0.8), c=c)
    for i in range(10):
        Y.box(f"StationWin{i}", (1.4, 0.05, 1.6), (-27 + i * 6, 7.24, 2.6), mat=Y.mat_basic("M_StationWin", (0.05, 0.05, 0.05, 1), rough=0.2), c=c)
    try:
        crate = Y.import_gltf("wooden_crate_02", c); crate.location = (6, 5.0, 0.9)
        Y.instance(crate, "StCrate2", (6.8, 5.3, 0.9), (0, 0, 0.5), c=c)
    except Exception as e:
        print("station props", e)
    # train: D51-style loco + three coaches on the track at y=0
    loco = V.build_locomotive(c, "D51")
    coaches = []
    for i in range(3):
        co = V.build_coach(c, f"Coach{i}")
        co.location = (-21 - i * 20.2, 0, 0.35)
        coaches.append(co)
    loco.location = (0, 0, 0.35)
    train = bpy.data.objects.new("Train", None); c.objects.link(train)
    loco.parent = train
    for co in coaches:
        co.parent = train
    for i, (d, h) in enumerate(((600, 120), (700, 160))):
        mt = A.mountains(f"StMount{i}", dist=d, height=h, width=2400, seed=20 + i, mat=Y.mat_basic("M_StHills", (0.22, 0.26, 0.22, 1), rough=1))
        Y.link_to(mt, c)
    return {"train": train, "loco": loco, "platform_z": 0.9}


# ------------------------------------------------------------------ Nagasaki harbour road (S11, S19, S20)
def naga_harbor(c, mode="day"):
    m = A.M()
    rng = random.Random(1909)
    road = Y.mat_pbr("M_QuayRoad", "raked_dirt", scale=0.2, tint=(0.62, 0.56, 0.48, 1))
    ground("QuayRoad", (200, 14), road, c, loc=(0, 4, 0))
    Y.box("QuayEdge", (200, 1.0, 1.4), (0, -3.5, -0.6), mat=Y.mat_pbr("M_QuayStone", "japanese_stone_wall", scale=0.5, tint=(0.6, 0.6, 0.58, 1)), c=c)
    if mode == "lanterns":
        water = Y.mat_basic("M_NightWater", (0.01, 0.015, 0.02, 1), rough=0.03)
    else:
        water = Y.mat_basic("M_HarbourWater", (0.06, 0.11, 0.13, 1), rough=0.04)
    wt = ground("Water", (1200, 900), water, c, subdiv=6, noise=0.25, loc=(0, -460, -0.8))
    rail = Y.mat_pbr("M_QuayRail", "dark_planks", scale=1, tint=(0.3, 0.26, 0.22, 1))
    for i in range(40):
        Y.box(f"Bollard{i}", (0.25, 0.25, 0.7), (-50 + i * 2.5, -2.8, 0.35), mat=rail, c=c)
    Y.box("RailBar", (100, 0.08, 0.08), (0, -2.8, 0.68), mat=rail, c=c)
    # houses across the road climbing the hillside
    for row in range(5):
        x = -50
        while x < 50:
            w = rng.uniform(4.5, 6.5)
            h = A.machiya(f"NHouse{row}_{x:.0f}", w=w, d=7, floors=2 if rng.random() < 0.6 else 1, rng=rng, mats=m, shop=(row == 0 and rng.random() < 0.3), tape=(mode != "later"))
            h.location = (x + w / 2, 11.5 + row * 9, row * 4.5)
            Y.link_to(h, c)
            x += w + rng.uniform(0.3, 2.5)
    hill = ground("NHill", (220, 200), Y.mat_pbr("M_NHill", "brown_mud_dry", scale=0.2, tint=(0.3, 0.34, 0.25, 1)), c, loc=(0, 110, 0))
    hill.rotation_euler.x = math.radians(26)
    hill.location = (0, 108, 45)
    for i in range(5):
        mt = A.mountains(f"NMount{i}", dist=700 + i * 150, height=180 + i * 30, width=2600, seed=40 + i,
                         mat=Y.mat_basic("M_NMount", (0.17, 0.22, 0.17, 1), rough=1))
        mt.rotation_euler.z = [0, 0.6, -0.6, 2.6, -2.6][i]
        Y.link_to(mt, c)
    # Mitsubishi shipyard across the water: giant cantilever crane (1909) and a tanker hull
    crane = V.build_hammerhead_crane(c)
    crane.location = (-120, -260, 0)
    crane.rotation_euler.z = 0.4
    hullm = Y.mat_basic("M_HullRed", (0.22, 0.07, 0.05, 1), rough=0.6)
    if mode == "day":
        Y.box("TankerHull", (90, 14, 12), (-60, -280, 4), mat=hullm, c=c, bevel=1.5)
        Y.box("ShipyardShed", (80, 30, 18), (40, -300, 9), mat=Y.mat_basic("M_Shed", (0.25, 0.25, 0.27, 1), rough=0.8), c=c)
    return {"walk_y": 1.5, "rail_y": -2.4}


# ------------------------------------------------------------------ UN hall (S17)
def un_hall(c):
    floor = Y.mat_basic("M_UNFloor", (0.08, 0.07, 0.07, 1), rough=0.4)
    ground("UNFloor", (40, 40), floor, c)
    back = Y.mat_basic("M_UNBack", (0.05, 0.12, 0.22, 1), rough=0.7)
    Y.box("UNBackdrop", (30, 0.3, 10), (0, 6, 5), mat=back, c=c)
    pod_m = Y.mat_pbr("M_Podium", "fine_grained_wood", scale=1.0, tint=(0.45, 0.32, 0.22, 1))
    Y.box("Stage", (14, 6, 0.6), (0, 3, 0.3), mat=floor, c=c)
    Y.box("Podium", (0.8, 0.55, 1.15), (0, 1.0, 0.6 + 0.575), mat=pod_m, c=c, bevel=0.02)
    Y.box("PodiumTop", (0.9, 0.65, 0.05), (0, 1.0, 0.6 + 1.17), (math.radians(-12), 0, 0), mat=pod_m, c=c)
    mic = Y.cyl("MicStem", 0.008, 0.35, (0, 0.82, 0.6 + 1.32), (math.radians(30), 0, 0), mat=Y.mat_basic("M_Mic", (0.05, 0.05, 0.05, 1), rough=0.3, metal=0.8), c=c, verts=8)
    Y.cyl("MicHead", 0.02, 0.06, (0, 0.73, 0.6 + 1.47), (math.radians(30), 0, 0), mat=Y.mat_basic("M_Mic", (0.05, 0.05, 0.05, 1)), c=c, verts=12)
    # audience silhouettes: simple seated figures in rows (heads and shoulders)
    sil = Y.mat_basic("M_Silhouette", (0.02, 0.02, 0.025, 1), rough=0.8)
    bm_ = bmesh.new()
    rng = random.Random(17)
    for r in range(6):
        for k in range(14):
            x = -9 + k * 1.35 + rng.uniform(-0.15, 0.15)
            y = -3 - r * 1.3
            z0 = 0.0 + r * 0.25
            bmesh.ops.create_uvsphere(bm_, u_segments=12, v_segments=8, radius=0.11, matrix=Matrix.Translation((x, y, z0 + 1.22)))
            bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((x, y, z0 + 0.85)) @ Matrix.Diagonal((0.44, 0.25, 0.55, 1)))
            bmesh.ops.create_cube(bm_, size=1, matrix=Matrix.Translation((x, y - 0.1, z0 + 0.45)) @ Matrix.Diagonal((0.5, 0.5, 0.9, 1)))
    me = bpy.data.meshes.new("Audience"); bm_.to_mesh(me); bm_.free()
    o = bpy.data.objects.new("Audience", me); c.objects.link(o); Y.assign(o, sil); Y.smooth(o, 30)
    return {"podium": Vector((0, 1.55, 0.6))}


def lantern(name, c, i=0):
    """Floating toro-nagashi lantern: wooden base, washi sides glowing from a candle."""
    wood = Y.mat_basic("M_LanternWood", (0.2, 0.13, 0.08, 1), rough=0.7)
    pm = bpy.data.materials.get("M_LanternPaper")
    if not pm:
        pm = Y.mat_basic("M_LanternPaper", (0.95, 0.85, 0.62, 1), rough=0.9, emission=(1.0, 0.55, 0.2, 1), estr=14)
    P = [Y.box(name + "_base", (0.32, 0.32, 0.05), (0, 0, 0.025), mat=wood)]
    P.append(Y.box(name + "_paper", (0.27, 0.27, 0.3), (0, 0, 0.2), mat=pm))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(Y.box(name + f"_post{sx}{sy}", (0.02, 0.02, 0.32), (sx * 0.135, sy * 0.135, 0.2), mat=wood))
    P.append(Y.box(name + "_top", (0.3, 0.3, 0.02), (0, 0, 0.36), mat=wood))
    o = A._join(P, name)
    Y.link_to(o, c)
    return o
