"""Shot groups. Each group function builds everything it needs into the open set.blend scene."""
import bpy, math, random, sys
sys.path.insert(0, '/opt/work/scripts')
from mathutils import Vector
from shotkit import *
import hero as H
import set_terminal as T
import sets_extra as X
import board as BOARD

HERO = 'mehran'
SEAT = H.BENCH_SEATS[1]

# ----------------------------------------------------------------- shared terminal dressing
def home(ctx, level=1):
    """Nasseri's corner: luggage cart, bags and boxes. level 0..3 grows over the years."""
    c = coll('HOME')
    M = {'metal': bpy.data.materials['BrushedMetal']}
    cart = T.luggage_cart(M, c, 'HeroCart', loc=(1.55, 1.75, 0), rotz=math.radians(90))
    items = []
    def add(o, lv): items.append((o, lv)); return o
    add(T.suitcase(None, c, 'HomeCase1', (0.62, 0.24, 0.42), (0.18, 0.12, 0.08), (1.55, 1.75, 0.43), rot=(math.radians(90), 0, math.radians(90))), 0)
    add(T.suitcase(None, c, 'HomeCase2', (0.5, 0.2, 0.36), (0.08, 0.1, 0.2), (1.5, 1.72, 0.63), rot=(math.radians(90), 0, math.radians(92))), 0)
    box_m = bpy.data.materials.get('Cardboard') or mat_color('Cardboard', (0.45, 0.32, 0.18), rough=0.8)
    tape_m = mat_color('Tape', (0.6, 0.5, 0.35), rough=0.5)
    rnd = random.Random(4)
    spots = [((1.5, 1.8, 0.95), 0.0, 1), ((2.25, 2.1, 0.17), 10, 1), ((2.25, 2.1, 0.5), -6, 2), ((2.2, 1.55, 0.15), 3, 2),
             ((2.75, 2.0, 0.2), 12, 3), ((2.7, 1.5, 0.15), -8, 3), ((2.75, 2.0, 0.55), 2, 3), ((2.2, 1.55, 0.45), 20, 3)]
    for i, (p, rz, lv) in enumerate(spots):
        sz = (rnd.uniform(0.35, 0.55), rnd.uniform(0.3, 0.45), p[2] * 2 if p[2] < 0.3 else rnd.uniform(0.28, 0.36))
        b = box('HomeBox%d' % i, sz, loc=p, rot=(0, 0, math.radians(rz)), mat=box_m, c=c, bevel=0.01)
        t = box('HomeTape%d' % i, (sz[0] + 0.004, 0.06, 0.004), loc=(0, 0, sz[2] / 2), mat=tape_m, c=c); t.parent = b
        add(b, lv)
    bag_m = mat_color('Duffel', (0.12, 0.13, 0.1), rough=0.8)
    add(sphere('HomeDuffel', 0.3, loc=(0.85, 2.35, 0.2), mat=bag_m, c=c, scale=(1.3, 0.6, 0.55)), 2)
    pb = mat_color('PlasticBag', (0.85, 0.85, 0.82), rough=0.4)
    add(sphere('HomePlasticBag', 0.16, loc=(1.95, 1.35, 0.15), mat=pb, c=c, scale=(1, 0.8, 0.9)), 1)
    stack, parts = X.notebook_stack('HomeNotebooks', c, n=10, loc=(0.29, 1.98, 0.465))
    add(stack, 2)
    for o, lv in items:
        ctx.key_vis(o, 1, lv <= level)
    return cart, items

def set_home_level(ctx, items, f, level):
    for o, lv in items:
        ctx.key_vis(o, f, lv <= level)

def board_prog(f, lines):
    import json
    prog = json.loads(bpy.context.scene.get('board_program', '[]'))
    prog.append([f, lines]); prog.sort(key=lambda x: x[0])
    BOARD.set_program(bpy.context.scene, prog)

def hero_sitting_idle(a, f0, f1, beats):
    """beats: list of (frame, dict(head=(p,y), expr=name, hands=...))"""
    pass

# =================================================================== G01 : hook + intro
def G01(ctx):
    f0, f1 = F(0.0), F(10.6) - 1
    s1_end = F(4.3) - 1
    terminal_light(1, 'day'); set_clock(1, 10.2); set_clock(f1, 10.35)
    cart, items = home(ctx, level=2)
    board_prog(1, T.BOARD_1988)
    a = ctx.actor(HERO, f0, f1)
    ctx.grey(HERO, 1, 0.3)
    # seated, slumped, tired; looks around at the passing crowd
    for f in (f0, f1):
        H.sit_frame(a, f, SEAT)
    H.seated_upper(a, f0, lean=10, slouch=8, head=(8, 0, 0))
    H.hands_on_thighs(a, f0)
    a.hands(f0 + 40, (0.15, -0.31, 0.61), r=(-0.18, -0.29, 0.6))
    H.expr(a, f0, 'tired'); H.look(a, f0, yaw=0, pitch=10)
    H.look(a, f0 + 30, yaw=0, pitch=12)
    H.look(a, f0 + 55, yaw=-25, pitch=2)      # glances at passers by
    H.expr(a, f0 + 60, 'tired')
    H.look(a, f0 + 85, yaw=-30, pitch=0)
    H.look(a, f0 + 105, yaw=10, pitch=6)
    # S02: turns towards camera, small nod of introduction, faint smile
    H.look(a, s1_end + 8, yaw=8, pitch=4)
    H.seated_upper(a, s1_end + 8, lean=10, slouch=8, head=(4, 0, 0))
    H.look(a, s1_end + 30, yaw=-14, pitch=-2)   # looks into camera
    H.seated_upper(a, s1_end + 30, lean=6, slouch=4, head=(0, 0, 0))
    H.expr(a, s1_end + 30, 'neutral'); H.expr(a, s1_end + 45, 'soft_smile', 0.7)
    H.nod(a, s1_end + 50, amp=7, base=(0, 0, -10))
    H.look(a, s1_end + 95, yaw=-12, pitch=0)
    H.expr(a, s1_end + 120, 'soft_smile', 0.4)
    H.look(a, s1_end + 140, yaw=-20, pitch=8)
    H.expr(a, s1_end + 160, 'tired', 0.8)
    H.look(a, f1, yaw=-16, pitch=10)
    a.blinks(f0, f1)
    a.breath_rate.key(f0, 0.22); a.idle.key(f0, 0.7)
    a.bake(f0, f1)
    # crowd: fast passers behind the planter + one foreground wipe
    lanes = [(4.2, -1, 9, -9, 0), (5.4, 1, -9, 9, 10), (3.6, 1, -10, 10, 45), (6.2, -1, 11, -9, 60),
             (-0.6, 1, -6, 6, 70), (4.8, -1, 10, -10, 120), (3.9, 1, -10, 10, 150), (5.8, 1, -12, 10, 190)]
    crowd(ctx, f0, f1, lanes, seed=3)
    # cameras
    ctx.camera('CAM_S01', f0, s1_end, [
        (f0, (-0.24, 0.98, 1.16), (-0.29, 1.85, 1.13), 50),
        (s1_end - 25, (0.6, -3.6, 1.45), (-0.2, 2.2, 1.2), 26),
        (s1_end, (0.7, -4.2, 1.5), (-0.2, 2.2, 1.2), 24),
    ], fstop=2.8, shake=0.01)
    ctx.camera('CAM_S02', s1_end + 1, f1, [
        (s1_end + 1, (0.45, 0.85, 1.22), (-0.3, 1.88, 1.12), 50),
        (f1, (0.2, 1.0, 1.2), (-0.3, 1.88, 1.12), 55),
    ], fstop=2.2, shake=0.006)
    ctx.overlay(kind='title', f0=F(1.1), f1=F(4.0), text='18 YEARS', sub='INSIDE AN AIRPORT')
    ctx.overlay(kind='lower_third', f0=F(5.2), f1=F(9.8), text='MEHRAN KARIMI NASSERI', sub='born 1945 · Iran')
    ctx.sfx(F(0.0), 'amb_airport_departures_hall', -6)
    ctx.sfx(F(0.2), 'pa_chime_airport_ding', -10)
    ctx.sfx(F(4.2), 'whoosh_air', -12)
    for i, ln in enumerate(lanes):
        pass

def _mats():
    return {k: bpy.data.materials[v] for k, v in (('metal', 'BrushedMetal'), ('black_seat', 'BlackSeatPlastic'), ('red_seat', 'RedSeatPlastic'))}

def chair(name, loc, rotz, c):
    m = mat_color('ChairWood', (0.3, 0.18, 0.09), rough=0.45)
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    parts = [box(name + '_seat', (0.46, 0.44, 0.05), loc=(0, 0, 0.44), mat=m, c=c, bevel=0.01),
             box(name + '_back', (0.46, 0.04, 0.5), loc=(0, 0.21, 0.72), mat=m, c=c, bevel=0.01)]
    for x in (-0.2, 0.2):
        for y in (-0.19, 0.19):
            parts.append(box(name + '_leg', (0.035, 0.035, 0.44), loc=(x, y, 0.22), mat=m, c=c))
    for p in parts: p.parent = root
    root.location = loc; root.rotation_euler = (0, 0, math.radians(rotz))
    return root

# =================================================================== G03 : Belgium 1981
def G03(ctx):
    f0, f1 = F(10.6), F(17.8) - 1
    fa = F(14.2) - 1
    c = coll('OFFICE')
    bx, by = X.office_void(c)
    chair('ChairOfficial', (bx, by + 0.6, 0), 0, c)
    chair('ChairHero', (bx, by - 0.65, 0), 180, c)
    cert = X.document('Certificate', '/opt/work/tex/certificate.png', c)
    stamp = X.rubber_stamp('Stamp', c)
    pad = box('InkPad', (0.12, 0.08, 0.015), loc=(bx + 0.45, by + 0.15, 0.785), mat=mat_color('InkPad', (0.1, 0.1, 0.3), rough=0.5), c=c, bevel=0.003)
    # official (seated across, facing -Y towards Mehran)
    o = ctx.actor('Official', f0, f1)
    hero = ctx.actor(HERO, f0, f1)
    ctx.grey(HERO, f0, 0.0)
    for f in (f0, f1):
        H.sit_frame(o, f, (bx, by + 0.6), rotz=0, seat_z=0.465)
        H.sit_frame(hero, f, (bx, by - 0.65), rotz=180, seat_z=0.465)
    # NOTE: rotz=180 for the official means facing +Y; we want him facing the hero (-Y) -> rotz 0 at y>desk
    # stamp action (official's right hand)
    st_up = (-0.12, -0.55, 1.05); st_dn = (-0.12, -0.55, 0.86)
    H.seated_upper(o, f0, lean=14, head=(18, 0, 0))
    o.hands(f0, (0.18, -0.45, 0.82), r=st_up)
    o.hand(f0 + 30, 'R', st_up); o.hand(f0 + 44, 'R', (-0.12, -0.55, 1.12)); o.hand(f0 + 50, 'R', st_dn)  # THUD
    o.hand(f0 + 56, 'R', (-0.12, -0.55, 0.9)); o.hand(f0 + 66, 'R', (-0.2, -0.45, 1.0))
    # slides the certificate across at S03b
    o.hand(fa + 6, 'R', (-0.25, -0.4, 0.86)); o.hand(fa + 10, 'L', (0.05, -0.55, 0.81)); o.hand(fa + 30, 'L', (0.05, -0.9, 0.81))
    o.hand(fa + 44, 'L', (0.16, -0.5, 0.82))
    H.expr(o, f0, 'focus'); H.expr(o, fa + 20, 'soft_smile', 0.6); H.look(o, fa + 20, yaw=0, pitch=0)
    o.blinks(f0, f1); o.bake(f0, f1)
    # stamp prop follows the official's right hand, ink pad on desk, certificate on desk
    follow_hand(stamp, o, 'R', f0, fa, offset=(0, -0.02, -0.12))
    stamp.rotation_euler = (0, 0, 0)
    # certificate: on desk; slides towards hero during S03b
    cert.rotation_euler = (0, 0, 0)
    pos0 = Vector((bx + 0.1, by + 0.08, 0.781))
    key_prop_path(cert, [(f0, pos0, None), (fa + 10, pos0, None)])
    seq = []
    for f in range(fa + 10, fa + 31):
        p, rz = hand_world(o, 'L', f, (0, -0.1, -0.03)); seq.append((f, Vector((p.x, p.y, 0.781)), None))
    key_prop_path(cert, seq + [(f1, seq[-1][1], None)])
    # hero: anxious -> relieved smile, takes the paper, looks down at it
    H.seated_upper(hero, f0, lean=8, head=(6, 0, 0)); H.hands_on_thighs(hero, f0)
    H.expr(hero, f0, 'worried', 0.6); H.look(hero, f0, pitch=15)
    H.look(hero, fa + 5, pitch=8)
    H.expr(hero, fa + 32, 'worried', 0.3)
    hero.hands(fa + 34, (0.12, -0.38, 0.62), r=(-0.12, -0.38, 0.62))
    hero.hands(fa + 46, (0.1, -0.42, 0.80), r=(-0.1, -0.42, 0.80))
    H.look(hero, fa + 46, pitch=24)
    H.expr(hero, fa + 55, 'smile', 0.85)
    H.seated_upper(hero, fa + 60, lean=2, head=(-4, 0, 0))
    H.look(hero, fa + 70, pitch=-3); H.look(hero, f1, pitch=-2, yaw=4)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    ctx.camera('CAM_S03a', f0, fa, [
        (f0, (bx + 0.3, by - 0.45, 1.3), (bx + 0.05, by + 0.08, 0.8), 40),
        (fa, (bx + 0.2, by - 0.35, 1.2), (bx + 0.05, by + 0.05, 0.8), 46)], fstop=2.0)
    ctx.camera('CAM_S03b', fa + 1, f1, [
        (fa + 1, (bx - 0.5, by + 0.35, 1.3), (bx, by - 0.75, 1.12), 50),
        (f1, (bx - 0.42, by + 0.25, 1.26), (bx, by - 0.75, 1.12), 58)], fstop=2.4)
    ctx.sfx(f0 + 50, 'stamp_thud_gavel', -2); ctx.sfx(f0 + 50, 'stamp_thud_wood_hit', -6)
    ctx.sfx(fa + 10, 'newspaper_page_turn', -16)
    ctx.overlay(kind='place', f0=f0 + 6, f1=fa - 4, text='BELGIUM · 1981')

# =================================================================== G04 : 1988, off to England
def G04(ctx):
    f0, f1 = F(17.8), F(22.6) - 1
    terminal_light(f0, 'day'); set_clock(f0, 9.9)
    board_prog(f0, T.BOARD_1988)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.1)
    hero.walk(f0, f1, [(-9.0, -1.0), (-1.5, -1.6), (3.0, -1.4)], speed=1.25, stride=0.72, ease=0, style=dict(hold='R', carry=None, arm=14), phase0=0.2)
    H.expr(hero, f0, 'soft_smile', 0.5); hero.face(f0 + 70, mouthSmileLeft=0.35, mouthSmileRight=0.35)
    H.look(hero, f0 + 30, yaw=25, pitch=-10); H.look(hero, f0 + 60, yaw=30, pitch=-12)   # looks up to the board
    H.look(hero, f0 + 100, yaw=0, pitch=0)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    c = coll('PROPS')
    case = T.suitcase(None, c, 'HeroCase88', (0.55, 0.2, 0.4), (0.2, 0.13, 0.08), (0, 0, 0))
    follow_hand(case, hero, 'R', f0, f1, offset=(0, 0, -0.24), rot=(0, 0, 0))
    lanes = [(-3.0, 1, -12, 12, 0), (0.4, -1, 10, -10, 0), (-4.2, -1, 14, -10, 20), (4.5, 1, -10, 10, 0), (5.5, -1, 8, -12, 30), (-2.4, -1, 15, -12, 50)]
    crowd(ctx, f0, f1, lanes, seed=4)
    ctx.camera('CAM_S04', f0, f1, [
        (f0, (-7.0, -4.2, 1.35), (-8.6, -1.0, 1.15), 35),
        (f0 + 70, (-3.6, -4.4, 1.4), (-4.0, -1.3, 1.25), 34),
        (f1, (-1.2, -4.6, 1.6), (-2.6, 3.0, 2.0), 26)], fstop=4.0, shake=0.01)
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='1988')
    ctx.sfx(f0, 'amb_airport_departures_hall', -8); ctx.sfx(f0 + 45, 'splitflap_substitute_card_shuffle', -8)
    ctx.sfx(f0, 'footsteps_hard_floor_reverb_loop', -14)
    board_prog(f0 + 40, ["10:05  BA 305   LONDRES HEATHROW      22   EMBARQUEMENT"] + T.BOARD_1988[1:4] + ["10:55  BA 307   LONDRES HEATHROW      23   A L'HEURE"] + T.BOARD_1988[5:])

# =================================================================== G05 : the briefcase is stolen
def G05(ctx):
    f0, f1 = F(22.6), F(28.0) - 1
    c = coll('THEFT')
    bx, by = X.theft_set(c)
    M = _mats(); M['black_seat'] = bpy.data.materials['BlackSeatPlastic']
    T.seat_row(M, 'TheftBench', (bx, by, 0), n=3, mat=M['black_seat'], c=c)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.1)
    seat = (bx - 0.58, by - 0.02)
    for f in (f0, f1): H.sit_frame(hero, f, seat)
    # reading a map, absorbed; turns too late
    H.seated_upper(hero, f0, lean=12, head=(22, 0, 0))
    hero.hands(f0, (0.14, -0.40, 0.84), r=(-0.18, -0.40, 0.84))
    H.expr(hero, f0, 'focus', 0.7); H.look(hero, f0, pitch=25, yaw=-6)
    grab = f0 + 78
    H.look(hero, grab + 22, pitch=20, yaw=-6)
    H.look(hero, grab + 34, yaw=55, pitch=0)            # turns: the seat beside him is empty
    H.expr(hero, grab + 34, 'neutral'); H.expr(hero, grab + 44, 'shock')
    H.seated_upper(hero, grab + 40, lean=0, head=(0, 0, 20), twist=25)
    hero.hands(grab + 40, (0.32, -0.15, 0.62), r=(-0.18, -0.36, 0.72))   # hand pats the empty seat
    H.look(hero, grab + 62, yaw=70, pitch=-5); H.look(hero, f1, yaw=78, pitch=-8)
    hero.blinks(f0, grab + 30); hero.bake(f0, f1)
    mp = plane('Map', 0.34, 0.24, mat=mat_color('MapPaper', (0.85, 0.82, 0.7), rough=0.8), c=c)
    follow_hand(mp, hero, 'L', f0, grab + 30, offset=(-0.16, -0.05, 0.05), rot=(math.radians(55), 0, 0))
    ctx.only_in(mp, f0, grab + 30)
    # thief walks behind the bench, swipes the briefcase and hurries away
    th = ctx.actor('Thief', f0, f1)
    th.walk(f0 + 20, f1, [(bx + 5.0, by + 0.95), (bx - 1.0, by + 0.95), (bx - 9, by + 2.5)], speed=1.5, stride=0.78, ease=0, style=dict(lean=8, arm=10))
    th.face(f0, browDownLeft=0.4, browDownRight=0.4)
    th.bake(f0, f1)
    # override his left hand to reach down at the grab
    th2 = th
    bc = X.briefcase('Briefcase', c)
    bpos = Vector((bx + 0.0, by + 0.02, 0.465 + 0.16))
    key_prop_path(bc, [(f0, bpos, None), (grab - 1, bpos, None)])
    bc.rotation_euler = (0, 0, 0)
    seq = []
    for f in range(grab, f1 + 1):
        p, rz = hand_world(th, 'R', f, (0, 0, -0.2)); seq.append((f, p, rz))
    key_prop_path(bc, seq, rot=(0, 0, 0))
    ctx.camera('CAM_S05', f0, f1, [
        (f0, (bx + 1.1, by - 2.4, 1.0), (bx - 0.2, by, 0.85), 35),
        (grab + 30, (bx + 0.7, by - 1.9, 1.05), (bx - 0.4, by, 0.95), 40),
        (f1, (bx + 0.4, by - 1.35, 1.1), (bx - 0.58, by, 1.1), 50)], fstop=2.8, shake=0.008)
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='PARIS · 1988')
    ctx.sfx(f0 + 30, 'footsteps_heels_hard_floor', -14); ctx.sfx(grab, 'whoosh_cinematic_fast', -10)
    ctx.sfx(grab + 40, 'whoosh_tunnel_reverb', -14)

# =================================================================== G06 : London and back
def G06(ctx):
    f0, f1 = F(28.0), F(33.8) - 1
    fa = F(30.6) - 1
    c = coll('RUNWAY')
    plane_root = X.runway_set(c)
    bx, by = 0.0, -1200.0
    # takeoff run: plane moves -X, rotates and lifts
    pr = plane_root
    for f, x, z, pitch in ((f0, bx + 120, 3.6, 0), (f0 + 30, bx + 40, 3.6, 0), (f0 + 52, bx - 25, 4.2, 7), (fa, bx - 95, 14, 11)):
        pr.location = (x, by, z); pr.keyframe_insert('location', frame=f)
        pr.rotation_euler = (0, math.radians(pitch), 0); pr.keyframe_insert('rotation_euler', frame=f)
    ctx.camera('CAM_S06a', f0, fa, [
        (f0, (bx - 10, by - 32, 0.9), (bx + 100, by, 4), 45),
        (f0 + 40, (bx - 12, by - 32, 0.9), (bx + 15, by, 4.5), 35),
        (fa, (bx - 14, by - 32, 1.0), (bx - 85, by, 12), 30)], fstop=None, shake=0.03, clip=(0.1, 3000))
    # immigration
    ci = coll('IMMIGRATION')
    ix, iy = X.immigration_set(ci)
    of = ctx.actor('UKOfficer', fa + 1, f1)
    of.place(fa + 1, ix, iy + 1.25, 0, 0)
    of.pose(fa + 1, A.sym({'spine03': (6, 0, 0)}))
    of.hands(fa + 1, (0.2, -0.45, 1.2), r=(-0.2, -0.45, 1.2))
    H.expr(of, fa + 1, 'stern', 0.8)
    H.head_shake(of, fa + 18, n=2, amp=12, period=10)
    of.hand(fa + 40, 'R', (-0.2, -0.45, 1.2)); of.hand(fa + 52, 'R', (-0.45, -0.4, 1.35), pole=(-0.6, 0.3, 1.0))  # points: back
    of.hand(f1, 'R', (-0.48, -0.42, 1.37))
    of.blinks(fa + 1, f1); of.bake(fa + 1, f1)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, fa, 0.1)
    hero.place(fa + 1, ix + 0.05, iy - 0.75, 0, 180)
    H.hands_relaxed(hero, fa + 1)
    hero.hands(fa + 1, (0.12, -0.35, 1.12), r=(-0.12, -0.35, 1.12))     # hands on the counter, pleading
    hero.pose(fa + 1, {'spine03': (6, 0, 0), 'head': (-4, 0, 0)})
    H.expr(hero, fa + 1, 'worried')
    hero.pose(fa + 55, {'spine03': (12, 0, 0), 'spine04': (6, 0, 0), 'head': (14, 0, 0)})     # shoulders drop
    H.hands_relaxed(hero, fa + 60); H.expr(hero, fa + 60, 'sad')
    hero.blinks(fa + 1, f1); hero.bake(fa + 1, f1)
    ctx.camera('CAM_S06b', fa + 1, f1, [
        (fa + 1, (ix - 0.65, iy - 2.0, 1.6), (ix + 0.1, iy + 1.1, 1.45), 40),
        (f1, (ix - 0.45, iy - 1.65, 1.6), (ix + 0.05, iy + 1.1, 1.5), 48)], fstop=2.8, shake=0.006)
    ctx.overlay(kind='place', f0=fa + 4, f1=fa + 60, text='LONDON HEATHROW')
    ctx.sfx(f0, 'jet_takeoff', 0); ctx.sfx(fa + 20, 'stamp_thud_wood_hit', -8)

# =================================================================== G07 : nowhere to send him
def G07(ctx):
    f0, f1 = F(33.8), F(37.6) - 1
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.12)
    p1 = ctx.actor('Police1', f0, f1); p2 = ctx.actor('Police2', f0, f1)
    cx, cy = -4.0, -2.0
    hero.place(f0, cx, cy, 0, 0); H.hands_relaxed(hero, f0); H.expr(hero, f0, 'worried', 0.7)
    p1.place(f0, cx - 1.0, cy - 0.35, 0, -60); p2.place(f0, cx + 1.0, cy - 0.3, 0, 65)
    for p in (p1, p2): H.hands_relaxed(p, f0); H.expr(p, f0, 'stern', 0.5)
    # p1 shrugs with palms up
    p1.hands(f0 + 18, (0.32, -0.32, 1.02), r=(-0.32, -0.32, 1.02)); p1.pose(f0 + 18, {'clavicle.L': (0, 0, 8), 'clavicle.R': (0, 0, -8), 'head': (0, 8, 0)})
    p1.hands(f0 + 40, (0.32, -0.32, 1.02), r=(-0.32, -0.32, 1.02))
    H.hands_relaxed(p1, f0 + 58); p1.pose(f0 + 58, {'clavicle.L': (0, 0, 0), 'clavicle.R': (0, 0, 0), 'head': (0, 0, 0)})
    # p2 shakes head, points away
    H.head_shake(p2, f0 + 40, n=2, amp=10, period=9)
    p2.hand(f0 + 60, 'R', (-0.35, -0.45, 1.35)); p2.hand(f1, 'R', (-0.38, -0.47, 1.36))
    # hero looks from one to the other
    H.look(hero, f0 + 10, yaw=-45); H.look(hero, f0 + 42, yaw=45); H.look(hero, f0 + 80, yaw=0, pitch=10); H.expr(hero, f0 + 80, 'sad', 0.8)
    for a in (hero, p1, p2): a.blinks(f0, f1); a.bake(f0, f1)
    lanes = [(3.8, 1, -14, 10, 0), (5.0, -1, 4, -14, 0), (-5.5, 1, -14, 8, 10)]
    crowd(ctx, f0, f1, lanes, seed=7)
    ctx.camera('CAM_S07', f0, f1, [
        (f0, (cx, cy - 4.2, 1.45), (cx, cy, 1.3), 32),
        (f1, (cx, cy - 3.3, 1.5), (cx, cy, 1.35), 36)], fstop=3.5, shake=0.008)
    ctx.sfx(f0, 'amb_airport_terminal_busy_crowd', -10)

# =================================================================== G08 : 26 August 1988 -- he sits down
def G08(ctx):
    f0, f1 = F(37.6), F(46.4) - 1
    fb = F(43.9) - 1
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988); set_clock(f0, 11.0); set_clock(f1, 11.15)
    cart, items = home(ctx, level=0)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.12)
    # walk in from the right pushing the cart, stop beside the bench
    sx, sy = SEAT[0], SEAT[1] - 0.38
    arrive = f0 + 95
    hero.walk(f0, arrive, [(6.5, 0.9), (2.6, 1.2), (sx + 0.05, sy + 0.02)], speed=1.0, stride=0.62, ease=18, style=dict(push=True, lean=8, tired=0.3, arm=0), phase0=0.1)
    H.expr(hero, f0, 'tired', 0.7)
    # turn to face -Y and sit (heavy)
    hero.place(arrive + 2, sx + 0.05, sy + 0.02, 0, 90)
    hero.place(arrive + 16, sx, sy, 0, 0)
    for side, f, z in (('L', arrive + 6, 0.06), ('R', arrive + 11, 0.06)):
        hero.leg_ik(f, side, (0, 0.0, (hero.ankle_z + z) - hero.hip_z))
    H.hands_relaxed(hero, arrive + 4)
    # stand -> crouch -> sit
    t0 = arrive + 18
    hero.root(t0, 0, 0, 0)
    for side in ('L', 'R'): hero.leg_ik(t0, side, (0, 0.0, hero.ankle_z - hero.hip_z))
    hero.pose(t0, {'spine04': (4, 0, 0), 'spine03': (4, 0, 0), 'head': (0, 0, 0)})
    mid = t0 + 10
    hero.root(mid, 0, 0.22, -0.18)
    for side in ('L', 'R'): hero.leg_ik(mid, side, (0, -0.24, hero.ankle_z - (hero.hip_z - 0.18)))
    hero.pose(mid, {'spine04': (16, 0, 0), 'spine03': (16, 0, 0), 'spine02': (8, 0, 0), 'head': (-10, 0, 0)})
    hero.hands(mid, (0.2, -0.25, 0.7), r=(-0.2, -0.25, 0.7))
    sit = t0 + 18
    H.sit_frame(hero, sit, SEAT); H.seated_upper(hero, sit, lean=14, slouch=4, head=(4, 0, 0))
    H.hands_on_thighs(hero, sit)
    hero.root(sit + 3, 0, 0.425, (H.SEAT_Z + 0.09 - hero.hip_z) - 0.012)   # settle bounce
    H.sit_frame(hero, sit + 9, SEAT); H.seated_upper(hero, sit + 9, lean=4, slouch=10, head=(-8, 0, 0))
    H.expr(hero, sit, 'sigh'); H.expr(hero, sit + 20, 'tired')
    H.look(hero, sit + 28, pitch=-6, yaw=10); H.look(hero, sit + 60, pitch=4, yaw=-30); H.look(hero, fb, pitch=2, yaw=-8)
    # S09: arms crossed, settles in, looks out at the terminal: "and he stayed"
    H.sit_frame(hero, f1, SEAT)
    hero.hands(fb + 10, (0.05, -0.14, 0.67), r=(-0.05, -0.15, 0.68), pole_l=(0.5, 0.5, 0.8)); hero.pose(fb + 10, A.fingers(0.55, 0.4))
    H.seated_upper(hero, fb + 10, lean=-2, slouch=12, head=(0, 0, 0))
    H.look(hero, fb + 25, yaw=-10, pitch=-2); H.expr(hero, fb + 25, 'neutral'); H.look(hero, f1, yaw=-14, pitch=-4)
    hero.breath_rate.key(sit, 0.35); hero.breath.key(sit, 2.2); hero.breath.key(sit + 40, 1.0)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    # cart moves with him until parked
    seq = []
    for f in range(f0, arrive + 1):
        p, rz = char_to_world(hero, f, (0, -0.95, 0)); seq.append((f, p, rz))
    for f in (arrive + 1, f1):
        seq.append((f, seq[-1][1], seq[-1][2]))
    key_prop_path(cart, seq, rot=(0, 0, math.radians(90)))
    # bags ride on the cart
    for o, lv in items:
        if lv == 0 and o.name.startswith('HomeCase'):
            o.parent = cart; o.location = (0, 0, 0.43 if o.name.endswith('1') else 0.63); o.rotation_euler = (math.radians(90), 0, 0)
    lanes = [(4.2, -1, 10, -10, 0), (5.4, 1, -10, 10, 30), (-2.0, -1, 12, -12, 60), (3.8, 1, -12, 10, 130), (-4.0, 1, -14, 10, 150)]
    crowd(ctx, f0, f1, lanes, seed=8)
    ctx.camera('CAM_S08', f0, fb, [
        (f0, (-1.6, -4.5, 1.35), (3.0, 1.6, 1.1), 28),
        (arrive, (-1.2, -3.6, 1.3), (0.2, 1.8, 0.95), 28),
        (fb, (-0.5, -2.7, 1.2), (-0.25, 2.0, 0.9), 30)], fstop=4.0, shake=0.008)
    ctx.camera('CAM_S09', fb + 1, f1, [
        (fb + 1, (-1.0, 0.6, 1.0), (-0.29, 1.95, 1.08), 42),
        (f1, (-0.9, 0.75, 1.02), (-0.29, 1.95, 1.08), 48)], fstop=2.2)
    ctx.overlay(kind='date', f0=sit, f1=fb - 6, text='26 AUGUST 1988', sub='Terminal 1 · Charles de Gaulle')
    ctx.sfx(f0, 'amb_airport_departures_hall', -6); ctx.sfx(f0, 'trolley_suitcase_wheels', -10)
    ctx.sfx(sit - 2, 'stamp_thud_wood_hit', -16)

# =================================================================== G10 : morning ritual, restroom
def G10(ctx):
    f0, f1 = F(46.4), F(52.2) - 1
    c = coll('RESTROOM')
    bx, by = X.restroom_set(c)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.1)
    px, py = bx, by + 1.62
    hero.place(f0, px, py, 0, 180)
    # bend over the sink, splash water twice
    hero.pose(f0, {'spine04': (25, 0, 0), 'spine03': (20, 0, 0), 'spine02': (10, 0, 0), 'head': (-25, 0, 0)})
    hero.root(f0, 0, 0.06, -0.03)
    for side in ('L', 'R'): hero.leg_ik(f0, side, (0, 0.0, hero.ankle_z - hero.hip_z + 0.03))
    cup = (0.07, -0.42, 0.95); face = (0.06, -0.42, 1.38)
    for k, fr in enumerate((f0, f0 + 22)):
        hero.hands(fr, cup, pole_l=(0.5, 0.2, 0.9))
        hero.hands(fr + 10, face, pole_l=(0.5, 0.2, 1.0))
        H.expr(hero, fr + 9, 'sleep'); H.expr(hero, fr + 16, 'neutral')
        hero.hands(fr + 18, cup, pole_l=(0.5, 0.2, 0.9))
    hero.pose(f0 + 46, {'spine04': (25, 0, 0), 'spine03': (20, 0, 0), 'spine02': (10, 0, 0), 'head': (-25, 0, 0)})
    # straighten, look in the mirror, shave
    up = f0 + 62
    hero.pose(up, {'spine04': (3, 0, 0), 'spine03': (2, 0, 0), 'spine02': (0, 0, 0), 'head': (-4, 0, 0)})
    hero.root(up, 0, 0, 0)
    for side in ('L', 'R'): hero.leg_ik(up, side, (0, 0.0, hero.ankle_z - hero.hip_z))
    H.hands_relaxed(hero, up - 4); hero.hand(up + 4, 'L', (0.215, -0.03, 0.865))
    hero.hand(up + 6, 'R', (-0.09, -0.16, 1.43), pole=(-0.5, 0.3, 1.0))
    H.expr(hero, up, 'focus', 0.8)
    for i in range(6):
        hero.hand(up + 12 + i * 8, 'R', (-0.085, -0.155, 1.38 if i % 2 else 1.46))
    hero.pose(up + 10, {'head': (-6, 0, 18)}); hero.pose(up + 50, {'head': (-10, 0, 14)})
    hero.hand(f1, 'R', (-0.09, -0.16, 1.4))
    hero.blinks(up, f1); hero.bake(f0, f1)
    rz = X.razor('Razor', c)
    follow_hand(rz, hero, 'R', up, f1, offset=(0.02, -0.06, 0.02), rot=(math.radians(15), 0, 0))
    ctx.only_in(rz, up + 4, f1)
    # water drops: small emissive-free droplets omitted; sound sells it
    ctx.camera('CAM_S10', f0, f1, [
        (f0, (bx - 0.25, by + 2.33, 1.45), (px, py, 1.25), 32),
        (f1, (bx - 0.15, by + 2.33, 1.58), (px, py, 1.52), 40)], fstop=2.8, shake=0.006, clip=(0.02, 100))
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='5:30 AM')
    ctx.sfx(f0, 'tap_sink_running', -8); ctx.sfx(up + 6, 'razor_electric_hum', -10); ctx.sfx(up + 28, 'razor_electric_hum', -10)

# =================================================================== G11 : friends, food, newspapers, diary
def G11(ctx):
    f0, f1 = F(52.2), F(66.0) - 1
    fb = F(55.9) - 1      # cut to eating close-up
    fc = F(58.9) - 1      # reading
    fd = F(62.6) - 1      # writing insert
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988); set_clock(f0, 8.1); set_clock(f1, 8.3)
    cart, items = home(ctx, level=2)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.25)
    for f in (f0, f1): H.sit_frame(hero, f, SEAT)
    w = ctx.actor('Worker', f0, fc)
    # worker walks up from the cafe side with a paper bag + coffee
    stop = f0 + 52
    w.walk(f0, stop, [(5.5, -0.2), (1.2, 0.85), (0.1, 1.05)], speed=1.25, stride=0.7, ease=10, style=dict(hold='R', arm=10))
    w.place(stop + 8, 0.1, 1.05, 0, 135)
    for side in ('L', 'R'): w.leg_ik(stop + 8, side, (0, 0.0, w.ankle_z - w.hip_z))
    w.root(stop + 8, 0, 0, 0)
    give = stop + 20
    w.hand(stop + 8, 'R', (-0.2, -0.1, 0.9)); w.hand(give, 'R', (-0.12, -0.5, 1.0)); w.hand(give + 18, 'R', (-0.12, -0.48, 1.0))
    w.hand(give + 30, 'R', (-0.215, -0.03, 0.865)); w.hand(stop + 8, 'L', (0.215, -0.03, 0.865))
    w.pose(give, {'spine03': (10, 0, 0), 'head': (12, 0, 0)}); w.pose(give + 30, {'spine03': (2, 0, 0), 'head': (4, 0, 0)})
    H.expr(w, stop, 'smile', 0.8); w.face(give + 10, jawOpen=0.15); w.face(give + 16, jawOpen=0.02); w.face(give + 22, jawOpen=0.12); w.face(give + 28, jawOpen=0.0)
    # chats a moment then leaves
    w.place(fb - 4, 0.1, 1.05, 0, 135)
    w.walk(fb, fc, [(0.1, 1.05), (3.0, -0.5), (8.0, -1.5)], speed=1.2, stride=0.7, ease=10)
    w.blinks(f0, fc); w.bake(f0, fc)
    # hero: looks up, smiles, takes bag, nods thanks, eats
    H.seated_upper(hero, f0, lean=8, slouch=6, head=(10, 0, 0)); H.hands_on_thighs(hero, f0); H.expr(hero, f0, 'tired', 0.6)
    H.look(hero, f0 + 30, yaw=-40, pitch=-5); H.expr(hero, stop, 'smile', 0.9)
    H.look(hero, stop + 6, yaw=-35, pitch=-12)
    hero.hand(give + 8, 'R', (-0.25, -0.42, 0.95)); hero.hand(give + 18, 'R', (-0.25, -0.44, 0.95))
    hero.hand(give + 32, 'R', (-0.16, -0.3, 0.66))
    H.nod(hero, give + 22, amp=9, base=(-12, 0, -30))
    hero.face(give + 24, jawOpen=0.12); hero.face(give + 30, jawOpen=0.0)
    H.look(hero, fb - 10, yaw=-10, pitch=8)
    # eating close-up: croissant to mouth, chew
    hero.hand(fb + 4, 'L', (0.12, -0.32, 0.8))
    for k in range(3):
        fr = fb + 12 + k * 30
        hero.hand(fr, 'L', (0.04, -0.2, 1.22), pole=(0.5, 0.3, 0.9)); H.expr(hero, fr, 'neutral'); hero.face(fr + 2, jawOpen=0.3)
        hero.hand(fr + 12, 'L', (0.09, -0.3, 0.92)); H.chew(hero, fr + 6, fr + 26)
    H.expr(hero, fb + 20, 'soft_smile', 0.5)
    # reading: newspaper held in both hands, one page turn
    rd = fc + 2
    H.seated_upper(hero, rd, lean=10, slouch=4, head=(20, 0, 0))
    hero.hands(rd, (0.2, -0.4, 0.95), r=(-0.2, -0.4, 0.95), pole_l=(0.5, 0.3, 0.8))
    H.expr(hero, rd, 'focus', 0.6); H.look(hero, rd, pitch=20, yaw=6); H.look(hero, rd + 40, pitch=22, yaw=-8)
    turn = rd + 62
    hero.hand(turn, 'R', (-0.2, -0.4, 0.95)); hero.hand(turn + 8, 'R', (0.05, -0.47, 1.02)); hero.hand(turn + 16, 'R', (-0.2, -0.4, 0.95))
    H.look(hero, turn + 18, pitch=20, yaw=8)
    # writing insert (hands only matter): diary on lap
    wr = fd + 1
    H.seated_upper(hero, wr, lean=20, slouch=6, head=(30, 0, 0))
    hero.hands(wr, (0.1, -0.36, 0.72), r=(-0.06, -0.38, 0.70), pole_l=(0.5, 0.3, 0.8))
    for k in range(12):
        hero.hand(wr + 4 + k * 7, 'R', (-0.06 + 0.012 * (k % 6), -0.38 + (0.012 if k % 2 else -0.004), 0.70))
    hero.blinks(f0, f1); hero.bake(f0, f1)
    # props
    c = coll('PROPS')
    bag = X.paper_bag('FoodBag', c); cup = X.coffee_cup('Coffee', c)
    follow_hand(bag, w, 'R', f0, give + 12, offset=(0, -0.06, -0.12))
    seq = []
    for f in range(give + 13, give + 33):
        p, rz = hand_world(hero, 'R', f, (0, -0.06, -0.12)); seq.append((f, p, rz))
    key_prop_path(bag, seq)
    key_prop_path(bag, [(give + 34, Vector((0.25, 1.98, 0.58)), None), (f1, Vector((0.25, 1.98, 0.58)), None)])
    cup.location = (0.42, 1.98, 0.52)
    croissant = sphere('Croissant', 0.06, mat=mat_color('Pastry', (0.7, 0.42, 0.15), rough=0.5, coat=0.3), c=c, scale=(1.5, 0.7, 0.6))
    follow_hand(croissant, hero, 'L', fb, fc, offset=(0.0, -0.09, 0.0))
    ctx.only_in(croissant, fb, fc)
    paper = X.newspaper('Newspaper', c)
    follow_hand(paper, hero, 'L', fc, fd, offset=(-0.2, -0.05, 0.12), rot=(math.radians(70), 0, 0))
    ctx.only_in(paper, fc, fd)
    di = X.diary('Diary', c); pn = X.pen('Pen', c)
    p, rz = char_to_world(hero, wr + 2, (0.0, -0.38 + 0.425, 0.64))
    di.location = p; di.rotation_euler = (math.radians(12), 0, rz)
    ctx.only_in(di, fd, f1)
    follow_hand(pn, hero, 'R', fd, f1, offset=(0.0, -0.05, 0.03), rot=(math.radians(-35), math.radians(10), math.radians(70)))
    ctx.only_in(pn, fd, f1)
    lanes = [(4.2, -1, 10, -10, 0), (5.4, 1, -10, 10, 30), (-2.4, 1, -12, 10, 40), (3.8, 1, -12, 10, 130), (5.0, -1, 12, -10, 200), (-3.2, -1, 12, -12, 250)]
    crowd(ctx, f0, f1, lanes, seed=11)
    ctx.camera('CAM_S11a', f0, fb, [
        (f0, (1.6, -1.6, 1.25), (-0.2, 1.7, 1.0), 32),
        (fb, (1.2, -0.9, 1.2), (-0.2, 1.8, 1.05), 36)], fstop=3.2, shake=0.008)
    ctx.camera('CAM_S11b', fb + 1, fc, [
        (fb + 1, (-0.95, 1.0, 1.15), (-0.29, 1.95, 1.1), 50),
        (fc, (-0.9, 1.08, 1.15), (-0.29, 1.95, 1.1), 56)], fstop=2.2)
    ctx.camera('CAM_S12a', fc + 1, fd, [
        (fc + 1, (-1.5, 0.3, 1.3), (-0.3, 1.8, 1.0), 38),
        (fd, (-1.2, 0.6, 1.3), (-0.3, 1.8, 1.0), 44)], fstop=2.8, shake=0.006)
    ctx.camera('CAM_S12b', fd + 1, f1, [
        (fd + 1, (-0.55, 1.15, 1.2), (-0.27, 1.62, 0.66), 45),
        (f1 - 40, (-0.6, 1.1, 1.25), (-0.27, 1.62, 0.68), 40),
        (f1, (0.6, 0.6, 1.5), (0.2, 1.95, 0.6), 30)], fstop=2.0)
    ctx.sfx(f0 + 20, 'footsteps_hard_floor_reverb_loop', -16); ctx.sfx(give + 10, 'wrapper_chip_bag_crinkle', -12)
    ctx.sfx(turn + 4, 'newspaper_page_turn', -8); ctx.sfx(wr + 2, 'pen_scribble', -6); ctx.sfx(wr + 40, 'pencil_writing_long', -10)

# =================================================================== G13 : night, then years pass (timelapse)
def G13(ctx):
    f0, f1 = F(66.0), F(78.6) - 1
    ft = F(70.8) - 1
    terminal_light(f0, 'night'); set_clock(f0, 2.4); set_clock(ft, 2.5)
    board_prog(f0, [' ' * 50] * 8)
    cart, items = home(ctx, level=2)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.28)
    # lying on the bench (rotate the whole rig to lie on its side)
    hero.place(f0, 0.95, 2.0, 0.64, 0)
    hero.root(f0, 0, 0, 0)
    hero.rig.rotation_mode = 'XYZ'
    lie = hero.rig
    lie.rotation_euler = (0, math.radians(-90), 0)
    lie.keyframe_insert('rotation_euler', frame=f0 - 1)
    hero.pose(f0, A.sym({'upperleg01.LR': (-38, 0, 0), 'lowerleg01.LR': (70, 0, 0), 'spine04': (10, 0, 0), 'spine03': (8, 0, 0), 'head': (12, 0, -8)}))
    hero.hands(f0, (0.05, -0.3, 1.25), r=(0.02, -0.28, 1.05), pole_l=(0.4, 0.3, 1.2))
    H.expr(hero, f0, 'sleep'); hero.breath_rate.key(f0, 0.18); hero.breath.key(f0, 2.4); hero.idle.key(f0, 0.15)
    hero.bake(f0, ft)
    bl = X.blanket('Blanket', coll('PROPS'), size=(1.05, 0.8))
    bl.location = (0.45, 1.92, 0.84)
    import sets_extra as _X
    nl = _X.spot('NightBenchLight', (1.5, -1.0, 4.2), (0.0, 2.0, 0.6), energy=900, size=35, blend=0.6, color=(0.75, 0.85, 1.0), c=coll('PROPS'))
    ctx.only_in(nl, f0, ft); bl.rotation_euler = (0, 0, 0)
    ctx.only_in(bl, f0, ft)
    ctx.camera('CAM_S13', f0, ft, [
        (f0, (1.8, -1.2, 1.6), (0.0, 2.0, 0.6), 30),
        (ft, (0.9, -0.2, 1.25), (0.0, 2.0, 0.65), 38)], fstop=2.8, shake=0.004)
    # ---- timelapse: years pass. day/night cycles, hero cycles through his routine, crowd streams
    lie.rotation_euler = (0, 0, 0); lie.keyframe_insert('rotation_euler', frame=ft + 1)
    for fc_ in lie.animation_data.action.fcurves:
        if fc_.data_path == 'rotation_euler':
            for k in fc_.keyframe_points: k.interpolation = 'CONSTANT'
    tl = ctx.actor(HERO, ft + 1, f1, seed=5)
    n = f1 - ft
    poses = ['sit', 'read', 'sit_back', 'write', 'look', 'read']
    for i, f in enumerate(range(ft + 1, f1 + 1, 9)):
        H.sit_frame(tl, f, SEAT)
        kind = poses[i % len(poses)]
        if kind in ('read',):
            H.seated_upper(tl, f, lean=10, head=(20, 0, 0)); tl.hands(f, (0.2, -0.4, 0.95), r=(-0.2, -0.4, 0.95))
        elif kind == 'write':
            H.seated_upper(tl, f, lean=20, head=(30, 0, 0)); tl.hands(f, (0.1, -0.36, 0.72), r=(-0.06, -0.38, 0.70))
        elif kind == 'sit_back':
            H.seated_upper(tl, f, lean=-2, slouch=12); tl.hands(f, (0.05, -0.14, 0.67), r=(-0.05, -0.15, 0.68))
        else:
            H.seated_upper(tl, f, lean=8, slouch=6, head=(0, 0, (i * 37) % 60 - 30)); H.hands_on_thighs(tl, f)
        tl.hold(f + 7)
    tl.idle.key(ft, 0.0); tl.breath.key(ft, 0.0)
    tl.bake(ft + 1, f1)
    for i, f in enumerate(range(ft + 1, f1 + 1, 9)):
        ctx.grey(HERO, f, 0.28 + 0.2 * (f - ft) / n)
    # day/night flicker cycles
    cyc = ['night', 'morning', 'day', 'day', 'evening', 'night']
    for i, f in enumerate(range(ft + 1, f1 + 1, 6)):
        terminal_light(f, cyc[i % len(cyc)])
    set_clock(ft + 1, 2.5); set_clock(f1, 2.5 + 140)
    # luggage piles up
    set_home_level(ctx, items, ft + 1, 1); set_home_level(ctx, items, ft + 60, 2); set_home_level(ctx, items, ft + 140, 3)
    lanes = [(y, d, -14 * d, 14 * d, int(o)) for (y, d, o) in [(-0.8, 1, 0), (-1.6, -1, 5), (-2.5, 1, 9), (-3.4, -1, 2), (0.6, 1, 14), (-4.5, -1, 20), (-1.2, -1, 25), (-3.0, 1, 30)]]
    crowd(ctx, ft + 1, f1, lanes, seed=13, speed_mul=3.2)
    ctx.camera('CAM_S14', ft + 1, f1, [
        (ft + 1, (2.6, -5.2, 3.4), (-0.1, 1.8, 0.7), 24),
        (f1, (2.0, -4.3, 3.0), (-0.1, 1.8, 0.75), 26)], fstop=None)
    ctx.overlay(kind='years', f0=ft + 10, f1=f1 - 30, y0=1989, y1=1998)
    ctx.sfx(f0, 'snore_man_loop', -10); ctx.sfx(ft - 8, 'whoosh_tunnel_reverb', -8)
    ctx.sfx(ft + 1, 'clock_wall_ticking', -6)
    for k in range(ft + 1, f1 - 10, 45): ctx.sfx(k, 'splitflap_substitute_card_shuffle', -16)
    board_prog(ft + 1, T.BOARD_1988)

# =================================================================== G15 : 1999 papers, Sir Alfred
def G15(ctx):
    f0, f1 = F(78.6), F(90.8) - 1
    fb = F(83.2) - 1     # doc insert
    fcc = F(84.9) - 1    # head shake
    fd = F(86.6) - 1     # sir alfred
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988); set_clock(f0, 15.0)
    cart, items = home(ctx, level=3)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.45)
    of = ctx.actor('Official', f0, fcc)
    for f in (f0, f1): H.sit_frame(hero, f, SEAT)
    of.place(f0, 0.3, 0.95, 0, 160)
    of.pose(f0, {'spine03': (14, 0, 0), 'spine02': (6, 0, 0), 'head': (10, 0, 0)})
    of.hands(f0, (0.18, -0.35, 1.02), r=(-0.12, -0.5, 1.0))
    of.hand(f0 + 30, 'R', (-0.12, -0.55, 1.0)); of.hand(f0 + 44, 'R', (-0.215, -0.03, 0.865))
    H.expr(of, f0, 'soft_smile', 0.5); of.face(f0 + 12, jawOpen=0.15); of.face(f0 + 18, jawOpen=0.02); of.face(f0 + 26, jawOpen=0.14); of.face(f0 + 34, jawOpen=0.0)
    of.blinks(f0, fcc); of.bake(f0, fcc)
    # hero takes the papers, reads intently
    H.seated_upper(hero, f0, lean=6, head=(0, 0, 0)); H.hands_on_thighs(hero, f0)
    H.look(hero, f0, yaw=-20, pitch=-14); H.expr(hero, f0, 'neutral')
    hero.hand(f0 + 26, 'R', (-0.18, -0.48, 0.98)); hero.hand(f0 + 42, 'R', (-0.1, -0.4, 0.92))
    hero.hand(f0 + 46, 'L', (0.12, -0.4, 0.92))
    H.seated_upper(hero, f0 + 46, lean=12, head=(22, 0, 0)); H.look(hero, f0 + 50, pitch=22); H.expr(hero, f0 + 60, 'focus')
    H.expr(hero, fb, 'stern', 0.6)
    # head shake, hands the papers back
    H.seated_upper(hero, fcc + 1, lean=4, head=(0, 0, 0)); H.look(hero, fcc + 1, yaw=-18, pitch=-10)
    H.head_shake(hero, fcc + 3, n=2, amp=12, period=8); H.expr(hero, fcc + 3, 'stern')
    hero.hand(fcc + 6, 'R', (-0.18, -0.5, 1.0)); hero.hand(fcc + 30, 'R', (-0.2, -0.3, 0.7)); hero.hand(fcc + 12, 'L', (0.17, -0.3, 0.61))
    # Sir Alfred: writes the name on a luggage tag
    sa = fd + 1
    H.seated_upper(hero, sa, lean=20, head=(30, 0, 0))
    hero.hands(sa, (0.1, -0.36, 0.72), r=(-0.06, -0.38, 0.70))
    for k in range(10):
        hero.hand(sa + 4 + k * 9, 'R', (-0.08 + 0.016 * k, -0.38, 0.70 + (0.01 if k % 2 else 0)))
    H.expr(hero, sa + 70, 'proud'); H.seated_upper(hero, f1, lean=4, head=(-2, 0, 0)); H.look(hero, f1, yaw=-10, pitch=-4)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    c = coll('PROPS')
    doc = X.document('Residency', '/opt/work/tex/residency.png', c, 0.21, 0.297)
    follow_hand(doc, of, 'R', f0, f0 + 36, offset=(0, -0.12, 0.0), rot=(math.radians(75), 0, 0))
    seq = []
    for f in range(f0 + 37, fcc + 30):
        p, rz = hand_world(hero, 'R', f, (0.1, -0.1, 0.06)); seq.append((f, p, rz))
    key_prop_path(doc, seq, rot=(math.radians(60), 0, math.radians(180)))
    ctx.only_in(doc, f0, fcc + 30)
    # insert document (big copy laid out for the close-up)
    big = X.document('ResidencyInsert', '/opt/work/tex/residency.png', c, 0.21, 0.297)
    big.location = (40.0, 0.0, 1.0); big.rotation_euler = (math.radians(90), 0, 0)
    mk = box('RedMarker', (0.064, 0.002, 0.0028), loc=(40.025, -0.004, 0.9985), mat=mat_emit('RedMarkerM', (1.0, 0.05, 0.03), 2.5), c=c)
    for f, sx in ((fb + 1, 0.001), (fb + 14, 0.001), (fb + 26, 1.0)):
        mk.scale = (sx, 1, 1); mk.keyframe_insert('scale', frame=f)
    pen_ = X.pen('Pen2', c)
    tag = X.luggage_tag('Tag', c)
    p, rz = char_to_world(hero, sa + 2, (0.0, -0.38 + 0.425, 0.66))
    tag.location = p; tag.rotation_euler = (math.radians(10), 0, rz); tag.scale = (2.4, 2.4, 2.4)
    ctx.only_in(tag, fd, f1)
    # handwriting reveal: a paper-coloured mask slides off the text
    mask = plane('TagMask', 0.12, 0.06, mat=mat_color('TagPaper', (0.72, 0.62, 0.42), rough=0.9), c=c)
    mask.parent = tag; mask.location = (0, 0, 0.0008)
    for f, sx in ((sa + 2, 1.0), (sa + 88, 0.0)):
        mask.scale = (max(0.001, sx), 1, 1); mask.location = (0.06 - 0.06 * sx, 0, 0.0008)
        mask.keyframe_insert('scale', frame=f); mask.keyframe_insert('location', frame=f)
    follow_hand(pen_, hero, 'R', fd, f1, offset=(0.0, -0.05, 0.03), rot=(math.radians(-35), math.radians(10), math.radians(70)))
    ctx.only_in(pen_, fd, f1)
    lanes = [(4.2, -1, 10, -10, 0), (5.4, 1, -10, 10, 30), (-2.4, 1, -12, 10, 40), (3.8, 1, -12, 10, 160), (-3.2, -1, 12, -12, 220)]
    crowd(ctx, f0, f1, lanes, seed=15)
    ctx.camera('CAM_S15a', f0, fb, [
        (f0, (-1.6, -0.6, 1.35), (0.0, 1.6, 1.15), 32),
        (fb, (-1.3, -0.2, 1.3), (-0.1, 1.7, 1.1), 36)], fstop=3.0, shake=0.007)
    ctx.camera('CAM_S15b', fb + 1, fcc, [
        (fb + 1, (40.0, -0.42, 1.0), (40.0, 0.0, 1.0), 50),
        (fcc, (40.023, -0.22, 1.008), (40.023, 0.0, 1.008), 50)], fstop=5.6, clip=(0.01, 50))
    ctx.camera('CAM_S15c', fcc + 1, fd, [
        (fcc + 1, (0.45, 0.85, 1.2), (-0.3, 1.88, 1.12), 50),
        (fd, (0.4, 0.95, 1.2), (-0.3, 1.88, 1.12), 55)], fstop=2.2)
    ctx.camera('CAM_S16', fd + 1, f1, [
        (fd + 1, (-0.3, 1.45, 1.05), (-0.29, 1.68, 0.67), 50),
        (f1 - 30, (-0.3, 1.42, 1.02), (-0.29, 1.68, 0.67), 50),
        (f1, (0.5, 0.7, 1.25), (-0.29, 1.85, 1.0), 34)], fstop=2.2)
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='1999')
    ctx.overlay(kind='title', f0=fd + 70, f1=f1 - 4, text='"SIR ALFRED MEHRAN"', sub='')
    ctx.sfx(f0 + 30, 'newspaper_page_turn', -14); ctx.sfx(fb + 1, 'whoosh_cinematic_fast', -10); ctx.sfx(sa + 4, 'pen_signing', -6)

# =================================================================== G17 : reporters, the film
def G17(ctx):
    f0, f1 = F(90.8), F(99.6) - 1
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988); set_clock(f0, 13.0)
    cart, items = home(ctx, level=3)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.55)
    for f in (f0, f1): H.sit_frame(hero, f, SEAT)
    H.seated_upper(hero, f0, lean=-2, slouch=4); hero.hands(f0, (0.05, -0.14, 0.67), r=(-0.05, -0.15, 0.68), pole_l=(0.5, 0.5, 0.8)); hero.pose(f0, A.fingers(0.55, 0.4))
    H.expr(hero, f0, 'proud', 0.8)
    looks = [(-25, -6), (15, -8), (-5, -10), (30, -6), (-15, -8)]
    for i, (yw, pt) in enumerate(looks):
        H.look(hero, f0 + 15 + i * 50, yaw=yw, pitch=pt)
    hero.face(f0 + 120, jawOpen=0.15); hero.face(f0 + 126, jawOpen=0.02); hero.face(f0 + 132, jawOpen=0.12); hero.face(f0 + 140, jawOpen=0.0)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    c = coll('PROPS')
    cam1 = import_gltf('Camera_01', c=c); vcam = import_gltf('vintage_video_camera', c=c)
    reps = []
    for nm, pos, rz, hold in (('Reporter1', (-0.9, 0.55), 160, 'photo'), ('Reporter2', (0.35, 0.55), 203, 'mic'), ('Reporter3', (1.3, 0.9), 234, 'video')):
        r = ctx.actor(nm, f0, f1)
        r.place(f0, pos[0], pos[1], 0, rz); r.place(f1, pos[0] + 0.1, pos[1] - 0.05, 0, rz + 5)
        r.pose(f0, {'spine03': (8, 0, 0), 'head': (6, 0, 0)})
        if hold == 'photo':
            r.hands(f0, (0.08, -0.25, 1.52), r=(-0.1, -0.22, 1.5)); r.pose(f0, {'head': (-4, 0, 0)})
        elif hold == 'video':
            r.hands(f0, (0.05, -0.2, 1.48), r=(-0.18, -0.15, 1.5))
        else:
            r.hands(f0, (0.215, -0.03, 0.865), r=(-0.15, -0.45, 1.25)); H.expr(r, f0, 'soft_smile', 0.5)
            for k in range(0, f1 - f0 - 10, 14): r.face(f0 + k, jawOpen=0.18 if (k // 14) % 2 else 0.02)
        r.blinks(f0, f1); r.bake(f0, f1); reps.append((r, hold))
    for r, hold in reps:
        if hold == 'photo':
            cam1.rotation_euler = (0, 0, 0); follow_hand(cam1, r, 'L', f0, f1, offset=(-0.08, -0.08, 0.02), rot=(0, 0, math.radians(180)))
            for k, fr in enumerate(range(f0 + 20, f1 - 10, 37)):
                p, rz = hand_world(r, 'L', fr, (-0.08, -0.15, 0.05)); flash(ctx, fr, p); ctx.sfx(fr, 'camera_shutter_click', -6)
        if hold == 'video':
            follow_hand(vcam, r, 'R', f0, f1, offset=(0.1, 0.0, 0.08), rot=(0, 0, math.radians(180)))
        if hold == 'mic':
            mic = cyl('Mic', 0.02, 0.2, mat=mat_color('MicBlack', (0.02, 0.02, 0.02), rough=0.4), c=c, verts=10)
            follow_hand(mic, r, 'R', f0, f1, offset=(0, -0.08, 0.06), rot=(math.radians(-50), 0, 0))
    ctx.camera('CAM_S17', f0, f1, [
        (f0, (-2.6, 0.6, 1.5), (-0.2, 1.7, 1.1), 28),
        (f0 + 140, (-2.1, 0.95, 1.45), (-0.3, 1.85, 1.1), 34),
        (f1, (-1.65, 1.2, 1.38), (-0.3, 1.9, 1.12), 42)], fstop=2.8, shake=0.015)
    ctx.overlay(kind='film', f0=F(94.6), f1=f1 - 4, text='THE TERMINAL', sub='2004 · inspired by his story')
    ctx.sfx(f0, 'camera_press_crowd_flashes', -4)

# =================================================================== G18 : 2006, he leaves
def G18(ctx):
    f0, f1 = F(99.6), F(107.0) - 1
    terminal_light(f0, 'day'); board_prog(f0, T.BOARD_1988); set_clock(f0, 16.0)
    cart, items = home(ctx, level=3)
    hero = ctx.actor(HERO, f0, f1); ctx.grey(HERO, f0, 0.65)
    md = ctx.actor('Medic', f0, f1)
    c = coll('PROPS')
    wc = import_gltf('wheelchair_01', c=c)
    path = [(-0.35, 1.0), (-0.6, -1.5), (-3.0, -4.0), (-9.0, -6.5)]
    start = f0 + 30
    md.place(f0, -0.35, 0.05, 0, 0)
    H.hands_relaxed(md, f0)
    md.walk(start, f1, [(-0.35, 0.05), (-0.6, -2.4), (-3.2, -4.8), (-9.0, -7.2)], speed=0.8, stride=0.6, ease=20, style=dict(push=True, lean=8, arm=0))
    md.blinks(f0, f1); md.bake(f0, f1)
    # wheelchair moves in front of the medic, hero sits in it
    seq = []
    for f in range(f0, f1 + 1):
        p, rz = char_to_world(md, f, (0, -0.62, 0)); seq.append((f, p, rz))
    key_prop_path(wc, seq, rot=(0, 0, math.radians(180)))
    # hero seated in the chair, head lowered, hands in lap
    for f in range(f0, f1 + 1, 3):
        p, rz = char_to_world(md, f, (0, -0.62 - 0.05, 0))
        # character faces same way as the medic: rotz = medic heading
        hero.place(f, p.x + math.sin(rz) * 0.38 * -1 * 0, p.y, 0, math.degrees(rz))
    for f in (f0, f1):
        hero.root(f, 0, 0.42, (0.5 + 0.09) - hero.hip_z)
        for side in ('L', 'R'): hero.leg_ik(f, side, (0, -0.42, (hero.ankle_z + 0.12) - 0.59))
    H.seated_upper(hero, f0, lean=10, slouch=10, head=(15, 0, 0)); hero.hands(f0, (0.1, -0.3, 0.68), r=(-0.08, -0.3, 0.66))
    H.expr(hero, f0, 'sad', 0.7); H.look(hero, f0 + 20, yaw=40, pitch=6)   # looks back at the bench
    H.look(hero, f0 + 80, yaw=60, pitch=4); H.look(hero, f0 + 150, yaw=10, pitch=12)
    hero.blinks(f0, f1); hero.bake(f0, f1)
    lanes = [(4.2, -1, 10, -10, 0), (5.4, 1, -10, 10, 40), (-6.0, 1, -12, 12, 20)]
    crowd(ctx, f0, f1, lanes, seed=18)
    ctx.camera('CAM_S18', f0, f1, [
        (f0, (0.9, 2.6, 1.2), (-0.4, -0.5, 1.0), 32),
        (f1, (0.6, 2.4, 1.35), (-3.0, -4.0, 1.0), 30)], fstop=3.5, shake=0.006)
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='2006')
    ctx.sfx(f0 + 20, 'heart_monitor_beep_67bpm', -18); ctx.sfx(start, 'trolley_suitcase_wheels', -14)

# =================================================================== G19 : 2022 return, ending
def G19(ctx):
    f0, f1 = F(107.0), F(121.0)
    fe = F(113.6) - 1
    terminal_light(f0, 'modern'); board_prog(f0, [
        "18:05  AF 1680  LONDRES HEATHROW      F22  A L'HEURE", "18:10  AF 1340  MADRID                F31  EMBARQUEMENT",
        "18:20  AF 1104  ROME FIUMICINO        F14  A L'HEURE", "18:25  AF 1240  AMSTERDAM             F25  RETARDE 18:55",
        "18:40  AF 1450  COPENHAGUE            F08  A L'HEURE", "18:55  AF 1024  LISBONNE              F11  A L'HEURE",
        "19:05  AF 1180  FRANCFORT             F03  A L'HEURE", "19:20  AF 1580  BERLIN                F19  A L'HEURE"])
    c = coll('PROPS')
    sign = box('Sign2F', (3.0, 0.08, 0.6), loc=(-6.0, 3.0, 3.4), mat=mat_color('Sign2FBG', (0.05, 0.08, 0.2), rough=0.5), c=c)
    t2 = text('Sign2FTxt', 'TERMINAL 2F', size=0.34, loc=(-6.0, 2.95, 3.4), mat=mat_emit('Sign2FTxtM', (1, 1, 1), 3.0), c=c, fnt='Oswald.ttf')
    ctx.only_in(sign, f0, fe); ctx.only_in(t2, f0, fe)
    hero = ctx.actor(HERO, f0, fe); ctx.grey(HERO, f0, 0.95)
    seatx, seaty = -6.0, 2.0 - 0.02
    arrive = f0 + 90
    hero.walk(f0, arrive, [(-11.0, -0.5), (-7.5, 0.9), (seatx + 0.02, seaty - 0.38)], speed=0.7, stride=0.5, ease=24, style=dict(tired=0.8, lean=14, arm=6, bob=0.012, hold='L'))
    hero.place(arrive + 2, seatx + 0.02, seaty - 0.38, 0, 90)
    hero.place(arrive + 18, seatx, seaty - 0.38, 0, 0)
    t0 = arrive + 20
    hero.root(t0, 0, 0, -0.03)
    for side in ('L', 'R'): hero.leg_ik(t0, side, (0, 0.0, hero.ankle_z - hero.hip_z + 0.03))
    hero.pose(t0, {'spine04': (10, 0, 0), 'spine03': (10, 0, 0)})
    mid = t0 + 14
    hero.root(mid, 0, 0.22, -0.2)
    for side in ('L', 'R'): hero.leg_ik(mid, side, (0, -0.24, hero.ankle_z - (hero.hip_z - 0.2)))
    hero.pose(mid, {'spine04': (20, 0, 0), 'spine03': (16, 0, 0), 'head': (-10, 0, 0)})
    hero.hands(mid, (0.2, -0.25, 0.7), r=(-0.2, -0.25, 0.7))
    sit = t0 + 26
    H.sit_frame(hero, sit, (seatx, seaty)); H.seated_upper(hero, sit, lean=8, slouch=12, head=(10, 0, 0)); H.hands_on_thighs(hero, sit)
    H.sit_frame(hero, fe, (seatx, seaty))
    H.expr(hero, f0, 'tired'); H.expr(hero, sit + 10, 'sigh'); H.expr(hero, sit + 40, 'tired')
    H.look(hero, sit + 30, yaw=-15, pitch=-10)             # looks up at the board one last time
    H.expr(hero, sit + 60, 'soft_smile', 0.4)
    H.seated_upper(hero, fe - 20, lean=4, slouch=16, head=(22, 0, 0)); H.expr(hero, fe - 10, 'sleep')
    hero.breath.key(fe - 40, 1.0); hero.breath.key(fe - 5, 0.2)
    hero.blinks(f0, sit + 50); hero.bake(f0, fe)
    bagp = X.briefcase('OldBag', c, color=(0.1, 0.09, 0.08))
    follow_hand(bagp, hero, 'L', f0, arrive + 10, offset=(0, 0, -0.18))
    key_prop_path(bagp, [(arrive + 11, Vector((seatx + 0.58, seaty, 0.465 + 0.16)), None), (fe, Vector((seatx + 0.58, seaty, 0.465 + 0.16)), None)])
    ctx.only_in(bagp, f0, fe)
    lanes = [(4.2, -1, 2, -16, 0), (5.4, 1, -16, 4, 30), (-2.4, 1, -16, 0, 40), (-5.5, -1, 0, -16, 80)]
    crowd(ctx, f0, fe, lanes, seed=19)
    ctx.camera('CAM_S19', f0, fe, [
        (f0, (-4.0, -4.6, 1.5), (-9.5, 0.5, 1.2), 30),
        (arrive, (-4.6, -3.0, 1.4), (-6.3, 1.5, 1.0), 32),
        (fe, (-5.4, -0.6, 1.25), (-6.3, 1.9, 1.05), 40)], fstop=2.8, shake=0.006)
    ctx.overlay(kind='place', f0=f0 + 6, f1=f0 + 70, text='2022')
    ctx.overlay(kind='place', f0=fe - 70, f1=fe - 2, text='12 NOVEMBER 2022')
    # ---- ending: the empty red bench in Terminal 1, his things still beside it
    cart, items = home(ctx, level=3)
    for o, lv in items: ctx.only_in(o, fe + 1, f1)
    ctx.only_in(cart, fe + 1, f1)
    terminal_light(fe + 1, 'evening')
    lanes = [(4.2, -1, 10, -10, 0), (5.4, 1, -10, 10, 20), (-1.0, 1, -12, 10, 60), (3.8, -1, 12, -10, 110)]
    crowd(ctx, fe + 1, f1, lanes, seed=20, names=['Pax5', 'Pax6', 'Pax7', 'Pax8'])
    ctx.camera('CAM_S20', fe + 1, f1, [
        (fe + 1, (0.0, 0.2, 0.8), (-0.1, 2.0, 0.6), 35),
        (f1, (0.6, -4.5, 3.6), (0.0, 2.0, 0.8), 28)], fstop=4.0)
    ctx.overlay(kind='end', f0=fe + 120, f1=f1, text='MEHRAN KARIMI NASSERI', sub='1945 – 2022')
    ctx.sfx(f0, 'amb_airport_terminal_busy_crowd', -12); ctx.sfx(fe - 30, 'pa_chime_airport_melodic', -12)
