"""Paris-CDG Terminal 1 inspired concourse (late-1980s), built procedurally.
Layout (meters): concourse along X (-30..30). Glass facade at y=-8 looking onto the apron,
back wall at y=+9 with check-in desks, shops and the departure board. Nasseri's red bench at (0, 2).
Restroom set at x=+80, 'memory' void set at x=-80, immigration booth set at x=+80,y=+40.
"""
import bpy, math, random, sys
sys.path.insert(0, '/opt/work/scripts')
from props import *
from mathutils import Vector

rnd = random.Random(7)
H = 4.6          # ceiling height
Y0, Y1 = -8.0, 9.0
X0, X1 = -32.0, 32.0

def build_materials():
    M = {}
    M['floor'] = mat_tex('Floor_Tiles', 'large_grey_tiles', scale=0.5, tint=(0.78, 0.78, 0.79), rough_mul=0.45, rough_add=0.06, nor=0.5, sat=0.35)
    M['wall'] = mat_tex('Wall_Concrete', 'brushed_concrete', scale=0.3, tint=(0.82, 0.82, 0.82), nor=0.8, sat=0.15)
    M['ceil'] = mat_tex('Ceil_Concrete', 'brushed_concrete', scale=0.25, tint=(0.95, 0.95, 0.95), nor=0.4, sat=0.05, val=1.15)
    M['beam'] = mat_tex('Beam_Concrete', 'brushed_concrete', scale=0.5, tint=(0.88, 0.88, 0.88), nor=0.8, sat=0.08, val=1.1)
    M['tarmac'] = mat_tex('Tarmac', 'asphalt_02', scale=0.08, tint=(0.55, 0.55, 0.55), nor=0.3)
    M['tiles_w'] = mat_tex('WhiteTiles', 'long_white_tiles', scale=0.8, tint=(0.95, 0.96, 0.97), rough_mul=0.3, nor=0.6)
    M['metal'] = mat_color('BrushedMetal', (0.62, 0.63, 0.65), rough=0.32, metal=1.0)
    M['dark_metal'] = mat_color('DarkMetal', (0.08, 0.085, 0.09), rough=0.4, metal=0.8)
    M['red_seat'] = mat_color('RedSeatPlastic', (0.55, 0.035, 0.03), rough=0.28, coat=0.3)
    M['black_seat'] = mat_color('BlackSeatPlastic', (0.03, 0.03, 0.035), rough=0.35, coat=0.2)
    M['orange_seat'] = mat_color('OrangeSeatPlastic', (0.65, 0.22, 0.03), rough=0.3, coat=0.2)
    M['desk'] = mat_color('DeskLaminate', (0.78, 0.76, 0.72), rough=0.35)
    M['desk_front'] = mat_color('DeskFront', (0.13, 0.20, 0.34), rough=0.45)
    M['sign_bg'] = mat_color('SignBG', (0.05, 0.055, 0.06), rough=0.6)
    M['sign_yellow'] = mat_emit('SignYellow', (1.0, 0.78, 0.12), 3.0)
    M['sign_white'] = mat_emit('SignWhite', (0.95, 0.95, 0.9), 3.0)
    M['board_text'] = mat_emit('BoardText', (1.0, 0.86, 0.45), 4.0)
    M['light'] = mat_emit('CeilLight', (1.0, 0.86, 0.68), 9.0)
    M['glass'] = mat_color('Glass', (0.75, 0.82, 0.85), rough=0.03, alpha=0.12, spec=0.8)
    M['mullion'] = mat_color('Mullion', (0.17, 0.18, 0.19), rough=0.4, metal=0.7)
    M['belt'] = mat_color('BeltRubber', (0.03, 0.03, 0.03), rough=0.75)
    M['wood'] = mat_color('WarmWood', (0.36, 0.2, 0.1), rough=0.45)
    M['shop_glass'] = mat_emit('ShopGlow', (1.0, 0.85, 0.65), 1.2)
    return M

def concourse(M, c):
    # floor
    f = plane('Floor', X1 - X0, Y1 - Y0 + 4, loc=((X0 + X1) / 2, (Y0 + Y1) / 2, 0), mat=M['floor'], c=c)
    world_uv(f)
    # ceiling slab
    ce = plane('CeilingSlab', X1 - X0, Y1 - Y0, loc=((X0 + X1) / 2, (Y0 + Y1) / 2, H + 0.45), rot=(R(180), 0, 0), mat=M['ceil'], c=c)
    world_uv(ce)
    # coffered beams (array) -- the T1 waffle ceiling
    bx = box('CeilBeamX', (X1 - X0, 0.28, 0.45), loc=((X0 + X1) / 2, Y0 + 0.9, H + 0.225), mat=M['beam'], c=c)
    a = bx.modifiers.new('arr', 'ARRAY'); a.count = int((Y1 - Y0) / 1.8); a.relative_offset_displace = (0, 1.8 / 0.28, 0)
    by = box('CeilBeamY', (0.28, Y1 - Y0, 0.45), loc=(X0 + 0.9, (Y0 + Y1) / 2, H + 0.225), mat=M['beam'], c=c)
    a = by.modifiers.new('arr', 'ARRAY'); a.count = int((X1 - X0) / 1.8); a.relative_offset_displace = (1.8 / 0.28, 0, 0)
    # round down-lights in every second coffer
    disc = cyl('CeilLightDisc', 0.22, 0.03, loc=(X0 + 1.8, Y0 + 1.8, H + 0.43), mat=M['light'], c=c, verts=20, smooth=False)
    a = disc.modifiers.new('ax', 'ARRAY'); a.count = int((X1 - X0) / 3.6); a.use_relative_offset = False; a.use_constant_offset = True; a.constant_offset_displace = (3.6, 0, 0)
    a = disc.modifiers.new('ay', 'ARRAY'); a.count = int((Y1 - Y0) / 3.6); a.use_relative_offset = False; a.use_constant_offset = True; a.constant_offset_displace = (0, 3.6, 0)
    # back wall
    w = box('BackWall', (X1 - X0, 0.4, H + 0.5), loc=((X0 + X1) / 2, Y1 + 0.2, (H + 0.5) / 2), mat=M['wall'], c=c)
    for side, x in (('L', X0 - 0.2), ('R', X1 + 0.2)):
        box('EndWall' + side, (0.4, Y1 - Y0, H + 0.5), loc=(x, (Y0 + Y1) / 2, (H + 0.5) / 2), mat=M['wall'], c=c)
    # skirting
    box('Skirting', (X1 - X0, 0.05, 0.12), loc=((X0 + X1) / 2, Y1 - 0.02, 0.06), mat=M['dark_metal'], c=c)
    # round concrete columns
    for y in (-4.2, 4.6):
        for x in range(-27, 30, 9):
            col = cyl('Column', 0.42, H, loc=(x + (4.5 if y > 0 else 0), y, H / 2), mat=M['beam'], c=c, verts=32)
            # flared capital (T1 style mushroom)
            cyl('ColumnCap', 0.42, 0.5, loc=(x + (4.5 if y > 0 else 0), y, H - 0.25), mat=M['beam'], c=c, verts=32, r2=0.95)

def facade(M, c):
    # low concrete parapet + mullions + glass
    box('Parapet', (X1 - X0, 0.35, 0.55), loc=((X0 + X1) / 2, Y0 - 0.15, 0.275), mat=M['wall'], c=c)
    mu = box('MullionV', (0.09, 0.14, H - 0.5), loc=(X0, Y0 - 0.15, 0.55 + (H - 0.55) / 2), mat=M['mullion'], c=c)
    a = mu.modifiers.new('arr', 'ARRAY'); a.count = int((X1 - X0) / 1.6) + 1; a.use_relative_offset = False; a.use_constant_offset = True; a.constant_offset_displace = (1.6, 0, 0)
    for z in (0.58, 2.6, H - 0.02):
        box('MullionH', (X1 - X0, 0.14, 0.08), loc=((X0 + X1) / 2, Y0 - 0.15, z), mat=M['mullion'], c=c)
    g = plane('FacadeGlass', X1 - X0, H - 0.55, loc=((X0 + X1) / 2, Y0 - 0.12, 0.55 + (H - 0.55) / 2), rot=(R(90), 0, 0), mat=M['glass'], c=c)
    g.visible_shadow = False
    # apron outside
    t = plane('Apron', 600, 300, loc=(0, Y0 - 150.5, -0.6), mat=M['tarmac'], c=c); world_uv(t)
    # painted apron lines
    lm = mat_color('ApronPaint', (0.85, 0.72, 0.15), rough=0.7)
    for i in range(-3, 4):
        plane('ApronLine', 0.25, 60, loc=(i * 22.0, Y0 - 45, -0.59), mat=lm, c=c)
    plane('ApronLineX', 300, 0.3, loc=(0, Y0 - 28, -0.59), mat=lm, c=c)

def seat_row(M, name, loc, n=4, mat=None, rotz=0.0, c=None):
    """Classic airport beam seating: molded seats on a steel beam."""
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    mat = mat or M['black_seat']
    pitch = 0.58
    L = (n - 1) * pitch + 0.5
    parts = []
    parts.append(box(name + '_beam', (L + 0.1, 0.07, 0.07), loc=(0, 0.05, 0.36), mat=M['metal'], c=c, bevel=0.01))
    for lx in (-L / 2 + 0.15, L / 2 - 0.15):
        parts.append(box(name + '_leg', (0.06, 0.06, 0.34), loc=(lx, 0.05, 0.17), mat=M['metal'], c=c, bevel=0.008))
        parts.append(box(name + '_foot', (0.08, 0.55, 0.03), loc=(lx, 0.05, 0.015), mat=M['metal'], c=c, bevel=0.008))
    for i in range(n):
        x = -(n - 1) * pitch / 2 + i * pitch
        s = box(name + '_seat%d' % i, (0.5, 0.46, 0.05), loc=(x, -0.02, 0.44), mat=mat, c=c, bevel=0.018, seg=3)
        s.rotation_euler = (R(-4), 0, 0)
        b = box(name + '_back%d' % i, (0.5, 0.05, 0.46), loc=(x, 0.22, 0.72), mat=mat, c=c, bevel=0.018, seg=3)
        b.rotation_euler = (R(-12), 0, 0)
        parts += [s, b]
        if i < n - 1:
            ar = box(name + '_arm%d' % i, (0.05, 0.36, 0.03), loc=(x + pitch / 2, 0.0, 0.62), mat=M['metal'], c=c, bevel=0.01)
            st = box(name + '_armpost%d' % i, (0.035, 0.035, 0.2), loc=(x + pitch / 2, 0.12, 0.52), mat=M['metal'], c=c)
            parts += [ar, st]
    for p in parts: p.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rotz)
    return root

def checkin(M, c):
    for i in range(8):
        x = -24 + i * 2.6
        box('CheckinDesk', (1.6, 0.7, 1.05), loc=(x, 7.6, 0.525), mat=M['desk_front'], c=c, bevel=0.02)
        box('CheckinTop', (1.7, 0.8, 0.04), loc=(x, 7.6, 1.07), mat=M['desk'], c=c, bevel=0.01)
        box('Scale', (0.7, 0.8, 0.25), loc=(x + 1.25, 7.55, 0.125), mat=M['metal'], c=c, bevel=0.01)
        box('Belt', (0.62, 0.72, 0.02), loc=(x + 1.25, 7.55, 0.26), mat=M['belt'], c=c)
        # number sign above
        sg = box('CheckinSign', (1.0, 0.06, 0.38), loc=(x, 8.85, 2.6), mat=M['sign_bg'], c=c)
        text('CheckinNum', str(11 + i), size=0.26, loc=(x - 0.25, 8.8, 2.6), mat=M['sign_yellow'], c=c, fnt='Oswald.ttf')
        text('CheckinTxt', 'ENREGISTREMENT\nCHECK-IN', size=0.075, loc=(x + 0.18, 8.8, 2.6), mat=M['sign_white'], c=c, fnt='BarlowCondensed-SemiBold.ttf')
    box('CheckinBackPanel', (21.5, 0.08, 1.7), loc=(-14.9, 8.95, 1.6), mat=mat_color('PanelBeige', (0.62, 0.56, 0.46), rough=0.5), c=c)
    # queue barriers
    post_m = M['metal']; tape = mat_color('QueueTape', (0.08, 0.1, 0.35), rough=0.6)
    for i in range(6):
        x = -24 + i * 3.0
        for y in (5.2, 6.4):
            cyl('QPost', 0.03, 0.95, loc=(x, y, 0.475), mat=post_m, c=c, verts=10)
            cyl('QBase', 0.16, 0.02, loc=(x, y, 0.01), mat=post_m, c=c, verts=16)
        box('QTape', (3.0, 0.01, 0.05), loc=(x + 1.5, 5.2, 0.9), mat=tape, c=c)

def shops(M, c):
    # Cafe
    cafe_c = (8.0, 8.2)
    box('CafeCounter', (5.0, 0.8, 1.05), loc=(cafe_c[0], 7.2, 0.525), mat=M['wood'], c=c, bevel=0.02)
    box('CafeCounterTop', (5.1, 0.9, 0.05), loc=(cafe_c[0], 7.2, 1.07), mat=mat_color('CafeTop', (0.85, 0.83, 0.8), rough=0.2), c=c, bevel=0.01)
    box('CafeBackShelf', (5.0, 0.4, 2.2), loc=(cafe_c[0], 8.75, 1.1), mat=M['wood'], c=c)
    box('CafeHeader', (5.6, 0.25, 0.6), loc=(cafe_c[0], 8.7, 3.1), mat=mat_color('CafeHeaderBG', (0.42, 0.06, 0.05), rough=0.5), c=c)
    text('CafeSign', 'CAFÉ  ·  BRASSERIE', size=0.32, loc=(cafe_c[0], 8.56, 3.1), mat=M['sign_white'], c=c, fnt='Oswald.ttf')
    plane('CafeGlow', 4.8, 1.6, loc=(cafe_c[0], 8.53, 1.6), rot=(R(90), 0, 0), mat=M['shop_glass'], c=c)
    # cups & croissants on shelf (simple)
    cupm = mat_color('Cup', (0.92, 0.9, 0.86), rough=0.25)
    for i in range(10):
        cyl('Cup', 0.045, 0.09, loc=(cafe_c[0] - 2 + i * 0.42, 7.25, 1.14), mat=cupm, c=c, verts=12)
    # Press kiosk
    kx = 15.5
    box('KioskBody', (3.4, 1.2, 1.1), loc=(kx, 7.8, 0.55), mat=mat_color('KioskBlue', (0.08, 0.16, 0.38), rough=0.4), c=c, bevel=0.02)
    box('KioskHeader', (3.6, 0.25, 0.5), loc=(kx, 8.7, 3.0), mat=mat_color('KioskHeaderBG', (0.85, 0.12, 0.08), rough=0.5), c=c)
    text('KioskSign', 'PRESSE · JOURNAUX · TABAC', size=0.2, loc=(kx, 8.56, 3.0), mat=M['sign_white'], c=c, fnt='Oswald.ttf')
    # magazine rack (colored rectangles)
    for i in range(24):
        col = [(0.8, 0.2, 0.15), (0.9, 0.85, 0.75), (0.15, 0.3, 0.7), (0.95, 0.75, 0.1), (0.2, 0.5, 0.3)][i % 5]
        mm = mat_color('Mag%d' % (i % 5), col, rough=0.4)
        plane('Mag', 0.21, 0.28, loc=(kx - 1.45 + (i % 12) * 0.26, 8.83, 1.55 + (i // 12) * 0.34), rot=(R(90), 0, 0), mat=mm, c=c)
    box('MagRack', (3.4, 0.1, 0.9), loc=(kx, 8.9, 1.7), mat=M['dark_metal'], c=c)

def signage(M, c):
    def hang(name, x, y, lines, w=3.6, arrow=None):
        box(name, (w, 0.08, 0.5), loc=(x, y, 3.65), mat=M['sign_bg'], c=c, bevel=0.01)
        for zz in (0.25,):
            cyl(name + '_rod', 0.012, 0.75, loc=(x - w / 2 + 0.3, y, 4.2), mat=M['metal'], c=c, verts=8)
            cyl(name + '_rod', 0.012, 0.75, loc=(x + w / 2 - 0.3, y, 4.2), mat=M['metal'], c=c, verts=8)
        for sgn in (-1, 1):
            text(name + '_t', lines[0], size=0.17, loc=(x + 0.15, y + sgn * 0.045, 3.72), rot=(R(90), 0, R(0 if sgn < 0 else 180)), mat=M['sign_yellow'], c=c, fnt='BarlowCondensed-SemiBold.ttf')
            text(name + '_t2', lines[1], size=0.13, loc=(x + 0.15, y + sgn * 0.045, 3.53), rot=(R(90), 0, R(0 if sgn < 0 else 180)), mat=M['sign_white'], c=c, fnt='BarlowCondensed-SemiBold.ttf')
            if arrow:
                text(name + '_a', arrow, size=0.32, loc=(x - w / 2 + 0.3 if sgn < 0 else x + w / 2 - 0.3, y + sgn * 0.045, 3.65), rot=(R(90), 0, R(0 if sgn < 0 else 180)), mat=M['sign_yellow'], c=c, fnt='Montserrat.ttf')
    hang('SignGates', -9, 1.0, ('Portes  1 – 36', 'Gates  ·  Satellites'), arrow='←')
    hang('SignExit', 12, 1.0, ('Sortie  ·  Taxis  ·  RER', 'Exit  ·  Ground transport'), w=4.2, arrow='→')
    hang('SignWC', 22, -1.0, ('Toilettes', 'Toilets'), w=2.4, arrow='→')
    hang('SignBag', -20, -1.0, ('Livraison bagages', 'Baggage claim'), w=3.6, arrow='↓')

def departure_board(M, c, x=-3.2, y=8.6, z=3.0):
    """Solari split-flap board. Rows are text objects updated by a frame handler (flip animation)."""
    W, Hh = 6.4, 2.6
    frame_m = mat_color('BoardFrame', (0.02, 0.02, 0.022), rough=0.5)
    box('BoardFrame', (W + 0.2, 0.25, Hh + 0.2), loc=(x, y + 0.1, z), mat=frame_m, c=c, bevel=0.02)
    # cell grid shader for the flap modules
    cm = bpy.data.materials.new('FlapCells'); cm.use_nodes = True
    nt = cm.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.012, 0.014, 1); b.inputs['Roughness'].default_value = 0.35
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['UV'], sep.inputs[0])
    # vertical gaps
    def frac_line(inp, n, width):
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = n
        nt.links.new(inp, mul.inputs[0])
        fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(mul.outputs[0], fr.inputs[0])
        lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = width
        nt.links.new(fr.outputs[0], lt.inputs[0])
        return lt.outputs[0]
    gx = frac_line(sep.outputs['X'], 46, 0.08)
    gy = frac_line(sep.outputs['Y'], 9, 0.05)
    mid = nt.nodes.new('ShaderNodeMath'); mid.operation = 'ADD'; nt.links.new(sep.outputs['Y'], mid.inputs[0]); mid.inputs[1].default_value = 0.5 / 9
    gy2 = frac_line(mid.outputs[0], 9, 0.02)
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; nt.links.new(gx, mx.inputs[0]); nt.links.new(gy, mx.inputs[1])
    mx2 = nt.nodes.new('ShaderNodeMath'); mx2.operation = 'MAXIMUM'; nt.links.new(mx.outputs[0], mx2.inputs[0]); nt.links.new(gy2, mx2.inputs[1])
    mixc = nt.nodes.new('ShaderNodeMix'); mixc.data_type = 'RGBA'
    nt.links.new(mx2.outputs[0], mixc.inputs['Factor']); mixc.inputs['A'].default_value = (0.03, 0.03, 0.033, 1); mixc.inputs['B'].default_value = (0.0, 0.0, 0.0, 1)
    nt.links.new(mixc.outputs['Result'], b.inputs['Base Color'])
    plane('BoardCells', W, Hh - 0.45, loc=(x, y - 0.03, z - 0.2), rot=(R(90), 0, 0), mat=cm, c=c)
    text('BoardHeader', 'DÉPARTS', size=0.3, loc=(x - W / 2 + 0.15, y - 0.04, z + Hh / 2 - 0.22), mat=M['sign_white'], c=c, fnt='Oswald.ttf', align='LEFT')
    text('BoardHeader2', 'DEPARTURES', size=0.2, loc=(x - W / 2 + 1.75, y - 0.04, z + Hh / 2 - 0.24), mat=M['sign_yellow'], c=c, fnt='Oswald.ttf', align='LEFT')
    cols = 'HEURE   VOL      DESTINATION          PORTE  REMARQUES'
    text('BoardCols', cols, size=0.085, loc=(x - W / 2 + 0.15, y - 0.04, z + Hh / 2 - 0.47), mat=M['sign_white'], c=c, fnt='IBMPlexMono-Medium.ttf', align='LEFT')
    rows = []
    for i in range(8):
        t = text('BoardRow%d' % i, ' ' * 44, size=0.155, loc=(x - W / 2 + 0.12, y - 0.045, z + Hh / 2 - 0.70 - i * 0.235),
                 mat=M['board_text'], c=c, fnt='IBMPlexMono-Bold.ttf', align='LEFT')
        t.data.space_character = 1.0
        rows.append(t)
    return rows

def luggage_cart(M, c, name='LuggageCart', loc=(0, 0, 0), rotz=0.0):
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    m = M['metal']; parts = []
    parts.append(box(name + '_deck', (0.62, 0.95, 0.03), loc=(0, 0, 0.2), mat=m, c=c, bevel=0.01))
    for x in (-0.3, 0.3):
        parts.append(box(name + '_rail', (0.03, 1.0, 0.03), loc=(x, 0, 0.17), mat=m, c=c))
        parts.append(box(name + '_post', (0.03, 0.03, 1.0), loc=(x, 0.5, 0.65), mat=m, c=c, rot=(R(-12), 0, 0)))
    parts.append(cyl(name + '_handle', 0.02, 0.7, loc=(0, 0.6, 1.12), rot=(0, R(90), 0), mat=mat_color('CartHandle', (0.8, 0.1, 0.05), rough=0.4), c=c, verts=10))
    parts.append(box(name + '_back', (0.62, 0.03, 0.55), loc=(0, 0.45, 0.48), mat=m, c=c, rot=(R(-12), 0, 0)))
    wm = mat_color('Rubber', (0.02, 0.02, 0.02), rough=0.8)
    for x in (-0.25, 0.25):
        for y in (-0.38, 0.38):
            parts.append(cyl(name + '_wheel', 0.08, 0.04, loc=(x, y, 0.08), rot=(0, R(90), 0), mat=wm, c=c, verts=14))
    for p in parts: p.parent = root
    root.location = loc; root.rotation_euler = (0, 0, rotz)
    return root

def suitcase(M, c, name, size, color, loc, rot=(0, 0, 0), hard=True):
    m = mat_color('Case_%s' % name, color, rough=0.35 if hard else 0.7, coat=0.2 if hard else 0)
    o = box(name, size, loc=loc, mat=m, c=c, bevel=0.035 if hard else 0.06, seg=3, rot=rot)
    hm = mat_color('CaseHandle', (0.03, 0.03, 0.03), rough=0.5)
    h = box(name + '_h', (size[0] * 0.35, 0.03, 0.04), loc=(0, 0, size[2] / 2 + 0.02), mat=hm, c=c, bevel=0.01)
    h.parent = o
    return o

def build(scene=None):
    scene = scene or bpy.context.scene
    M = build_materials()
    c = coll('TERMINAL')
    concourse(M, c); facade(M, c); checkin(M, c); shops(M, c); signage(M, c)
    rows = departure_board(M, c)
    # seating
    hero = seat_row(M, 'RedBench', (0, 2.0, 0), n=4, mat=M['red_seat'], c=c)
    for i, (x, y, rz, mat) in enumerate([(-6, 2.0, 0, 'black_seat'), (6.5, 2.0, 0, 'black_seat'), (-6, -1.6, R(180), 'black_seat'), (6.5, -1.6, R(180), 'black_seat'),
                                          (-15, -3.0, 0, 'orange_seat'), (-15, -5.0, R(180), 'orange_seat'), (17, -3.0, 0, 'orange_seat'), (-6, -2.3, 0, 'black_seat'), (6.5, -2.3, 0, 'black_seat')]):
        seat_row(M, 'Seats%d' % i, (x, y, 0), n=5, mat=M[mat], rotz=rz, c=c)
    # planter behind red bench (low wall)
    box('Planter', (4.2, 0.6, 0.55), loc=(0, 2.75, 0.275), mat=M['beam'], c=c, bevel=0.02)
    box('PlanterSoil', (4.0, 0.5, 0.02), loc=(0, 2.75, 0.555), mat=mat_color('Soil', (0.08, 0.05, 0.03), rough=0.9), c=c)
    # props from Poly Haven
    lib = {}
    for nm in ['potted_plant_02', 'potted_plant_04', 'metal_trash_can', 'korean_public_payphone_01', 'wall_clock', 'WetFloorSign_01', 'security_camera_01', 'cardboard_box_01', 'vintage_suitcase']:
        try:
            lib[nm] = import_gltf(nm, c=c)
        except Exception as e:
            print('IMPORT FAIL', nm, e)
    def inst(nm, loc, rz=0, s=1.0):
        if nm in lib: return instance(lib[nm], nm + '_i', loc, (0, 0, rz), s, c=c)
    for x in (-1.4, 1.4):
        inst('potted_plant_02', (x, 2.75, 0.55), s=1.1)
    inst('potted_plant_04', (-11.5, 8.3, 0), s=1.6); inst('potted_plant_04', (4.2, 8.3, 0), s=1.6)
    for x in (-8.5, 3.2, 10.5, -18):
        inst('metal_trash_can', (x, 2.9, 0), s=1.0)
    for x in (19.6, 20.4, 21.2):
        inst('korean_public_payphone_01', (x, 8.85, 1.2), rz=R(180), s=1.0)
    clock = inst('wall_clock', (2.6, 4.18, 3.1), rz=0, s=2.2)
    inst('security_camera_01', (4.6, 4.2, 4.0), rz=R(200))
    # big real clock with animated hands (for time passage) on the column near the bench
    clk = bpy.data.objects.new('HeroClock', None); c.objects.link(clk); clk.location = (4.5, 4.12, 3.25)
    face = cyl('ClockFace', 0.42, 0.06, loc=(0, 0, 0), rot=(R(90), 0, 0), mat=mat_color('ClockFace', (0.93, 0.92, 0.88), rough=0.4), c=c, verts=40)
    rim = cyl('ClockRim', 0.45, 0.05, loc=(0, 0.01, 0), rot=(R(90), 0, 0), mat=M['dark_metal'], c=c, verts=40)
    face.parent = clk; rim.parent = clk
    hm = mat_color('ClockHands', (0.02, 0.02, 0.02), rough=0.4)
    for i in range(12):
        a = i * math.pi / 6
        t = box('ClockTick', (0.025, 0.01, 0.07 if i % 3 else 0.11), loc=(math.sin(a) * 0.35, -0.04, math.cos(a) * 0.35), rot=(0, a, 0), mat=hm, c=c)
        t.parent = clk
    hh = bpy.data.objects.new('ClockHourPivot', None); c.objects.link(hh); hh.parent = clk; hh.location = (0, -0.05, 0)
    mh = bpy.data.objects.new('ClockMinPivot', None); c.objects.link(mh); mh.parent = clk; mh.location = (0, -0.055, 0)
    b1 = box('ClockHour', (0.035, 0.01, 0.22), loc=(0, 0, 0.09), mat=hm, c=c); b1.parent = hh
    b2 = box('ClockMin', (0.025, 0.01, 0.32), loc=(0, 0, 0.14), mat=hm, c=c); b2.parent = mh
    for nm, root in lib.items():
        if bpy.data.collections.get('SRC_' + root.name) is None:
            e = instance(root, 'tmp', (0, 0, 0), c=c); bpy.data.objects.remove(e)
    for col in bpy.data.collections:
        if col.name.startswith('SRC_'):
            for o in col.all_objects:
                if o.type == 'MESH' and o.data.users == 1: decimate_to(o, 6000)
    for o in bpy.data.objects:
        if o.type == 'FONT': o.data.resolution_u = 3
    sun_lights(scene, c)
    return M, rows

def sun_lights(scene, c):
    # interior fill: big soft area lights under the ceiling
    for i, x in enumerate(range(-24, 27, 8)):
        l = bpy.data.lights.new('CeilArea%d' % i, 'AREA'); l.shape = 'RECTANGLE'; l.size = 6.0; l.size_y = 10.0
        l.energy = 900; l.color = (1.0, 0.91, 0.8)
        l.use_shadow = True
        o = bpy.data.objects.new('CeilArea%d' % i, l); c.objects.link(o); o.location = (x, 1.5, H - 0.1)
    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 3.5; sun.color = (1.0, 0.93, 0.82); sun.angle = R(1.5)
    so = bpy.data.objects.new('Sun', sun); c.objects.link(so); so.rotation_euler = (R(58), 0, R(25))

def world(scene, hdr='kloofendal_overcast_puresky_2k.hdr', strength=1.0, rotz=0.0):
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World'); scene.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); bg.name = 'BG'
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.name = 'ENV'
    env.image = bpy.data.images.load('/opt/assets/ph/hdri/' + hdr, check_existing=True)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.name = 'ENVMAP'
    mp.inputs['Rotation'].default_value = (0, 0, rotz)
    nt.links.new(tc.outputs['Generated'], mp.inputs[0]); nt.links.new(mp.outputs[0], env.inputs[0])
    nt.links.new(env.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], o.inputs[0])
    bg.inputs['Strength'].default_value = strength
    return w


BOARD_1988 = [
 "10:05  BA 305   LONDRES HEATHROW      22   EMBARQUEMENT",
 "10:20  LH 1029  FRANCFORT             14   A L'HEURE",
 "10:35  IB 3401  MADRID                31   A L'HEURE",
 "10:50  AZ 331   ROME FIUMICINO        08   RETARDE 11:30",
 "11:05  KL 1224  AMSTERDAM             17   A L'HEURE",
 "11:15  SK 566   COPENHAGUE            25   A L'HEURE",
 "11:40  TP 441   LISBONNE              03   A L'HEURE",
 "12:00  BA 309   LONDRES GATWICK       21   A L'HEURE",
]
def fill_board(rows, lines=BOARD_1988):
    for r, l in zip(rows, lines): r.data.body = l
