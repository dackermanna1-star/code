"""Emergency foil blanket: a crumpled sheet wrapped round Leo's shoulders, upper arms and back, open down the front.

Built parametrically in the rig's rest pose: for a stack of heights, a ring that encloses his work suit
(torso + upper arms) is measured, pushed out a few centimetres and crumpled, and the rings are joined into one
smooth sheet with a V-shaped opening at the front. Bone weights come from the nearest work-suit vertices, so it
deforms with every pose. (The first version was cut out of the MakeHuman body, whose built-in clothing-helper
geometry survived the cut and turned the blanket into a lumpy skirt with holes.)
"""
import bpy, bmesh, math
from mathutils import Vector, kdtree, noise

TORSO = ("spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "neck_01", "upperarm_l", "upperarm_r", "pelvis")
Z0, Z1, DZ = 0.86, 1.555, 0.022   # hem ... collar, ring spacing (m, rest pose)
NA = 96                           # samples round each ring
OFFSET = 0.028                    # stand-off from the clothes


def _sources(src):
    gname = {g.index: g.name for g in src.vertex_groups}
    pts = []
    for v in src.data.vertices:
        w = {gname[g.group]: g.weight for g in v.groups if g.group in gname}
        if not w: continue
        dom = max(w, key=w.get)
        if dom in TORSO and Z0 - 0.05 < v.co.z < Z1 + 0.03:
            tot = sum(w.values())
            pts.append((v.co.copy(), {k: x / tot for k, x in w.items()}))
    return pts


def build_foil_blanket(src_name="Leo.male_worksuit01", name="FoilBlanket", material=None):
    src = bpy.data.objects[src_name]
    pts = _sources(src)
    nz = int(round((Z1 - Z0) / DZ)) + 1
    zs = [Z0 + i * (Z1 - Z0) / (nz - 1) for i in range(nz)]
    # ring centre and radius profile (support function of the slab's points)
    rings = []
    for z in zs:
        sl = [p for p, _ in pts if abs(p.z - z) < DZ * 0.9]
        cy = sum(p.y for p in sl) / len(sl)
        c = Vector((0.0, cy))
        r = []
        for k in range(NA):
            a = 2 * math.pi * k / NA; u = Vector((math.cos(a), math.sin(a)))
            r.append(max((Vector((p.x, p.y)) - c).dot(u) for p in sl))
        rings.append([c, r])
    # smooth round each ring and between rings; below the widest point let it hang rather than cling
    for ring in rings:
        r = ring[1]
        for _ in range(3):
            r[:] = [(r[k - 1] + 2 * r[k] + r[(k + 1) % NA]) / 4 for k in range(NA)]
    for _ in range(2):
        rs = [ring[1][:] for ring in rings]
        for i in range(1, nz - 1):
            rings[i][1] = [(rs[i - 1][k] + 2 * rs[i][k] + rs[i + 1][k]) / 4 for k in range(NA)]
    for i in range(nz - 2, -1, -1):
        rings[i][1] = [max(rings[i][1][k], 0.9 * rings[i + 1][1][k]) for k in range(NA)]

    # front opening (front = -Y): narrow at the collar, falling open towards the hem
    def is_open(k, z):
        a = math.degrees(2 * math.pi * k / NA) % 360.0
        d = abs(((a - 270.0) + 180.0) % 360.0 - 180.0)
        return d < 5.0 + 26.0 * max(0.0, (1.44 - z) / (1.44 - Z0))

    bm = bmesh.new(); grid = {}
    for i, z in enumerate(zs):
        c, r = rings[i]
        for k in range(NA):
            a = 2 * math.pi * k / NA
            q = Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, z))
            crumple = 0.011 * noise.noise(q * 9.0) + 0.005 * noise.noise(q * 23.0 + Vector((3.1, 0.0, 0.0)))
            rad = r[k] + OFFSET + 0.004 + crumple
            grid[i, k] = bm.verts.new((c.x + rad * math.cos(a), c.y + rad * math.sin(a), z))
    for i in range(nz - 1):
        for k in range(NA):
            k2 = (k + 1) % NA
            if is_open(k, zs[i]) or is_open(k2, zs[i]): continue
            bm.faces.new((grid[i, k], grid[i, k2], grid[i + 1, k2], grid[i + 1, k]))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True

    old = bpy.data.objects.get(name)
    if old is None:
        bl = bpy.data.objects.new(name, me)
        (bpy.data.collections.get("PROPS") or bpy.context.scene.collection).objects.link(bl)
        bl.parent = src.parent; bl.matrix_parent_inverse = src.matrix_parent_inverse.copy()
        arm = bl.modifiers.new("Armature", "ARMATURE"); arm.object = src.parent
        sub = bl.modifiers.new("Subdivision", "SUBSURF"); sub.levels = 1; sub.render_levels = 1
        sol = bl.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.004
    else:
        bl = old; om = bl.data; bl.data = me
        if om.users == 0: bpy.data.meshes.remove(om)
    for g in list(bl.vertex_groups): bl.vertex_groups.remove(g)
    groups = {}
    # bone weights: inverse-distance blend of the nearest work-suit vertices
    kd = kdtree.KDTree(len(pts))
    for i, (p, _) in enumerate(pts): kd.insert(p, i)
    kd.balance()
    for v in me.vertices:
        acc = {}
        for _, idx, dist in kd.find_n(v.co, 8):
            wi = 1.0 / max(dist, 1e-3) ** 2
            for gn, x in pts[idx][1].items(): acc[gn] = acc.get(gn, 0.0) + wi * x
        tot = sum(acc.values())
        for gn, x in acc.items():
            if x / tot < 0.02: continue
            if gn not in groups: groups[gn] = bl.vertex_groups.new(name=gn)
            groups[gn].add([v.index], x / tot, "REPLACE")
    mat = material or bpy.data.materials.get("M_FoilBlanket")
    if mat: me.materials.append(mat)
    print("FOIL BLANKET verts", len(me.vertices), "faces", len(me.polygons))
    return bl
