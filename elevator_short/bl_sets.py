"""Environments and props: elevator car (interior + exterior), shaft, hallway (floor 7), stairwell."""
import bpy, math, random
from mathutils import Vector
from bl_lib import *

FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

CW, CD, CH = 0.8, 0.75, 2.3          # car half-width, half-depth, height
DOOR_W, DOOR_H = 0.45, 2.1
HALL_Z = 1.1                          # floor-7 landing height when the car is stuck
SHAFT_FRONT = -0.84                   # inner face of the shaft front wall
HALL_Y = -1.14                        # hallway side of the shaft front wall
STAIR_X = 20.0


class Sets:
    pass


def materials():
    M = {}
    M["steel"] = noise_mat("steel_brushed", (0.42, 0.44, 0.47), (0.62, 0.64, 0.67), scale=3, rough=0.28, metal=0.9,
                           stretch=(1, 1, 120), rough2=0.42)
    M["steel_door"] = noise_mat("steel_door", (0.55, 0.56, 0.58), (0.75, 0.76, 0.78), scale=3, rough=0.22, metal=0.95,
                                stretch=(1, 1, 150), rough2=0.35)
    M["darkmetal"] = mat("darkmetal", (0.05, 0.05, 0.055), rough=0.4, metal=0.8)
    M["seam"] = mat("seam", (0.02, 0.02, 0.02), rough=0.6)
    M["brass"] = mat("brass", (0.85, 0.62, 0.3), rough=0.2, metal=1.0)
    M["floor"] = tile_mat("car_floor", (0.09, 0.09, 0.1), (0.13, 0.12, 0.12), scale=3.5, rough=0.3)
    M["ceiling"] = mat("ceiling", (0.18, 0.18, 0.19), rough=0.5, metal=0.5)
    M["panel"] = mat("light_panel", (1, 1, 1), emit=(1.0, 0.93, 0.82), emit_strength=6.0)
    M["concrete"] = noise_mat("concrete", (0.17, 0.17, 0.18), (0.32, 0.31, 0.3), scale=6, rough=0.9, bump=0.4)
    M["rail"] = mat("rail", (0.12, 0.13, 0.14), rough=0.35, metal=0.9)
    M["yellow"] = mat("safety_yellow", (0.85, 0.6, 0.02), rough=0.5)
    M["cable"] = mat("cable", (0.3, 0.3, 0.32), rough=0.25, metal=1.0)
    M["brake"] = mat("brake_steel", (0.25, 0.25, 0.27), rough=0.4, metal=0.6, emit=(1.0, 0.12, 0.0), emit_strength=0.0)
    M["hall_wall"] = noise_mat("hall_wall", (0.52, 0.56, 0.52), (0.6, 0.63, 0.58), scale=2, rough=0.8)
    M["hall_floor"] = tile_mat("hall_floor", (0.55, 0.5, 0.44), (0.62, 0.58, 0.5), scale=1.2, rough=0.18,
                               mortar=(0.25, 0.22, 0.2))
    M["hall_ceiling"] = mat("hall_ceiling", (0.8, 0.8, 0.78), rough=0.9)
    M["hall_light"] = emit_mat("hall_light", (1.0, 0.97, 0.9), 8.0)
    M["wood"] = noise_mat("wood_door", (0.32, 0.17, 0.08), (0.45, 0.26, 0.12), scale=4, rough=0.45, stretch=(1, 1, 30))
    M["exit"] = emit_mat("exit_green", (0.1, 1.0, 0.25), 6.0)
    M["white_plastic"] = mat("white_plastic", (0.85, 0.86, 0.88), rough=0.3)
    M["water_blue"] = mat("water_blue", (0.3, 0.6, 1.0), rough=0.05, alpha=0.45, coat=1.0)
    M["led_red"] = emit_mat("led_red", (1.0, 0.08, 0.03), 8.0)
    M["black_glass"] = mat("black_glass", (0.01, 0.01, 0.012), rough=0.08, coat=1.0)
    M["stair_wall"] = noise_mat("stair_wall", (0.42, 0.47, 0.55), (0.5, 0.54, 0.6), scale=3, rough=0.85, bump=0.15)
    M["stair_step"] = noise_mat("stair_step", (0.3, 0.3, 0.3), (0.4, 0.39, 0.37), scale=10, rough=0.7)
    M["stencil"] = mat("stencil", (0.95, 0.85, 0.2), rough=0.7)
    M["paint_white"] = mat("paint_white", (0.85, 0.85, 0.82), rough=0.7)
    M["plant"] = noise_mat("plant", (0.05, 0.25, 0.06), (0.15, 0.45, 0.1), scale=15, rough=0.6)
    M["pot"] = mat("pot", (0.55, 0.22, 0.1), rough=0.6)
    M["hallway_glow"] = emit_mat("hallway_glow", (1.0, 0.95, 0.85), 3.0)
    return M


def build_car(M, parent):
    S = Sets()
    c = parent
    box("car_floor", (2 * CW + 0.12, 2 * CD + 0.12, 0.12), (0, 0, -0.06), M["floor"], c)
    box("car_ceiling", (2 * CW + 0.12, 2 * CD + 0.12, 0.1), (0, 0, CH + 0.05), M["ceiling"], c)
    S.panel = box("car_light_panel", (1.0, 0.7, 0.02), (0, 0.05, CH - 0.005), M["panel"], c)
    box("car_panel_frame", (1.06, 0.76, 0.012), (0, 0.05, CH - 0.001), M["darkmetal"], c)
    S.back = box("car_wall_back", (2 * CW + 0.12, 0.06, CH + 0.1), (0, CD + 0.03, CH / 2), M["steel"], c)
    S.left = box("car_wall_left", (0.06, 2 * CD + 0.12, CH + 0.1), (-CW - 0.03, 0, CH / 2), M["steel"], c)
    S.right = box("car_wall_right", (0.06, 2 * CD + 0.12, CH + 0.1), (CW + 0.03, 0, CH / 2), M["steel"], c)
    pw = CW - DOOR_W
    S.front_l = box("car_front_l", (pw + 0.06, 0.06, CH + 0.1), (-(DOOR_W + pw / 2 + 0.03), -CD - 0.03, CH / 2), M["steel"], c)
    S.front_r = box("car_front_r", (pw + 0.06, 0.06, CH + 0.1), ((DOOR_W + pw / 2 + 0.03), -CD - 0.03, CH / 2), M["steel"], c)
    box("car_header", (2 * DOOR_W, 0.06, CH - DOOR_H + 0.05), (0, -CD - 0.03, (CH + DOOR_H) / 2), M["steel"], c)
    # panel seams + kick plates + handrails
    for x in (-0.27, 0.27):
        box("seam_b%.2f" % x, (0.012, 0.004, CH), (x, CD - 0.001, CH / 2), M["seam"], c)
    for s in (-1, 1):
        for y in (-0.25, 0.25):
            box("seam_s%d%.2f" % (s, y), (0.004, 0.012, CH), (s * (CW - 0.001), y, CH / 2), M["seam"], c)
    box("kick_b", (2 * CW, 0.01, 0.12), (0, CD - 0.004, 0.06), M["darkmetal"], c)
    for s in (-1, 1):
        box("kick_s%d" % s, (0.01, 2 * CD, 0.12), (s * (CW - 0.004), 0, 0.06), M["darkmetal"], c)
    cyl("rail_back", 0.02, 2 * CW - 0.2, (0, CD - 0.07, 0.92), M["brass"], c, rot=(0, 90, 0))
    for s in (-1, 1):
        cyl("rail_side%d" % s, 0.02, 2 * CD - 0.3, (s * (CW - 0.07), 0.05, 0.92), M["brass"], c, rot=(90, 0, 0))
        for y in (-0.45, 0.55):
            box("bracket%d%.1f" % (s, y), (0.06, 0.02, 0.02), (s * (CW - 0.035), y, 0.92), M["brass"], c)
    for x in (-0.6, 0.6):
        box("bracketb%.1f" % x, (0.02, 0.06, 0.02), (x, CD - 0.035, 0.92), M["brass"], c)
    # doors
    S.door_l = box("car_door_l", (DOOR_W + 0.01, 0.03, DOOR_H), (-DOOR_W / 2, -CD + 0.012, DOOR_H / 2),
                   M["steel_door"], c, bevel=0.004, segs=1)
    S.door_r = box("car_door_r", (DOOR_W + 0.01, 0.03, DOOR_H), (DOOR_W / 2, -CD + 0.012, DOOR_H / 2),
                   M["steel_door"], c, bevel=0.004, segs=1)
    box("door_sill", (2 * DOOR_W + 0.1, 0.06, 0.012), (0, -CD + 0.01, 0.006), M["darkmetal"], c)
    # button panel (on the front-right wall, inside)
    px, pz = DOOR_W + pw / 2, 1.18
    box("btn_panel", (0.2, 0.012, 0.62), (px, -CD + 0.006, pz), M["steel_door"], c, bevel=0.004, segs=1)
    font = load_font(FONT_BOLD)
    S.buttons = []
    k = 10
    for row in range(5):
        for col in range(2):
            bx = px - 0.045 + col * 0.09
            bz = pz + 0.22 - row * 0.085
            m = mat("btn_mat%d" % k, (0.75, 0.75, 0.78), rough=0.25, metal=0.8, emit=(1.0, 0.55, 0.1), emit_strength=0.0)
            b = cyl("btn%d" % k, 0.023, 0.012, (bx, -CD + 0.012, bz), m, c, rot=(90, 0, 0))
            text("btn_txt%d" % k, str(k), 0.022, (bx, -CD + 0.0185, bz), (90, 0, 180), M["seam"], c, font=font)
            S.buttons.append((b, m))
            k -= 1
    am = mat("alarm_mat", (0.9, 0.55, 0.02), rough=0.3, emit=(1.0, 0.3, 0.02), emit_strength=0.0)
    S.alarm = cyl("btn_alarm", 0.032, 0.016, (px, -CD + 0.014, pz - 0.23), am, c, rot=(90, 0, 0))
    S.alarm_mat = am
    # tiny bell glyph
    sphere("bell_glyph", 0.012, (px, -CD + 0.023, pz - 0.228), (1, 0.3, 1.1), M["seam"], c)
    # floor indicator above the doors
    box("indicator", (0.32, 0.02, 0.13), (0, -CD + 0.008, DOOR_H + 0.11), M["black_glass"], c)
    S.ind = {}
    mono = load_font(FONT_MONO)
    for lbl in ("12", "11", "10", "9", "8", "7", "--", "ERR"):
        t = text("ind_" + lbl, lbl, 0.085, (0, -CD + 0.0185, DOOR_H + 0.105), (90, 0, 180), M["led_red"], c, font=mono)
        t.hide_render = True
        S.ind[lbl] = t
    # ceiling vent
    S.vent_center = Vector((-0.45, 0.45, CH - 0.01))
    box("vent_frame", (0.34, 0.34, 0.02), (-0.45, 0.45, CH - 0.008), M["darkmetal"], c)
    for i in range(7):
        sl = box("vent_slat%d" % i, (0.3, 0.012, 0.03), (-0.45, 0.45 - 0.13 + i * 0.043, CH - 0.03), M["steel"], c)
        sl.rotation_euler = (rad(35), 0, 0)
    # inspection certificate
    box("cert_frame", (0.005, 0.2, 0.26), (-CW + 0.003, -0.3, 1.55), M["darkmetal"], c)
    box("cert_paper", (0.004, 0.18, 0.24), (-CW + 0.006, -0.3, 1.55), M["paint_white"], c)
    text("cert_txt", "INSPECTED\n2026", 0.025, (-CW + 0.009, -0.3, 1.6), (90, 0, 90), M["seam"], c, font=font)
    # ---------------- exterior: painted outer shell (reads better than mirror steel in the dark shaft)
    shell = mat("car_shell", (0.32, 0.34, 0.37), rough=0.45, metal=0.3)
    box("shell_l", (0.01, 2 * CD + 0.14, CH + 0.12), (-CW - 0.066, 0, CH / 2), shell, c)
    box("shell_r", (0.01, 2 * CD + 0.14, CH + 0.12), (CW + 0.066, 0, CH / 2), shell, c)
    box("shell_b", (2 * CW + 0.14, 0.01, CH + 0.12), (0, CD + 0.066, CH / 2), shell, c)
    box("shell_bottom", (2 * CW + 0.14, 2 * CD + 0.14, 0.01), (0, 0, -0.125), shell, c)
    for zz in (0.6, 1.2, 1.8):
        box("shell_rib_l%.1f" % zz, (0.03, 2 * CD + 0.14, 0.05), (-CW - 0.08, 0, zz), M["darkmetal"], c)
        box("shell_rib_r%.1f" % zz, (0.03, 2 * CD + 0.14, 0.05), (CW + 0.08, 0, zz), M["darkmetal"], c)
    # ---------------- exterior: frame, crosshead, safeties, cables
    for s in (-1, 1):
        box("stile%d" % s, (0.08, 0.14, 3.0), (s * 0.92, 0, 1.15), M["yellow"], c)
        box("guide_top%d" % s, (0.2, 0.14, 0.12), (s * 1.02, 0, 2.6), M["darkmetal"], c)
        S_br = box("safety%d" % s, (0.22, 0.24, 0.26), (s * 1.03, 0, -0.22), M["brake"], c, bevel=0.01, segs=1)
    box("crosshead", (2.0, 0.16, 0.16), (0, 0, 2.62), M["yellow"], c)
    box("plank", (2.0, 0.2, 0.16), (0, 0, -0.2), M["yellow"], c)
    box("hitch", (0.4, 0.2, 0.08), (0, 0, 2.74), M["darkmetal"], c)
    S.cables = []
    for i in range(6):
        x = -0.125 + i * 0.05
        S.cables.append(cyl("cable%d" % i, 0.009, 40.0, (x, 0.0, 2.78 + 20.0), M["cable"], c, verts=8))
    S.brake_mat = M["brake"]
    return S


def build_shaft(M):
    S = Sets()
    zb, zt = -14.0, 22.0
    h = zt - zb
    zc = (zb + zt) / 2
    box("shaft_back", (2.8, 0.3, h), (0, 1.45, zc), M["concrete"])
    box("shaft_left", (0.3, 2.9, h), (-1.45, 0.25, zc), M["concrete"])
    box("shaft_right", (0.3, 2.9, h), (1.45, 0.25, zc), M["concrete"])
    fy = SHAFT_FRONT - 0.15
    box("shaft_front_l", (0.8, 0.3, h), (-0.9, fy, zc), M["concrete"])
    box("shaft_front_r", (0.8, 0.3, h), (0.9, fy, zc), M["concrete"])
    font = load_font(FONT_BOLD)
    S.landing = {}
    for k in range(-4, 6):
        z = HALL_Z + 3.3 * k
        floor_no = 7 + k
        box("lintel%d" % k, (1.0, 0.3, 3.3 - 2.15), (0, fy, z + 2.15 + (3.3 - 2.15) / 2), M["concrete"])
        dl = box("ldoor_l%d" % k, (0.46, 0.03, 2.15), (-0.225, SHAFT_FRONT - 0.03, z + 1.075), M["steel_door"])
        dr = box("ldoor_r%d" % k, (0.46, 0.03, 2.15), (0.225, SHAFT_FRONT - 0.03, z + 1.075), M["steel_door"])
        S.landing[floor_no] = (dl, dr)
        if floor_no != 7:   # floor 7's hallway is a real set; others are blocked behind the doors
            box("ldoor_back%d" % k, (1.0, 0.05, 2.15), (0, SHAFT_FRONT - 0.2, z + 1.075), M["concrete"])
        text("floor_no%d" % k, str(floor_no), 0.45, (-0.95, SHAFT_FRONT + 0.001, z + 2.6), (90, 0, 180),
             M["paint_white"], font=font)
        box("sill%d" % k, (1.1, 0.12, 0.05), (0, SHAFT_FRONT + 0.04, z - 0.025), M["darkmetal"])
        # little caged work lamp per floor
        box("lamp%d" % k, (0.12, 0.06, 0.08), (1.25, 1.27, z + 2.4), M["hall_light"])
    for s in (-1, 1):
        box("rail_web%d" % s, (0.03, 0.12, h), (s * 1.17, 0, zc), M["rail"])
        box("rail_flange%d" % s, (0.025, 0.2, h), (s * 1.26, 0, zc), M["rail"])
        for z in range(int(zb), int(zt), 3):
            box("rail_bracket%d_%d" % (s, z), (0.2, 0.25, 0.08), (s * 1.3, 0, z), M["darkmetal"])
    # counterweight + its cables
    box("counterweight", (1.2, 0.25, 2.2), (0, 1.1, 9.0), M["darkmetal"])
    for i in range(6):
        cyl("cw_cable%d" % i, 0.008, 12.0, (-0.125 + i * 0.05, 1.1, 16.1), M["cable"], verts=8)
    return S


def build_hallway(M):
    S = Sets()
    z0, z1 = HALL_Z, HALL_Z + 2.8
    y0, y1 = HALL_Y, -4.6
    xa, xb = -6.0, 8.0
    box("hall_floor", (xb - xa, y0 - y1, 0.2), ((xa + xb) / 2, (y0 + y1) / 2, z0 - 0.1), M["hall_floor"])
    box("hall_ceiling", (xb - xa, y0 - y1, 0.2), ((xa + xb) / 2, (y0 + y1) / 2, z1 + 0.1), M["hall_ceiling"])
    box("hall_wall_far", (xb - xa, 0.2, z1 - z0), ((xa + xb) / 2, y1 - 0.1, (z0 + z1) / 2), M["hall_wall"])
    box("hall_wall_l", ((-1.3) - xa, 0.2, z1 - z0), ((xa - 1.3) / 2, y0 - 0.1, (z0 + z1) / 2), M["hall_wall"])
    box("hall_wall_r", (xb - 1.3, 0.2, z1 - z0), ((xb + 1.3) / 2, y0 - 0.1, (z0 + z1) / 2), M["hall_wall"])
    box("hall_wall_end_a", (0.2, y0 - y1, z1 - z0), (xa, (y0 + y1) / 2, (z0 + z1) / 2), M["hall_wall"])
    box("hall_wall_end_b", (0.2, y0 - y1, z1 - z0), (xb, (y0 + y1) / 2, (z0 + z1) / 2), M["hall_wall"])
    # shaft front wall faces the hallway between x=-1.3..1.3: steel portal frame around the landing doors
    for s in (-1, 1):
        box("portal%d" % s, (0.1, 0.06, 2.3), (s * 0.52, HALL_Y - 0.03, z0 + 1.15), M["steel"])
    box("portal_top", (1.14, 0.06, 0.12), (0, HALL_Y - 0.03, z0 + 2.21), M["steel"])
    for x in (-1.3 + 0.41, 1.3 - 0.41):    # cover the concrete face so the hall looks finished
        box("hall_face%.1f" % x, (0.78, 0.02, z1 - z0), (x, HALL_Y - 0.01, (z0 + z1) / 2), M["hall_wall"])
    box("hall_face_top", (1.0, 0.02, z1 - z0 - 2.27), (0, HALL_Y - 0.01, z0 + 2.27 + (z1 - z0 - 2.27) / 2), M["hall_wall"])
    box("baseboard", (xb - xa, 0.02, 0.1), ((xa + xb) / 2, y1 + 0.01, z0 + 0.05), M["darkmetal"])
    # call buttons + indicator
    box("call_panel", (0.1, 0.02, 0.22), (0.72, HALL_Y - 0.03, z0 + 1.15), M["steel_door"])
    S.call_mat = mat("call_btn", (0.8, 0.8, 0.8), rough=0.2, metal=0.8, emit=(1.0, 0.5, 0.1), emit_strength=0.0)
    cyl("call_up", 0.022, 0.012, (0.72, HALL_Y - 0.045, z0 + 1.2), S.call_mat, rot=(90, 0, 0))
    cyl("call_dn", 0.022, 0.012, (0.72, HALL_Y - 0.045, z0 + 1.1), M["steel"], rot=(90, 0, 0))
    box("hall_ind", (0.3, 0.02, 0.12), (0, HALL_Y - 0.05, z0 + 2.45), M["black_glass"])
    font = load_font(FONT_BOLD)
    text("hall_ind_txt", "7", 0.09, (0, HALL_Y - 0.062, z0 + 2.445), (90, 0, 0), M["led_red"], font=font)
    # stair door + EXIT sign
    sx = 3.6
    S.stair_x = sx
    box("stair_frame", (1.06, 0.06, 2.18), (sx, HALL_Y - 0.03, z0 + 1.09), M["darkmetal"])
    S.stair_door = box("stair_door", (0.94, 0.05, 2.1), (sx, HALL_Y - 0.06, z0 + 1.05), M["wood"])
    box("push_bar", (0.7, 0.05, 0.04), (sx, HALL_Y - 0.11, z0 + 1.0), M["steel_door"])
    box("exit_sign", (0.42, 0.06, 0.16), (sx, HALL_Y - 0.06, z0 + 2.4), M["black_glass"])
    text("exit_txt", "EXIT", 0.1, (sx, HALL_Y - 0.095, z0 + 2.4), (90, 0, 0), M["exit"], font=font)
    text("stairs_txt", "STAIRS", 0.09, (sx, HALL_Y - 0.09, z0 + 1.6), (90, 0, 0), M["paint_white"], font=font)
    # water cooler (ironic)
    box("cooler", (0.34, 0.32, 1.0), (-1.9, HALL_Y - 0.3, z0 + 0.5), M["white_plastic"], bevel=0.02, segs=2)
    cyl("cooler_bottle", 0.15, 0.42, (-1.9, HALL_Y - 0.3, z0 + 1.23), M["water_blue"], verts=32)
    cyl("cooler_cap", 0.05, 0.05, (-1.9, HALL_Y - 0.3, z0 + 1.0), M["water_blue"])
    # plant
    cyl("pot", 0.18, 0.4, (-4.0, HALL_Y - 0.35, z0 + 0.2), M["pot"], r2=0.14)
    for i in range(6):
        a = i * 1.05
        sphere("leaf%d" % i, 0.2, (-4.0 + 0.15 * math.cos(a), HALL_Y - 0.35 + 0.15 * math.sin(a), z0 + 0.65 + 0.12 * (i % 3)),
               (1, 1, 1.4), M["plant"])
    # ceiling lights
    S.lights = []
    for x in (-3.5, 0.0, 3.5, 6.5):
        box("hall_lamp%.1f" % x, (1.2, 0.3, 0.03), (x, -2.4, z1 - 0.015), M["hall_light"])
        S.lights.append(light("hall_area%.1f" % x, 'AREA', (x, -2.4, z1 - 0.05), 120, (1.0, 0.95, 0.88),
                              size=1.2, size_y=0.4))
    # a corridor door far side
    box("far_door", (0.9, 0.05, 2.1), (-1.0, y1 + 0.03, z0 + 1.05), M["wood"])
    box("far_door2", (0.9, 0.05, 2.1), (4.5, y1 + 0.03, z0 + 1.05), M["wood"])
    return S


def build_stairwell(M):
    S = Sets()
    X = STAIR_X
    z0 = HALL_Z
    rise, tread, n = 0.18, 0.3, 10
    # floor + walls (U-shaped stair: flight A goes +y on the right side, flight B returns -y on the left)
    box("st_floor", (3.0, 6.0, 0.2), (X, 1.5, z0 - 0.1), M["stair_step"])
    box("st_wall_r", (0.2, 6.0, 8.0), (X + 1.5, 1.5, z0 + 4.0), M["stair_wall"])
    box("st_wall_l", (0.2, 6.0, 8.0), (X - 1.5, 1.5, z0 + 4.0), M["stair_wall"])
    box("st_wall_b", (3.0, 0.2, 8.0), (X, 4.6, z0 + 4.0), M["stair_wall"])
    box("st_wall_f", (3.0, 0.2, 8.0), (X, -1.6, z0 + 4.0), M["stair_wall"])
    S.flightA = []
    for i in range(n):
        z = z0 + rise * (i + 1)
        y = 0.4 + tread * i
        box("stepA%d" % i, (1.3, tread + 0.02, rise * (i + 1)), (X + 0.75, y + tread / 2, z0 + rise * (i + 1) / 2),
            M["stair_step"])
        box("nosingA%d" % i, (1.3, 0.04, 0.02), (X + 0.75, y + 0.02, z + 0.005), M["stencil"])
    landing_z = z0 + rise * n
    S.landing_z = landing_z
    box("st_landing", (3.0, 1.4, landing_z - z0), (X, 0.4 + tread * n + 0.7, z0 + (landing_z - z0) / 2), M["stair_step"])
    for i in range(n):
        z = landing_z + rise * (i + 1)
        y = 0.4 + tread * (n - 1 - i)
        box("stepB%d" % i, (1.3, tread + 0.02, rise * (i + 1)), (X - 0.75, y + tread / 2, landing_z + rise * (i + 1) / 2),
            M["stair_step"])
    # handrails (yellow pipes)
    ang = math.degrees(math.atan2(rise, tread))
    L = math.hypot(rise * n, tread * n)
    cyl("handrailA", 0.025, L, (X + 1.35, 0.4 + tread * n / 2, z0 + rise * n / 2 + 0.95), M["stencil"],
        rot=(90 - ang, 0, 0))
    cyl("handrail_mid", 0.025, L, (X + 0.0, 0.4 + tread * n / 2, z0 + rise * n / 2 + 0.95), M["stencil"],
        rot=(90 - ang, 0, 0))
    for i in range(0, n + 1, 3):
        cyl("baluster%d" % i, 0.018, 0.95, (X + 0.0, 0.4 + tread * i, z0 + rise * i + 0.47), M["stencil"])
    font = load_font(FONT_BOLD)
    text("st_7", "7", 1.1, (X - 1.39, 0.8, z0 + 1.4), (90, 0, 90), M["paint_white"], font=font)
    text("st_8", "8", 1.1, (X - 0.2, 4.49, landing_z + 2.2), (90, 0, 0), M["paint_white"], font=font)
    box("st_exit", (0.4, 0.06, 0.15), (X - 0.4, 4.47, landing_z + 0.9 + 2.0), M["black_glass"])
    text("st_exit_t", "EXIT", 0.1, (X - 0.4, 4.43, landing_z + 0.9 + 2.0), (90, 0, 0), M["exit"], font=font)
    # fluorescent tubes
    S.tube1 = box("st_tube1", (0.08, 1.2, 0.05), (X + 1.38, 1.6, z0 + 3.0), M["hall_light"])
    S.tube2 = box("st_tube2", (1.2, 0.08, 0.05), (X, 4.47, landing_z + 3.3), M["hall_light"])
    S.lights = [
        light("st_key", 'AREA', (X + 1.2, 1.6, z0 + 3.0), 220, (0.85, 0.95, 1.0), size=1.4, size_y=0.3, rot=(0, -60, 0)),
        light("st_top", 'AREA', (X, 4.2, landing_z + 3.2), 160, (0.9, 0.97, 1.0), size=1.5, rot=(30, 0, 0)),
        light("st_exit_glow", 'POINT', (X - 0.4, 4.3, landing_z + 2.8), 15, (0.2, 1.0, 0.3), size=0.2),
    ]
    return S


def build_phone(name, M, parent=None):
    """Phone with emissive screen + UI text. Returns dict of parts."""
    body = box(name, (0.075, 0.011, 0.155), (0, 0, 0), M["black_glass"], parent, bevel=0.008, segs=3)
    scr_m = emit_mat(name + "_screen", (0.15, 0.35, 0.9), 1.6)
    scr = box(name + "_scr", (0.068, 0.001, 0.145), (0, -0.0058, 0), scr_m, body)
    font = load_font(FONT_BOLD)
    white = emit_mat(name + "_ui", (1, 1, 1), 3.0)
    red = emit_mat(name + "_red", (1.0, 0.1, 0.05), 5.0)
    parts = dict(body=body, screen=scr, screen_mat=scr_m)
    parts["nosvc"] = text(name + "_nosvc", "No Service", 0.0095, (-0.0, -0.0068, 0.055), (90, 0, 0), white, body, font=font)
    parts["clock"] = text(name + "_clock", "9:41", 0.022, (0, -0.0068, 0.025), (90, 0, 0), white, body, font=font)
    parts["x"] = text(name + "_x", "X", 0.03, (0, -0.0068, -0.012), (90, 0, 0), red, body, font=font)
    parts["bat_frame"] = box(name + "_batf", (0.034, 0.001, 0.016), (0, -0.0066, -0.045), white, body)
    parts["bat_in"] = box(name + "_bati", (0.03, 0.001, 0.012), (0, -0.0069, -0.045), scr_m, body)
    parts["bat_fill"] = box(name + "_batr", (0.0035, 0.001, 0.012), (-0.0132, -0.0072, -0.045), red, body)
    parts["pct"] = text(name + "_pct", "3%", 0.016, (0, -0.0068, -0.065), (90, 0, 0), red, body, font=font)
    return parts


def build_bottle(name, M, parent=None):
    b = cyl(name, 0.034, 0.2, (0, 0, 0), M["water_blue"], parent, verts=24)
    w = cyl(name + "_water", 0.03, 0.18, (0, 0, -0.005), mat(name + "_wm", (0.2, 0.5, 1.0), rough=0.05, alpha=0.55), b)
    cap = cyl(name + "_cap", 0.018, 0.025, (0, 0, 0.11), mat(name + "_capm", (0.05, 0.3, 0.9), rough=0.3), b)
    lab = cyl(name + "_label", 0.0345, 0.06, (0, 0, 0.0), mat(name + "_lab", (0.95, 0.95, 1.0), rough=0.4), b)
    return b, w


def build_crowbar(name, M, parent=None):
    m = mat(name + "_m", (0.6, 0.05, 0.03), rough=0.35, metal=0.6)
    a = cyl(name, 0.012, 0.6, (0, 0, 0), m, parent, verts=10)
    tip = cyl(name + "_tip", 0.012, 0.09, (0, -0.03, -0.31), m, a, verts=10, rot=(60, 0, 0))
    return a
