"""Catalog of every texture in the mod. Each entry is painted procedurally."""
from __future__ import annotations

import math

import materials as M
from tex import Tex, draw_text, mix, rgb, shade, stack_frames

# name -> (Tex, mcmeta or None, folder)
TEXTURES: dict[str, tuple] = {}


def reg(name: str, t: Tex, meta: dict | None = None, folder: str = 'block') -> Tex:
    TEXTURES[f'{folder}/{name}'] = (t, meta, folder)
    return t


def animated(name: str, frames: list, frametime: int, folder: str = 'block', interpolate: bool = False,
             frame_w: int | None = None, frame_h: int | None = None) -> None:
    strip = stack_frames(frames, name)
    anim = {'frametime': frametime}
    if interpolate:
        anim['interpolate'] = True
    if frame_w and frame_h and frame_w != frame_h:
        anim['width'] = frame_w
        anim['height'] = frame_h
    TEXTURES[f'{folder}/{name}'] = (strip, {'animation': anim}, folder)


# =============================================================================== materials
def materials() -> None:
    for kind in M.WOODS:
        reg(f'wood_{kind}', M.wood(kind, f'wood_{kind}'))
    for c, v in M.PAINTS.items():
        reg(f'paint_{c}', M.paint(v, f'paint_{c}'))
    for c, v in M.FABRICS.items():
        reg(f'fabric_{c}', M.fabric(v, f'fabric_{c}'))
    reg('leather_cognac', M.leather('#9A5B32', 'leather_cognac'))
    reg('leather_black', M.leather('#2A2A2C', 'leather_black'))
    reg('leather_cream', M.leather('#D8CDB8', 'leather_cream'))
    for c in ('steel', 'black', 'brass', 'bronze', 'white', 'gunmetal'):
        reg(f'metal_{c}', M.brushed(M.METALS[c], f'metal_{c}'))
    reg('metal_chrome', M.chrome('metal_chrome'))
    reg('plastic_white', M.plastic('#EEEEEE', 'plastic_white'))
    reg('plastic_black', M.plastic('#232427', 'plastic_black'))
    reg('plastic_gray', M.plastic('#8A8D90', 'plastic_gray'))
    reg('plastic_red', M.plastic('#C8362F', 'plastic_red'))
    reg('plastic_yellow', M.plastic('#E8B730', 'plastic_yellow'))
    reg('plastic_blue', M.plastic('#2F6FC8', 'plastic_blue'))
    reg('plastic_green', M.plastic('#3E9A4A', 'plastic_green'))
    reg('ceramic_white', M.paint('#F4F4F2', 'ceramic_white', 0.008))
    reg('stone_marble_white', M.stone_marble('#ECEAE6', '#B5B1AB', 'stone_marble_white'))
    reg('stone_marble_black', M.stone_marble('#262628', '#8D8D90', 'stone_marble_black'))
    reg('stone_granite', M.speckled('#3C3C3F', ['#6A6A6E', '#1E1E20', '#8A7F72'], 0.35, 'stone_granite', 0.05))
    reg('stone_quartz', M.speckled('#F1EFEA', ['#DAD6CE', '#C9C4BA'], 0.12, 'stone_quartz', 0.01))
    reg('stone_concrete', M.speckled('#A3A39E', ['#8C8C88', '#B8B8B3'], 0.25, 'stone_concrete', 0.03))
    reg('rubber_black', M.speckled('#232325', ['#2E2E31'], 0.3, 'rubber_black', 0.03))
    reg('mesh_black', mesh('#1E1F21', '#34363A', 'mesh_black'))
    reg('cushion_white', M.fabric('#F2F0EA', 'cushion_white'))
    reg('towel_white', terry('#F3F1EC', 'towel_white'))
    reg('towel_gray', terry('#9FA3A8', 'towel_gray'))
    reg('towel_navy', terry('#3B4B6E', 'towel_navy'))
    reg('wicker', wicker('wicker'))
    reg('cardboard', cardboard('cardboard'))
    reg('paper_white', M.paint('#F6F5F1', 'paper_white', 0.01))
    reg('soil', M.speckled('#4A3423', ['#5E4430', '#33241A'], 0.4, 'soil', 0.06))
    reg('sand', M.speckled('#DCCB9C', ['#CDB98A', '#E8DAB0'], 0.4, 'sand', 0.03))
    reg('glass_clear', M.glass('#C9DDE6', 90, 'glass_clear'))
    reg('glass_frosted', frosted('glass_frosted'))
    reg('glass_tinted', M.glass('#3D4652', 170, 'glass_tinted'))
    reg('mirror', mirror('mirror'))
    reg('canvas_beige', M.fabric('#D9CDB3', 'canvas_beige'))
    reg('canvas_navy_stripe', stripes(['#F0EDE6', '#2E4166'], 2, 'canvas_navy_stripe'))
    reg('canvas_teal_stripe', stripes(['#F0EDE6', '#2F7A80'], 2, 'canvas_teal_stripe'))
    reg('fabric_stripe_navy', stripes(['#EDEAE2', '#34476B'], 3, 'fabric_stripe_navy', vertical=False))
    reg('foam_purple', M.speckled('#6D4C9A', ['#7A58A8'], 0.2, 'foam_purple', 0.03))
    reg('foam_teal', M.speckled('#2F8A8A', ['#3A9898'], 0.2, 'foam_teal', 0.03))
    reg('foam_coral', M.speckled('#E07A64', ['#E88A74'], 0.2, 'foam_coral', 0.03))
    reg('felt_green', M.fabric('#2F7A4A', 'felt_green'))
    reg('felt_blue', M.fabric('#2D5F8A', 'felt_blue'))
    reg('grill_grate', grate('grill_grate'))


def mesh(base, line, name):
    t = Tex(16, 16, base, name)
    for y in range(16):
        for x in range(16):
            if (x + y) % 3 == 0 or (x - y) % 3 == 0:
                t.px(x, y, line)
    return t


def terry(color, name):
    t = Tex(16, 16, color, name)
    t.noise(0.06)
    for y in range(0, 16, 2):
        t.scale_rect(0, y, 16, y + 1, 0.96)
    return t


def wicker(name):
    t = Tex(16, 16, '#B08A5A', name)
    for y in range(16):
        for x in range(16):
            band = (x // 4 + y // 2) % 2
            t.px(x, y, '#C49C68' if band else '#9C7748')
    t.noise(0.05)
    return t


def cardboard(name):
    t = Tex(16, 16, '#B8915E', name)
    t.noise(0.04)
    t.rect(7, 0, 9, 16, '#C9A878')  # packing tape
    t.rect(2, 10, 6, 13, '#F2EFE8')  # shipping label
    t.hline(11, '#5A5A5A', 3, 5)
    return t


def frosted(name):
    t = Tex(16, 16, '#E4ECEF', name)
    t.noise(0.04)
    t.alpha(205)
    return t


def mirror(name):
    t = Tex(16, 16, '#B9C7CF', name)
    t.vgrad('#D7E1E7', '#9DAEB8')
    for k in range(16):
        for x0, w in ((2, 2), (8, 1)):
            for dx in range(w):
                t.px((x0 + k // 2 + dx) % 16, 15 - k, '#E9F0F4')
    return t


def stripes(colors, width, name, vertical=True):
    t = Tex(16, 16, colors[0], name)
    for i in range(16):
        c = colors[(i // width) % len(colors)]
        if vertical:
            t.vline(i, c)
        else:
            t.hline(i, c)
    t.noise(0.02)
    return t


def grate(name):
    t = Tex(16, 16, '#2A2A2C', name)
    for x in range(1, 16, 3):
        t.vline(x, '#5B5D60')
    t.noise(0.03)
    return t


# =============================================================================== building
def building() -> None:
    reg('concrete_panel_white', M.panel('#E3E1DC', 'concrete_panel_white', ties=True))
    reg('concrete_panel_gray', M.panel('#B7B7B3', 'concrete_panel_gray', ties=True))
    reg('concrete_panel_charcoal', M.panel('#4C4E52', 'concrete_panel_charcoal', 0.7, ties=True))
    for c, v in (('white', '#E9E7E2'), ('gray', '#8F959A'), ('navy', '#33415C'), ('sage', '#8FA28C'),
                 ('charcoal', '#45484C')):
        reg(f'lap_siding_{c}', M.lap_siding(v, f'lap_siding_{c}'))
    for c, v in (('white', '#EEEDEA'), ('gray', '#6A6E73'), ('charcoal', '#3A3D41'), ('cream', '#E3DACB')):
        reg(f'facade_panel_{c}', M.panel(v, f'facade_panel_{c}', 0.74))
    for c, v in (('bronze', '#5E4B3C'), ('graphite', '#3F4246'), ('silver', '#A8ACB0')):
        reg(f'metal_panel_{c}', M.standing_seam(v, f'metal_panel_{c}'))
    reg('brick_red', M.brick(['#9C4A35', '#A8533C', '#8E432F'], '#BDB4A8', 'brick_red'))
    reg('brick_charcoal', M.brick(['#4A4A4D', '#525255', '#424245'], '#8E8E8E', 'brick_charcoal'))
    reg('brick_white', M.brick(['#E6E3DC', '#ECE9E3', '#DFDBD3'], '#CFCAC1', 'brick_white'))
    reg('brick_tan', M.brick(['#B89466', '#C29F70', '#AD8A5D'], '#D3C8B5', 'brick_tan'))
    reg('brick_exposed', M.brick(['#8E4A36', '#7A3E2D', '#A3593F', '#6E3829'], '#8D857A', 'brick_exposed',
                                 soot=0.18, mortar_noise=0.08))
    reg('cedar_cladding', M.slats('#A86E43', '#3E2A1C', 'cedar_cladding'))
    reg('walnut_cladding', M.slats('#6B4A33', '#2A1D14', 'walnut_cladding'))
    reg('white_marble', M.stone_marble('#ECEAE6', '#B5B1AB', 'white_marble'))
    reg('black_marble', M.stone_marble('#262628', '#8D8D90', 'black_marble'))
    reg('travertine', travertine('travertine'))
    reg('terrazzo', M.terrazzo('terrazzo'))
    reg('limestone', M.speckled('#D9D1C1', ['#CEC5B3', '#E3DCCD'], 0.3, 'limestone', 0.02))
    for kind in ('light', 'walnut', 'gray', 'white_oak'):
        reg(f'hardwood_{kind}', M.floor_boards(kind, f'hardwood_{kind}'))
    reg('herringbone_oak', M.herringbone('light', 'herringbone_oak'))
    reg('subway_tile', M.tile_grid('#F2F1EE', '#C9C6C0', 'subway_tile', 8, 4, offset_rows=True, tone=0.015))
    reg('subway_tile_sage', M.tile_grid('#A9BBA5', '#E5E3DD', 'subway_tile_sage', 8, 4, offset_rows=True))
    reg('subway_tile_navy', M.tile_grid('#33466B', '#D4D2CC', 'subway_tile_navy', 8, 4, offset_rows=True))
    reg('mosaic_tile', M.tile_grid('#E9E8E4', '#9C9993', 'mosaic_tile', 2, 2, colors=['#E9E8E4', '#DAD8D2', '#F4F3F0']))
    reg('large_tile_light', M.tile_grid('#D9D6CF', '#B9B5AD', 'large_tile_light', 8, 8, tone=0.02))
    reg('large_tile_dark', M.tile_grid('#5C5D60', '#47484B', 'large_tile_dark', 8, 8, tone=0.02))
    reg('slate_tile', M.tile_grid('#4F555B', '#3A3F44', 'slate_tile', 8, 8, tone=0.06))
    reg('pool_tile', M.tile_grid('#4FA3C9', '#E8F2F6', 'pool_tile', 4, 4,
                                 colors=['#4FA3C9', '#5BB0D3', '#3F95BE', '#67B9D9']))
    reg('pool_tile_dark', M.tile_grid('#1F4F7A', '#C9DCE6', 'pool_tile_dark', 4, 4))
    reg('pool_coping', M.tile_grid('#E7E1D6', '#CFC7B9', 'pool_coping', 8, 8, tone=0.02))
    for c, v in (('white', '#EEECE7'), ('greige', '#CFC7BA'), ('sage', '#B3BFAE'), ('navy', '#3A4A66'),
                 ('blush', '#E2C6BE'), ('sky', '#C9D7E0'), ('charcoal', '#55585D'), ('terracotta', '#C98B6E')):
        reg(f'drywall_{c}', M.paint(v, f'drywall_{c}', 0.01))
    reg('ceiling', M.paint('#F2F1EE', 'ceiling', 0.008))
    reg('acoustic_ceiling', acoustic('acoustic_ceiling'))
    reg('polished_concrete', polished_concrete('polished_concrete'))
    reg('steel_beam', steel_beam('steel_beam'))
    reg('steel_beam_end', steel_beam_end('steel_beam_end'))
    reg('asphalt', M.asphalt('asphalt'))
    reg('sidewalk', sidewalk('sidewalk'))
    reg('pavers_gray', pavers('#8E8B86', 'pavers_gray'))
    reg('pavers_charcoal', pavers('#5A5A5C', 'pavers_charcoal'))
    reg('pavers_sand', pavers('#C2B49B', 'pavers_sand'))
    reg('artificial_turf', M.turf('artificial_turf'))
    reg('rubber_flooring', M.speckled('#2A2B2D', ['#4F8FC9', '#8A8C8F', '#C9A13A'], 0.12, 'rubber_flooring', 0.04))
    reg('pool_deck', pavers('#DCD3C2', 'pool_deck'))
    reg('green_wall', green_wall('green_wall'))
    reg('elevator_wall', elevator_wall('elevator_wall'))
    reg('elevator_floor', elevator_floor('elevator_floor'))
    reg('garage_column', garage_column('garage_column'))
    reg('garage_column_top', M.speckled('#A3A39E', ['#8C8C88'], 0.2, 'garage_column_top'))
    reg('playground_mulch', M.speckled('#7A5236', ['#9A6B47', '#5C3C26', '#B08050'], 0.5, 'playground_mulch', 0.08))
    reg('rubber_safety', M.speckled('#B5513C', ['#C76450', '#9A4232'], 0.3, 'rubber_safety', 0.05))
    # windows / glass
    reg('window_clear', M.glass('#C2D7E2', 80, 'window_clear'))
    reg('curtain_wall_blue', curtain_wall('#4F7393', 'curtain_wall_blue'))
    reg('curtain_wall_gray', curtain_wall('#5E6973', 'curtain_wall_gray'))
    reg('smoked_glass', M.glass('#3D4247', 165, 'smoked_glass'))
    reg('frosted_glass', frosted('frosted_glass'))
    reg('factory_window', factory_window('factory_window'))
    reg('mullion_black', mullion('#26272A', 'mullion_black'))
    reg('mullion_silver', mullion('#9EA3A8', 'mullion_silver'))
    # parking & street markings
    reg('parking_line', parking_line('#F2F2EE', 'parking_line'))
    reg('parking_line_yellow', parking_line('#E8C23A', 'parking_line_yellow'))
    reg('parking_accessible', parking_accessible('parking_accessible'))
    reg('parking_arrow', parking_arrow('parking_arrow'))
    reg('crosswalk', crosswalk('crosswalk'))
    reg('curb_yellow', curb('curb_yellow'))
    # lights
    reg('recessed_light', recessed_light('recessed_light', True))
    reg('recessed_light_off', recessed_light('recessed_light_off', False))
    reg('led_panel', led_panel('led_panel', True))
    reg('led_panel_off', led_panel('led_panel_off', False))
    reg('light_diffuser', Tex(16, 16, '#FFF8E8', 'light_diffuser').noise(0.01))
    reg('light_diffuser_off', Tex(16, 16, '#CFCCC4', 'light_diffuser_off').noise(0.01))
    reg('cove_light', cove_light('cove_light'))


def travertine(name):
    t = Tex(16, 16, '#D5C7AE', name).noise(0.03)
    rng = t.rng
    for _ in range(5):
        y = int(rng.integers(0, 16))
        x = int(rng.integers(0, 12))
        t.blend_rect(x, y, x + int(rng.integers(2, 6)), y + 1, '#B8A88C', 0.6)
    t.hline(15, '#BFB096')
    t.vline(15, '#BFB096')
    return t


def acoustic(name):
    t = Tex(16, 16, '#EDEBE6', name)
    t.speckle('#D3D0C8', 0.18)
    t.hline(7, '#BDBAB2')
    t.hline(15, '#BDBAB2')
    t.vline(7, '#BDBAB2')
    t.vline(15, '#BDBAB2')
    return t


def polished_concrete(name):
    t = Tex(16, 16, '#9C9B97', name).noise(0.025)
    rng = t.rng
    for _ in range(4):
        x, y = int(rng.integers(0, 14)), int(rng.integers(0, 14))
        t.blend_rect(x, y, x + 3, y + 2, '#B2B1AC', 0.4)
    t.speckle('#86857F', 0.06)
    return t


def steel_beam(name):
    t = Tex(16, 16, '#3B3E42', name)
    t.row_tones(0.02, 1)
    t.rect(0, 0, 16, 2, '#4A4E53')
    t.rect(0, 14, 16, 16, '#4A4E53')
    t.hline(2, '#2A2C2F')
    t.hline(13, '#2A2C2F')
    for x in (2, 6, 10, 14):
        t.px(x, 1, '#5E6267')
        t.px(x, 14, '#5E6267')
    t.noise(0.02)
    return t


def steel_beam_end(name):
    t = Tex(16, 16, '#2A2C2F', name)
    t.rect(1, 1, 15, 4, '#4A4E53')
    t.rect(1, 12, 15, 15, '#4A4E53')
    t.rect(6, 4, 10, 12, '#4A4E53')
    t.noise(0.02)
    return t


def sidewalk(name):
    t = Tex(16, 16, '#B5B3AD', name).noise(0.03)
    t.speckle('#A3A19B', 0.1)
    t.hline(15, '#8E8C86')
    t.vline(15, '#8E8C86')
    return t


def pavers(color, name):
    t = Tex(16, 16, shade(color, 0.7), name)
    rng = t.rng
    for (x0, y0, x1, y1) in ((0, 0, 7, 7), (8, 0, 15, 7), (0, 8, 15, 15)):
        c = shade(color, 1.0 + rng.normal(0, 0.05))
        t.rect(x0, y0, x1, y1, c)
        t.noise_rect(x0, y0, x1, y1, 0.04)
        t.scale_rect(x0, y0, x1, y0 + 1, 1.06)
    return t


def green_wall(name):
    t = Tex(16, 16, '#2F5A2A', name)
    rng = t.rng
    greens = ['#3F7A34', '#4E8C3E', '#2C6A2A', '#5C9A48', '#6FAE52']
    for _ in range(70):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        c = greens[int(rng.integers(0, len(greens)))]
        t.px(x, y, c)
        t.px((x + 1) % 16, y, c)
    for _ in range(4):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        t.px(x, y, '#D8C4E8')
    return t


def elevator_wall(name):
    t = M.brushed('#C2C6CA', name)
    t.vline(0, '#E1E4E7')
    t.vline(15, '#8E9399')
    return t


def elevator_floor(name):
    t = Tex(16, 16, '#2E2F31', name)
    t.speckle('#45464A', 0.2)
    t.frame(0, 0, 16, 16, '#9EA3A8')
    return t


def garage_column(name):
    t = M.speckled('#A3A39E', ['#8C8C88', '#B8B8B3'], 0.25, name)
    for x in range(16):
        for y in range(10, 14):
            t.px(x, y, '#E8C23A' if ((x + y) // 2) % 2 == 0 else '#202022')
    return t


def curtain_wall(color, name):
    t = Tex(16, 16, color, name)
    t.alpha(165)
    t.vgrad(shade(color, 1.15), shade(color, 0.85))
    t.alpha(170)
    for k in range(16):
        for x0, w in ((4, 2), (11, 1)):
            for dx in range(w):
                x = (x0 + k // 2 + dx) % 16
                c = mix(t.a[15 - k, x], '#FFFFFF', 0.25)
                t.a[15 - k, x] = (c[0], c[1], c[2], 190)
    # thin mullion frame lines at the edges so curtain walls read as panels
    for i in range(16):
        t.a[15, i] = (*rgb('#2C2F33')[:3], 255)
        t.a[i, 15] = (*rgb('#2C2F33')[:3], 255)
    return t


def factory_window(name):
    t = Tex(16, 16, '#9FB6C2', name)
    t.alpha(120)
    frame = (*rgb('#1E1F22')[:3], 255)
    for i in range(16):
        for k in (0, 5, 10, 15):
            t.a[k, i] = frame
            t.a[i, k] = frame
    return t


def mullion(color, name):
    t = M.brushed(color, name)
    t.vline(0, shade(color, 1.2))
    t.vline(15, shade(color, 0.7))
    return t


def parking_line(color, name):
    t = M.asphalt(name)
    t.rect(7, 0, 9, 16, color)
    t.noise_rect(7, 0, 9, 16, 0.05)
    return t


def parking_accessible(name):
    t = M.asphalt(name)
    t.rect(1, 1, 15, 15, '#2F5FB0')
    w = '#F4F4F2'
    # stylised wheelchair pictogram
    t.circle(7.5, 3.5, 1.2, w)
    t.rect(7, 5, 8, 9, w)
    t.rect(7, 8, 11, 9, w)
    t.rect(10, 9, 11, 12, w)
    t.rect(11, 11, 13, 12, w)
    t.circle(7.0, 10.5, 3.2, w, fill=False)
    return t


def parking_arrow(name):
    t = M.asphalt(name)
    w = '#F2F2EE'
    t.rect(7, 6, 9, 15, w)
    for i in range(5):
        t.rect(7 - i, 2 + i, 9 + i, 3 + i, w)
    return t


def crosswalk(name):
    t = M.asphalt(name)
    t.rect(0, 2, 16, 6, '#F2F2EE')
    t.rect(0, 10, 16, 14, '#F2F2EE')
    t.noise(0.03)
    return t


def curb(name):
    t = M.speckled('#B5B3AD', ['#A3A19B'], 0.1, name)
    t.rect(0, 0, 16, 5, '#E3BE3A')
    return t


def recessed_light(name, lit):
    t = Tex(16, 16, '#F2F1EE', name).noise(0.008)
    t.circle(8, 8, 4.6, '#D9D7D2')
    t.circle(8, 8, 3.6, '#FFF6DC' if lit else '#BEBCB6')
    if lit:
        t.circle(8, 8, 2.2, '#FFFFFF')
    return t


def led_panel(name, lit):
    t = Tex(16, 16, '#F2F1EE', name)
    t.frame(0, 0, 16, 16, '#D7D5D0')
    t.rect(2, 2, 14, 14, '#FFFBF0' if lit else '#C9C7C1')
    if lit:
        t.rect(3, 3, 13, 13, '#FFFFFF')
    return t


def cove_light(name):
    t = Tex(16, 16, '#F2F1EE', name)
    t.rect(0, 6, 16, 10, '#FFF3D1')
    t.rect(0, 7, 16, 9, '#FFFFFF')
    return t


# =============================================================================== furniture faces
def faces() -> None:
    # --- screens
    reg('screen_off', screen_off('screen_off'))
    animated('screen_tv', [tv_frame(i) for i in range(6)], 80, frame_w=32, frame_h=16)
    reg('screen_monitor', monitor_screen('screen_monitor'))
    reg('screen_laptop', laptop_screen('screen_laptop'))
    animated('screen_arcade', [arcade_frame(i) for i in range(4)], 8)
    reg('treadmill_console', treadmill_console('treadmill_console'))
    animated('fireplace_flames', [flames(i) for i in range(6)], 3, interpolate=False)
    # --- appliances
    reg('fridge_lower', fridge('fridge_lower', False))
    reg('fridge_upper', fridge('fridge_upper', True))
    reg('range_front', range_front('range_front', False))
    reg('range_front_on', range_front('range_front_on', True))
    reg('cooktop', cooktop('cooktop', False))
    reg('cooktop_on', cooktop('cooktop_on', True))
    reg('range_hood', range_hood('range_hood'))
    reg('dishwasher_front', dishwasher('dishwasher_front'))
    reg('microwave_front', microwave('microwave_front', False))
    reg('microwave_front_on', microwave('microwave_front_on', True))
    reg('washer_front', washer('washer_front', False, True))
    animated('washer_front_on', [washer(f'washer_on_{i}', True, True, i) for i in range(4)], 4)
    reg('dryer_front', washer('dryer_front', False, False))
    animated('dryer_front_on', [washer(f'dryer_on_{i}', True, False, i) for i in range(4)], 4)
    reg('coffee_maker_front', coffee_maker('coffee_maker_front'))
    reg('vending_upper', vending('vending_upper', True))
    reg('vending_lower', vending('vending_lower', False))
    reg('arcade_marquee', arcade_marquee('arcade_marquee'))
    reg('arcade_panel', arcade_panel('arcade_panel'))
    reg('water_cooler', water_cooler('water_cooler'))
    reg('ev_charger', ev_charger('ev_charger'))
    reg('printer_front', printer('printer_front'))
    # --- building systems
    reg('elevator_door', elevator_door('elevator_door'))
    reg('elevator_panel', elevator_panel('elevator_panel'))
    reg('elevator_call', elevator_call('elevator_call'))
    reg('keycard_reader', keycard_reader('keycard_reader', False))
    reg('keycard_reader_open', keycard_reader('keycard_reader_open', True))
    reg('intercom', intercom('intercom'))
    reg('mailbox_bank', mailbox_bank('mailbox_bank'))
    reg('parcel_locker_upper', parcel_locker('parcel_locker_upper', True))
    reg('parcel_locker_lower', parcel_locker('parcel_locker_lower', False))
    reg('locker_upper', locker('locker_upper', True))
    reg('locker_lower', locker('locker_lower', False))
    reg('whiteboard', whiteboard('whiteboard'))
    reg('exit_sign', exit_sign('exit_sign'))
    reg('thermostat', thermostat('thermostat'))
    reg('light_switch', light_switch('light_switch', False))
    reg('light_switch_on', light_switch('light_switch_on', True))
    reg('clock_face', clock_face('clock_face'))
    reg('security_camera_lens', camera_lens('security_camera_lens'))
    reg('fire_alarm', fire_alarm('fire_alarm'))
    reg('extinguisher', extinguisher('extinguisher'))
    reg('smoke_detector', smoke_detector('smoke_detector'))
    reg('outlet', outlet('outlet'))
    # --- signs / pictograms
    for icon in ICONS:
        reg(f'sign_{icon}', pictogram(icon, f'sign_{icon}'))
    # --- cabinetry
    for c, base in CABINET_COLORS.items():
        reg(f'cabinet_{c}_door', cabinet_door(c, base, f'cabinet_{c}_door'))
        reg(f'cabinet_{c}_drawers', cabinet_drawers(c, base, f'cabinet_{c}_drawers'))
        reg(f'cabinet_{c}_sink', cabinet_sink(c, base, f'cabinet_{c}_sink'))
        reg(f'cabinet_{c}_upper', cabinet_upper(c, base, f'cabinet_{c}_upper'))
        reg(f'cabinet_{c}_side', cabinet_side(c, base, f'cabinet_{c}_side'))
    reg('sink_basin', sink_basin('sink_basin'))
    reg('wardrobe_front_lower', wardrobe_plain('wardrobe_front_lower', '#ECEAE4'))
    reg('wardrobe_walnut_front_lower', wardrobe_plain('wardrobe_walnut_front_lower', None))
    reg('shower_drain', shower_drain('shower_drain'))
    railing_textures()
    reg('wardrobe_front', wardrobe_front('wardrobe_front', '#ECEAE4'))
    reg('wardrobe_walnut_front', wardrobe_front('wardrobe_walnut_front', None))
    reg('dresser_front', dresser_front('dresser_front'))
    reg('nightstand_front', nightstand_front('nightstand_front'))
    reg('book_spines', book_spines('book_spines'))
    reg('book_spines_2', book_spines('book_spines_2'))
    reg('laundry_clothes', laundry_clothes('laundry_clothes'))
    reg('clothes_rack', clothes_rack('clothes_rack'))
    reg('pillow_pattern', pillow_pattern('pillow_pattern'))
    reg('doormat', doormat('doormat'))
    reg('lifebuoy', lifebuoy('lifebuoy'))
    reg('treadmill_belt', stripes(['#202022', '#2A2A2D'], 1, 'treadmill_belt', vertical=False))
    reg('pool_table_top', pool_table_top('pool_table_top'))
    reg('cornhole_board', cornhole('cornhole_board'))
    reg('dartboard', dartboard('dartboard'))
    reg('speaker_grille', speaker('speaker_grille'))
    reg('game_console', console_front('game_console'))
    reg('router', router('router'))
    reg('sprayer', M.brushed('#C9CDD1', 'sprayer'))
    reg('grooming_supplies', grooming('grooming_supplies'))
    reg('trash_bin', bin_face('trash_bin', '#2E3A2F', 'TRASH'))
    reg('recycle_bin', bin_face('recycle_bin', '#2F5FA8', 'RECYCLE'))
    reg('pet_station', bin_face('pet_station', '#2F6B57', 'PETS'))
    # --- art
    art()


def screen_off(name):
    t = Tex(16, 16, '#141518', name)
    for k in range(16):
        for x0, w in ((3, 3), (10, 1)):
            for dx in range(w):
                t.px((x0 + k // 2 + dx) % 16, 15 - k, '#1F2226')
    return t


def tv_frame(i):
    t = Tex(32, 16, '#000000', f'tv{i}')
    if i == 0:  # mountain lake
        t.vgrad('#5D8FD6', '#BFD8F2', 0, 0, 32, 9)
        for x in range(32):
            h = int(5 + 3 * math.sin(x * 0.35) + 2 * math.sin(x * 0.9 + 1))
            t.rect(x, 9 - h + 2, x + 1, 10, '#5C6B78')
            if h > 6:
                t.px(x, 9 - h + 2, '#F4F6F8')
        t.vgrad('#3E6E8E', '#2A4E68', 0, 10, 32, 16)
        t.rect(0, 9, 32, 10, '#3F6B3A')
        t.circle(25, 3, 1.8, '#FFF4C2')
    elif i == 1:  # city at night
        t.vgrad('#0E1630', '#24305A', 0, 0, 32, 16)
        rng = t.rng
        x = 0
        while x < 32:
            w = int(rng.integers(3, 6))
            h = int(rng.integers(5, 13))
            t.rect(x, 16 - h, x + w - 1, 16, '#161A26')
            for yy in range(16 - h + 1, 15, 2):
                for xx in range(x, x + w - 1):
                    if rng.random() < 0.45:
                        t.px(xx, yy, '#F2D27A')
            x += w
        t.circle(5, 3, 1.5, '#F0F0E0')
    elif i == 2:  # football on a pitch
        t.fill('#3E8E3A')
        for x in range(0, 32, 4):
            t.rect(x, 0, x + 2, 16, '#46983F')
        t.vline(16, '#EDEDED')
        t.circle(16, 8, 3.5, '#EDEDED', fill=False)
        t.rect(0, 0, 32, 3, '#1A1D24')
        draw_text(t, '2-1', 13, -2, '#FFFFFF')
        t.px(10, 8, '#FFFFFF')
        t.px(22, 6, '#C8362F')
    elif i == 3:  # news
        t.vgrad('#1D3F78', '#0F2550')
        t.rect(10, 4, 18, 13, '#2A2C33')  # anchor body
        t.circle(14, 4.5, 2.2, '#D9A98A')
        t.rect(22, 3, 30, 9, '#3E6FB8')
        t.rect(0, 12, 32, 16, '#C8362F')
        draw_text(t, 'NEWS', 1, 11, '#FFFFFF')
    elif i == 4:  # beach
        t.vgrad('#7EC3F0', '#D8F0FF', 0, 0, 32, 8)
        t.vgrad('#1E7EB8', '#49A6D4', 0, 8, 32, 12)
        t.vgrad('#E8D49C', '#D4BC80', 0, 12, 32, 16)
        t.circle(6, 3, 2, '#FFE680')
        t.rect(24, 6, 25, 13, '#7A5236')
        t.rect(21, 5, 29, 7, '#3E8E3A')
    else:  # cartoon
        t.fill('#7FD3F7')
        t.rect(0, 11, 32, 16, '#6CC24A')
        t.circle(7, 4, 3, '#FFD83A')
        t.circle(20, 9, 3.5, '#FF6F91')
        t.circle(19, 8, 0.8, '#000000')
        t.circle(22, 8, 0.8, '#000000')
        t.rect(26, 5, 31, 6, '#FFFFFF')
        t.rect(25, 4, 30, 5, '#FFFFFF')
    return t


def monitor_screen(name):
    t = Tex(16, 16, '#1B1F27', name)
    t.rect(0, 0, 16, 2, '#2B3140')
    colors = ['#7FB3F2', '#E6C07B', '#98C379', '#C678DD', '#E06C75', '#ABB2BF']
    rng = t.rng
    for y in range(3, 15, 2):
        x = 1 + int(rng.integers(0, 3))
        length = int(rng.integers(3, 12))
        t.rect(x, y, min(15, x + length), y + 1, colors[int(rng.integers(0, len(colors)))])
    return t


def laptop_screen(name):
    t = Tex(16, 16, '#3B6FB8', name)
    t.vgrad('#4E86CF', '#2B5596')
    t.rect(2, 3, 10, 9, '#F0F0F0')
    t.rect(2, 3, 10, 4, '#2B3140')
    t.rect(6, 7, 14, 13, '#FFFFFF')
    t.rect(6, 7, 14, 8, '#C8362F')
    t.rect(0, 14, 16, 16, '#1D2230')
    return t


def arcade_frame(i):
    t = Tex(16, 16, '#05060A', f'arcade{i}')
    for (x, y) in ((2, 2), (6, 2), (10, 2), (4, 5), (8, 5), (12, 5)):
        xx = x + (i % 2)
        t.rect(xx, y, xx + 2, y + 2, '#5BE35B' if y == 2 else '#E35BD8')
    t.rect(6 + i, 13, 9 + i, 15, '#5BC8F2')
    t.px(7 + i, 9 - i, '#FFFFFF')
    t.hline(0, '#F2D24A')
    return t


def treadmill_console(name):
    t = Tex(16, 16, '#232427', name)
    t.rect(3, 3, 13, 8, '#0E2A1A')
    draw_text(t, '3.5', 3, 3, '#5BE38A')
    for x in (3, 6, 9, 12):
        t.rect(x, 11, x + 2, 13, '#C8362F' if x == 12 else '#5A5D62')
    return t


def flames(i):
    t = Tex(16, 16, '#1A0E08', f'flames{i}')
    rng = t.rng
    for x in range(16):
        h = 4 + int(4 * abs(math.sin(x * 0.8 + i * 1.1))) + int(rng.integers(0, 3))
        for y in range(16 - h, 16):
            k = (y - (16 - h)) / max(1, h)
            t.px(x, y, mix('#FFE27A', '#E8521C', 1 - k))
    t.rect(0, 14, 16, 16, '#3A3A3D')
    return t


def fridge(name, upper):
    t = M.brushed('#BFC3C7', name)
    if upper:
        t.vline(7, '#8E9399')
        t.vline(8, '#D5D8DB')
        t.rect(5, 3, 6, 15, '#E4E6E8')
        t.rect(10, 3, 11, 15, '#E4E6E8')
        t.rect(1, 3, 4, 8, '#2C2D30')  # water/ice dispenser
        t.rect(2, 6, 3, 7, '#5BC8F2')
    else:
        t.hline(5, '#8E9399')
        t.hline(6, '#D5D8DB')
        t.vline(7, '#8E9399', 0, 5)
        t.vline(8, '#D5D8DB', 0, 5)
        t.rect(5, 0, 6, 4, '#E4E6E8')
        t.rect(10, 0, 11, 4, '#E4E6E8')
        t.rect(3, 8, 13, 9, '#E4E6E8')  # freezer drawer handle
        t.hline(15, '#2C2D30')
    return t


def range_front(name, lit):
    t = M.brushed('#BFC3C7', name)
    t.rect(0, 0, 16, 3, '#2C2D30')
    for x in (2, 5, 10, 13):
        t.rect(x, 1, x + 1, 2, '#D8DCE0')
    t.rect(7, 1, 9, 2, '#5BE38A')
    t.rect(1, 4, 15, 5, '#E4E6E8')  # handle bar
    t.rect(2, 6, 14, 13, '#2E2F33')
    t.rect(3, 7, 13, 12, '#E8902C' if lit else '#16171A')
    if lit:
        t.rect(4, 8, 12, 11, '#F5B04A')
    else:
        t.px(4, 8, '#3A3C40')
        t.px(5, 8, '#3A3C40')
    t.rect(1, 14, 15, 16, '#2C2D30')
    return t


def cooktop(name, lit):
    t = Tex(16, 16, '#141416', name)
    for (cx, cy, r) in ((4.5, 4.5, 2.8), (11.5, 4.5, 2.3), (4.5, 11.5, 2.3), (11.5, 11.5, 2.8)):
        t.circle(cx, cy, r, '#E0451E' if lit else '#4A4B50', fill=False)
        if lit:
            t.circle(cx, cy, r - 1, '#8E2412', fill=False)
    t.rect(6, 7, 10, 9, '#2C2D30')
    return t


def range_hood(name):
    t = M.brushed('#BFC3C7', name)
    t.rect(2, 12, 14, 14, '#2C2D30')
    t.px(4, 13, '#5BE38A')
    t.px(11, 13, '#FFFFFF')
    t.px(12, 13, '#FFFFFF')
    return t


def dishwasher(name):
    t = M.brushed('#BFC3C7', name)
    t.rect(0, 0, 16, 2, '#2C2D30')
    t.px(12, 1, '#5BE38A')
    t.px(13, 1, '#5BC8F2')
    t.rect(3, 3, 13, 4, '#8E9399')
    t.hline(15, '#2C2D30')
    return t


def microwave(name, on):
    t = Tex(16, 16, '#2A2B2E', name)
    t.rect(1, 2, 11, 14, '#F2D27A' if on else '#111214')
    for y in range(3, 13, 2):
        for x in range(2, 10, 2):
            t.px(x, y, '#C9A74E' if on else '#1C1D20')
    t.rect(12, 3, 15, 5, '#0E2A1A')
    t.px(13, 4, '#5BE38A')
    for y in (7, 9, 11):
        t.rect(12, y, 15, y + 1, '#5A5D62')
    return t


def washer(name, on, water, frame=0):
    t = Tex(16, 16, '#EDEDEA', name).noise(0.008)
    t.rect(0, 0, 16, 3, '#DCDCD8')
    t.circle(3, 1.5, 1.2, '#8A8D90')
    t.rect(8, 1, 14, 2, '#0E2A1A')
    if on:
        t.px(9, 1, '#5BE38A')
    t.circle(8, 9.5, 5.6, '#9FA4AA')
    t.circle(8, 9.5, 4.6, '#2E3B4A')
    if on:
        cols = ['#5BC8F2', '#E35B5B', '#F2D24A', '#7FD37F']
        for k in range(4):
            ang = (frame * 0.8 + k * 1.57)
            x = 8 + 2.6 * math.cos(ang)
            y = 9.5 + 2.6 * math.sin(ang)
            t.circle(x, y, 1.2, cols[k] if not water else mix(cols[k], '#9ED8F2', 0.4))
        if water:
            t.rect(4, 11, 12, 14, '#7EC8EA')
    else:
        t.circle(8, 9.5, 3.4, '#3C4A5A' if water else '#353A40')
    t.circle(6, 7.5, 1, '#C9D8E6')
    return t


def coffee_maker(name):
    t = Tex(16, 16, '#232427', name)
    t.rect(0, 0, 16, 4, '#3A3C40')
    t.rect(3, 2, 6, 3, '#5BE38A')
    t.rect(3, 7, 13, 14, '#3A2A20')
    t.rect(4, 8, 12, 13, '#6B4A33')
    t.rect(4, 8, 12, 9, '#C9A06A')
    t.rect(0, 14, 16, 16, '#1A1A1C')
    return t


def vending(name, upper):
    t = Tex(16, 16, '#C8362F', name)
    if upper:
        t.rect(1, 1, 11, 16, '#0F1A24')
        colors = ['#F2D24A', '#E35B5B', '#5BC8F2', '#7FD37F', '#F28A3A', '#C678DD']
        for row, y in enumerate((2, 6, 10, 14)):
            for col, x in enumerate((2, 4, 6, 8)):
                c = colors[(row * 4 + col) % len(colors)]
                t.rect(x, y, x + 2, y + 2, c)
            t.hline(y + 2, '#9EA3A8', 1, 11)
        t.rect(12, 2, 15, 5, '#0E2A1A')
        for y in range(7, 15, 2):
            t.rect(12, y, 15, y + 1, '#F0F0F0')
    else:
        t.rect(1, 0, 11, 9, '#0F1A24')
        t.rect(2, 10, 10, 14, '#141518')
        t.rect(12, 2, 15, 4, '#2C2D30')
        t.px(13, 3, '#F2D24A')
    return t


def arcade_marquee(name):
    t = Tex(16, 16, '#141518', name)
    t.vgrad('#3A1A6B', '#C8362F')
    draw_text(t, 'GAME', 0, 5, '#FFE27A')
    return t


def arcade_panel(name):
    t = Tex(16, 16, '#1E1F22', name)
    t.rect(1, 1, 15, 15, '#2A1A4B')
    draw_text(t, '25C', 2, 5, '#F2D24A')
    return t


def water_cooler(name):
    t = Tex(16, 16, '#EDEDEA', name).noise(0.008)
    t.rect(5, 3, 7, 5, '#3E7BD6')
    t.rect(9, 3, 11, 5, '#D63E3E')
    t.rect(4, 6, 12, 10, '#2A2B2E')
    return t


def ev_charger(name):
    t = Tex(16, 16, '#F2F2EF', name).noise(0.008)
    t.rect(2, 1, 14, 8, '#1D2230')
    draw_text(t, 'EV', 5, 2, '#7CF29A')
    t.circle(8, 11.5, 2.2, '#3EC86A')
    t.circle(8, 11.5, 1, '#1D2230')
    return t


def printer(name):
    t = Tex(16, 16, '#E4E4E1', name).noise(0.01)
    t.rect(2, 3, 14, 5, '#2A2B2E')
    t.rect(3, 9, 13, 12, '#F8F8F6')
    t.px(12, 6, '#5BE38A')
    return t


def elevator_door(name):
    t = M.brushed('#C7CBCF', name)
    t.vline(15, '#7F858B')
    t.vline(14, '#DADDE0')
    return t


def elevator_panel(name):
    t = M.brushed('#B9BDC1', name)
    t.rect(3, 0, 13, 7, '#141518')
    draw_text(t, '12', 5, 1, '#F2A24A')
    for row in range(4):
        for col in range(2):
            x, y = 5 + col * 4, 8 + row * 2
            t.px(x, y, '#F5D27A' if (row + col) % 3 == 0 else '#E8EAEC')
            t.px(x + 1, y, '#8E9399')
    return t


def elevator_call(name):
    t = M.brushed('#B9BDC1', name)
    t.circle(8, 5.5, 2.2, '#E8EAEC')
    t.circle(8, 10.5, 2.2, '#E8EAEC')
    t.px(8, 5, '#3C3F43')
    t.rect(7, 6, 10, 7, '#3C3F43')
    t.px(8, 11, '#3C3F43')
    t.rect(7, 10, 10, 11, '#3C3F43')
    return t


def keycard_reader(name, unlocked):
    t = Tex(16, 16, '#1E1F22', name)
    t.rect(4, 2, 12, 14, '#2C2D30')
    t.rect(5, 3, 11, 9, '#3A3C40')
    t.circle(8, 6, 2, '#5A5D62', fill=False)
    t.rect(6, 11, 10, 12, '#3EE07A' if unlocked else '#E03E3E')
    return t


def intercom(name):
    t = M.brushed('#BFC3C7', name)
    t.rect(4, 1, 12, 5, '#141518')
    t.rect(5, 2, 11, 4, '#2E5E8A')
    for y in range(7, 10):
        for x in range(5, 12, 2):
            t.px(x, y, '#3C3F43')
    for row in range(2):
        for col in range(3):
            t.rect(5 + col * 2, 11 + row * 2, 6 + col * 2, 12 + row * 2, '#E8EAEC')
    return t


def mailbox_bank(name):
    t = M.brushed('#C2B490', name)
    for row in range(4):
        for col in range(3):
            x0, y0 = col * 5 + 1, row * 4
            t.rect(x0, y0, x0 + 4, y0 + 4, '#D6C9A6')
            t.frame(x0, y0, x0 + 4, y0 + 4, '#8E8366')
            t.px(x0 + 1, y0 + 1, '#4A4433')
            t.px(x0 + 2, y0 + 2, '#2A261C')
    return t


def parcel_locker(name, upper):
    t = Tex(16, 16, '#5C6670', name).noise(0.01)
    if upper:
        t.rect(4, 2, 12, 7, '#141518')
        t.rect(5, 3, 11, 6, '#3E8EDE')
        t.frame(0, 9, 16, 16, '#3E474F')
        t.px(13, 12, '#D8DCE0')
    else:
        t.frame(0, 0, 16, 8, '#3E474F')
        t.frame(0, 8, 16, 16, '#3E474F')
        t.px(13, 4, '#D8DCE0')
        t.px(13, 12, '#D8DCE0')
    return t


def locker(name, upper):
    t = Tex(16, 16, '#4F6680', name).noise(0.015)
    t.vline(0, '#3A4D61')
    t.vline(15, '#3A4D61')
    if upper:
        for y in (2, 4, 6):
            t.rect(4, y, 12, y + 1, '#2E3B4A')
        t.rect(12, 12, 13, 15, '#C9CDD1')
    else:
        t.rect(12, 0, 13, 2, '#C9CDD1')
        for y in (10, 12):
            t.rect(4, y, 12, y + 1, '#2E3B4A')
    return t


def whiteboard(name):
    t = Tex(16, 16, '#F7F7F5', name)
    t.hline(4, '#3E6FD6', 2, 11)
    t.hline(7, '#D63E3E', 3, 13)
    t.hline(10, '#2E8A4A', 2, 9)
    t.rect(10, 9, 14, 13, '#F7F7F5')
    t.frame(10, 9, 14, 13, '#3E6FD6')
    return t


def exit_sign(name):
    t = Tex(16, 16, '#F2F2EF', name)
    t.frame(0, 3, 16, 13, '#D8D8D4')
    draw_text(t, 'EXIT', 1, 5, '#E3241B')
    return t


def thermostat(name):
    t = Tex(16, 16, '#F2F2EF', name)
    t.circle(8, 8, 6.4, '#D8D8D4')
    t.circle(8, 8, 5.2, '#20242B')
    draw_text(t, '72', 5, 6, '#F2A24A')
    return t


def light_switch(name, on):
    t = Tex(16, 16, '#F4F3EF', name)
    t.frame(3, 1, 13, 15, '#D9D7D1')
    t.rect(6, 4, 10, 12, '#E9E7E1')
    if on:
        t.rect(6, 4, 10, 8, '#FFFFFF')
        t.rect(6, 8, 10, 12, '#CFCDC6')
    else:
        t.rect(6, 4, 10, 8, '#CFCDC6')
        t.rect(6, 8, 10, 12, '#FFFFFF')
    return t


def clock_face(name):
    t = Tex(16, 16, '#F7F7F5', name)
    t.circle(8, 8, 7.4, '#20242B', fill=False)
    for (x, y) in ((8, 1), (14, 8), (8, 14), (1, 8)):
        t.px(x - (1 if x == 8 else 0) + (0 if x == 8 else 0), y, '#20242B')
    t.vline(7, '#20242B', 3, 8)
    t.hline(7, '#20242B', 7, 12)
    t.px(7, 7, '#C8362F')
    return t


def camera_lens(name):
    t = Tex(16, 16, '#EDEDEA', name)
    t.circle(8, 8, 5, '#1A1B1E')
    t.circle(8, 8, 3, '#2E3E5A')
    t.px(7, 7, '#9EC0F0')
    t.px(13, 3, '#E03E3E')
    return t


def fire_alarm(name):
    t = Tex(16, 16, '#C8241B', name)
    draw_text(t, 'FIRE', 0, 2, '#FFFFFF')
    t.rect(5, 9, 11, 13, '#F2F2EF')
    t.rect(6, 10, 10, 11, '#C8241B')
    return t


def extinguisher(name):
    t = Tex(16, 16, '#C8241B', name)
    t.row_tones(0.03)
    t.rect(0, 6, 16, 10, '#F2F2EF')
    return t


def smoke_detector(name):
    t = Tex(16, 16, '#F2F2EF', name)
    t.circle(8, 8, 6, '#E2E1DC', fill=False)
    t.circle(8, 8, 3, '#E2E1DC', fill=False)
    t.px(11, 5, '#3EE07A')
    return t


def outlet(name):
    t = Tex(16, 16, '#F4F3EF', name)
    t.frame(4, 2, 12, 14, '#D9D7D1')
    for y in (4, 9):
        t.rect(6, y, 7, y + 2, '#3C3F43')
        t.rect(9, y, 10, y + 2, '#3C3F43')
    return t


ICONS = ['stairs', 'elevator', 'restroom', 'fitness', 'pool', 'laundry', 'mail', 'parking', 'pets', 'bike',
         'lounge', 'wifi', 'leasing', 'trash', 'accessible', 'roof']


def pictogram(icon, name):
    bg, fg = '#26364F', '#F4F4F2'
    t = Tex(16, 16, bg, name)
    t.frame(0, 0, 16, 16, '#3A4D6B')
    if icon == 'stairs':
        for i in range(5):
            t.rect(3 + i * 2, 12 - i * 2, 14, 13 - i * 2 + 1, fg)
        t.circle(5.5, 5, 1.2, fg)
    elif icon == 'elevator':
        t.frame(3, 2, 13, 14, fg)
        t.vline(8, fg, 2, 14)
        t.px(5, 5, fg); t.rect(4, 6, 7, 7, fg)
        t.px(11, 9, fg); t.rect(10, 8, 13, 9, fg)
    elif icon == 'restroom':
        t.circle(5, 4, 1.4, fg); t.rect(4, 6, 7, 13, fg)
        t.circle(11, 4, 1.4, fg)
        for i in range(4):
            t.rect(10 - i // 2, 6 + i * 2, 12 + i // 2 + 1, 8 + i * 2, fg)
        t.vline(8, '#5A6B88', 2, 14)
    elif icon == 'fitness':
        t.rect(3, 7, 13, 9, fg)
        t.rect(2, 5, 4, 11, fg); t.rect(12, 5, 14, 11, fg)
        t.rect(1, 6, 2, 10, fg); t.rect(14, 6, 15, 10, fg)
    elif icon == 'pool':
        t.circle(10, 4, 1.5, fg)
        t.rect(4, 7, 10, 8, fg); t.rect(9, 6, 11, 7, fg)
        for y in (10, 13):
            for x in range(2, 14):
                if (x // 2) % 2 == (0 if y == 10 else 1):
                    t.px(x, y, fg)
                else:
                    t.px(x, y + 1, fg)
    elif icon == 'laundry':
        t.frame(3, 2, 13, 14, fg)
        t.hline(5, fg, 3, 13)
        t.circle(8, 9.5, 3, fg, fill=False)
    elif icon == 'mail':
        t.frame(2, 4, 14, 12, fg)
        for i in range(5):
            t.px(3 + i, 5 + i, fg)
            t.px(12 - i, 5 + i, fg)
    elif icon == 'parking':
        t.rect(5, 3, 7, 13, fg)
        t.rect(7, 3, 10, 5, fg); t.rect(10, 4, 12, 8, fg); t.rect(7, 7, 10, 9, fg)
    elif icon == 'pets':
        t.circle(8, 10, 2.6, fg)
        for (x, y) in ((4.5, 6.5), (7, 4.5), (9.5, 4.5), (12, 6.5)):
            t.circle(x, y, 1.2, fg)
    elif icon == 'bike':
        t.circle(4.5, 10, 2.8, fg, fill=False)
        t.circle(11.5, 10, 2.8, fg, fill=False)
        t.hline(7, fg, 5, 11)
        t.px(8, 8, fg); t.px(8, 9, fg); t.px(7, 6, fg)
    elif icon == 'lounge':
        t.rect(3, 8, 13, 11, fg)
        t.rect(3, 5, 5, 11, fg); t.rect(11, 5, 13, 11, fg)
        t.rect(4, 11, 5, 13, fg); t.rect(11, 11, 12, 13, fg)
    elif icon == 'wifi':
        t.circle(8, 13, 9, fg, fill=False)
        t.circle(8, 13, 6, fg, fill=False)
        t.circle(8, 13, 3, fg, fill=False)
        t.rect(0, 13, 16, 16, bg); t.frame(0, 0, 16, 16, '#3A4D6B')
        t.circle(8, 12.5, 1.2, fg)
    elif icon == 'leasing':
        t.frame(3, 2, 13, 14, fg)
        for y in (5, 8, 11):
            t.hline(y, fg, 5, 11)
    elif icon == 'trash':
        t.rect(4, 4, 12, 5, fg); t.rect(6, 3, 10, 4, fg)
        t.rect(5, 6, 11, 13, fg)
        t.vline(7, bg, 7, 12); t.vline(9, bg, 7, 12)
    elif icon == 'accessible':
        t.fill('#2F5FB0'); t.frame(0, 0, 16, 16, '#4A78C8')
        t.circle(7.5, 3.5, 1.2, fg)
        t.rect(7, 5, 8, 9, fg); t.rect(7, 8, 11, 9, fg); t.rect(10, 9, 11, 12, fg); t.rect(11, 11, 13, 12, fg)
        t.circle(7.0, 10.5, 3.2, fg, fill=False)
    elif icon == 'roof':
        for i in range(6):
            t.rect(7 - i, 3 + i, 9 + i, 4 + i, fg)
        t.rect(4, 9, 12, 13, fg)
        t.rect(7, 10, 9, 13, bg)
    return t


CABINET_COLORS = {
    'white': '#ECEAE4', 'navy': '#2E3B55', 'sage': '#9AAE95', 'charcoal': '#3C3F43', 'walnut': None,
}


def _cab_base(c, base, name):
    if base is None:
        return M.wood('walnut', name, vertical=True)
    return Tex(16, 16, base, name).noise(0.01)


def _pull(t, x0, y0, x1, y1, c):
    t.rect(x0, y0, x1, y1, '#C9A55A' if c in ('navy', 'sage', 'charcoal') else '#D8DCE0')


def cabinet_door(c, base, name):
    t = _cab_base(c, base, name)
    t.inset(1, 1, 8, 15, 1.08, 0.86)
    t.inset(8, 1, 15, 15, 1.08, 0.86)
    t.bevel(2, 2, 7, 14, 0.95, 1.05)
    t.bevel(9, 2, 14, 14, 0.95, 1.05)
    _pull(t, 6, 3, 7, 6, c)
    _pull(t, 9, 3, 10, 6, c)
    t.hline(15, '#1E1F22')
    return t


def cabinet_drawers(c, base, name):
    t = _cab_base(c, base, name)
    for (y0, y1) in ((1, 5), (5, 10), (10, 15)):
        t.inset(1, y0, 15, y1, 1.08, 0.86)
        _pull(t, 6, y0 + 1, 10, y0 + 2, c)
    t.hline(15, '#1E1F22')
    return t


def cabinet_sink(c, base, name):
    t = _cab_base(c, base, name)
    t.inset(1, 1, 15, 4, 1.08, 0.86)
    t.inset(1, 4, 8, 15, 1.08, 0.86)
    t.inset(8, 4, 15, 15, 1.08, 0.86)
    _pull(t, 6, 6, 7, 9, c)
    _pull(t, 9, 6, 10, 9, c)
    t.hline(15, '#1E1F22')
    return t


def cabinet_upper(c, base, name):
    t = _cab_base(c, base, name)
    t.inset(1, 1, 8, 15, 1.08, 0.86)
    t.inset(8, 1, 15, 15, 1.08, 0.86)
    t.rect(3, 3, 6, 9, '#C9DDE6')  # glass inserts
    t.rect(10, 3, 13, 9, '#C9DDE6')
    _pull(t, 6, 11, 7, 14, c)
    _pull(t, 9, 11, 10, 14, c)
    return t


def cabinet_side(c, base, name):
    t = _cab_base(c, base, name)
    t.hline(15, '#1E1F22')
    return t


def sink_basin(name):
    t = M.brushed('#B8BCC0', name)
    t.circle(8, 8, 1.4, '#3C3F43')
    t.frame(0, 0, 16, 16, '#8E9399')
    return t


def wardrobe_front(name, color):
    t = M.wood('walnut', name, vertical=True) if color is None else Tex(16, 16, color, name).noise(0.01)
    t.vline(7, shade(rgb(t.a[8, 3].astype(int).tolist()), 0.7))
    t.vline(8, shade(rgb(t.a[8, 3].astype(int).tolist()), 1.1))
    t.rect(6, 4, 7, 12, '#1E1F22')
    t.rect(9, 4, 10, 12, '#1E1F22')
    return t


def wardrobe_plain(name, color):
    t = M.wood('walnut', name, vertical=True) if color is None else Tex(16, 16, color, name).noise(0.01)
    base = rgb(t.a[8, 3].astype(int).tolist())
    t.vline(7, shade(base, 0.7))
    t.vline(8, shade(base, 1.1))
    return t


def shower_drain(name):
    t = M.tile_grid('#E9E8E4', '#9C9993', name, 2, 2, colors=['#E9E8E4', '#DAD8D2', '#F4F3F0'])
    t.rect(5, 5, 11, 11, '#9EA3A8')
    for y in range(6, 11, 2):
        t.hline(y, '#55595E', 6, 10)
    return t


def railing_textures():
    # glass railing: clear glass with a black cap rail and posts
    t = Tex(16, 16, '#C9DDE6', 'glass_railing')
    t.alpha(85)
    for x in range(16):
        for y in (0, 1):
            t.a[y, x] = (*rgb('#26272A')[:3], 255)
    reg('glass_railing', t)
    e = Tex(16, 16, '#26272A', 'glass_railing_edge')
    reg('glass_railing_edge', e)
    # black metal balusters
    t = Tex(16, 16, (0, 0, 0, 0), 'metal_railing')
    for x in range(16):
        t.px(x, 0, '#1E1F22')
        t.px(x, 1, '#2C2D30')
        t.px(x, 14, '#1E1F22')
    for x in (1, 5, 9, 13):
        t.vline(x, '#26272A', 2, 14)
    reg('metal_railing', t)
    reg('metal_railing_edge', Tex(16, 16, '#26272A', 'metal_railing_edge'))
    # frameless partition glass with chrome edge
    t = Tex(16, 16, '#D4E4EA', 'glass_partition')
    t.alpha(70)
    for k in range(16):
        t.a[15 - k, (4 + k // 2) % 16] = (235, 243, 247, 120)
    reg('glass_partition', t)
    reg('glass_partition_edge', M.brushed('#C9CDD1', 'glass_partition_edge'))


def dresser_front(name):
    t = M.wood('light', name)
    for (y0, y1) in ((0, 5), (5, 10), (10, 15)):
        t.inset(0, y0, 8, y1)
        t.inset(8, y0, 16, y1)
        t.rect(3, y0 + 2, 5, y0 + 3, '#2C2D30')
        t.rect(11, y0 + 2, 13, y0 + 3, '#2C2D30')
    t.hline(15, '#2A1D14')
    return t


def nightstand_front(name):
    t = M.wood('walnut', name)
    t.inset(1, 1, 15, 7)
    t.rect(6, 3, 10, 4, '#C9A55A')
    t.rect(1, 8, 15, 15, '#3A2A20')
    t.rect(2, 9, 6, 14, '#E8E2D4')  # books on the open shelf
    t.rect(6, 10, 8, 14, '#3E6FB8')
    return t


def book_spines(name):
    t = Tex(16, 16, '#3A2A20', name)
    rng = t.rng
    colors = ['#8E2F2F', '#2F4F8E', '#2F7A4A', '#C99A3A', '#E8E2D4', '#5A3A6B', '#1E1F22', '#B76A4B']
    for shelf in (0, 8):
        x = 0
        while x < 16:
            w = int(rng.integers(1, 3))
            h = int(rng.integers(5, 8))
            c = colors[int(rng.integers(0, len(colors)))]
            t.rect(x, shelf + 8 - h, x + w, shelf + 8, c)
            if w > 1:
                t.px(x, shelf + 8 - h + 1, shade(c, 1.3))
            x += w
        t.hline(shelf + 7, '#2A1D14')
    return t


def laundry_clothes(name):
    t = Tex(16, 16, '#5BC8F2', name)
    rng = t.rng
    colors = ['#E35B5B', '#F2F0EA', '#3E6FB8', '#7FD37F', '#F2D24A', '#4A4D52']
    for _ in range(40):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        c = colors[int(rng.integers(0, len(colors)))]
        t.rect(x, y, x + 3, y + 2, c)
    t.noise(0.04)
    return t


def clothes_rack(name):
    t = Tex(16, 16, '#00000000', name)
    colors = ['#2E3B55', '#F2F0EA', '#8E2F2F', '#4A4D52', '#C8B79B', '#2F6B57', '#D9A6A0']
    rng = t.rng
    x = 0
    while x < 16:
        w = int(rng.integers(2, 4))
        c = colors[int(rng.integers(0, len(colors)))]
        length = int(rng.integers(9, 15))
        t.rect(x, 1, x + w, 1 + length, c)
        t.vline(x, shade(c, 0.85), 1, 1 + length)
        x += w
    t.hline(0, '#C9CDD1')
    return t


def pillow_pattern(name):
    t = M.fabric('#E3DCCB', name)
    for i in range(0, 16, 4):
        t.hline(i + 1, '#C99A3A')
        t.vline(i + 1, '#C99A3A')
    return t


def doormat(name):
    t = Tex(16, 16, '#3A2E26', name).noise(0.08)
    t.frame(1, 1, 15, 15, '#1E1712')
    draw_text(t, 'HI', 5, 5, '#C9A06A')
    return t


def lifebuoy(name):
    t = Tex(16, 16, '#00000000', name)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if 3.5 <= d <= 7.5:
                ang = (math.atan2(y - 7.5, x - 7.5) + math.pi) / (math.pi / 2)
                t.px(x, y, '#E3341F' if int(ang) % 2 == 0 else '#F4F4F2')
    return t


def pool_table_top(name):
    t = M.fabric('#2F7A4A', name)
    t.circle(4, 8, 1, '#F2F2EE')
    t.circle(11, 7, 1, '#E3341F')
    t.circle(12, 9, 1, '#F2D24A')
    return t


def cornhole(name):
    t = M.wood('white_oak', name)
    t.rect(0, 0, 16, 3, '#2E3B55')
    t.rect(0, 13, 16, 16, '#2E3B55')
    t.circle(8, 6, 2.2, '#1E1712')
    return t


def dartboard(name):
    t = Tex(16, 16, '#00000000', name)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if d <= 7.5:
                ring = int(d / 1.5)
                ang = int((math.atan2(y - 7.5, x - 7.5) + math.pi) / (math.pi / 10))
                if ring == 0:
                    c = '#C8241B'
                elif ring in (3, 5):
                    c = '#C8241B' if ang % 2 == 0 else '#2E8A4A'
                else:
                    c = '#1E1F22' if ang % 2 == 0 else '#EADFC8'
                t.px(x, y, c)
    return t


def speaker(name):
    t = Tex(16, 16, '#1E1F22', name)
    t.circle(8, 5, 2.6, '#3A3C40')
    t.circle(8, 5, 1, '#55585D')
    t.circle(8, 11.5, 3.4, '#3A3C40')
    t.circle(8, 11.5, 1.4, '#55585D')
    return t


def console_front(name):
    t = Tex(16, 16, '#F2F2EF', name)
    t.rect(0, 0, 16, 16, '#1E1F22')
    t.hline(8, '#3E8EDE', 2, 14)
    t.px(13, 5, '#FFFFFF')
    return t


def router(name):
    t = Tex(16, 16, '#232427', name)
    for x in (3, 6, 9, 12):
        t.px(x, 8, '#3EE07A')
    return t


def grooming(name):
    t = Tex(16, 16, '#00000000', name)
    for i, c in enumerate(['#3E8EDE', '#E35B9B', '#7FD37F', '#F2D24A']):
        t.rect(1 + i * 4, 6, 3 + i * 4, 15, c)
        t.rect(1 + i * 4, 4, 3 + i * 4, 6, '#F2F2EF')
    return t


def bin_face(name, color, text):
    t = Tex(16, 16, color, name).noise(0.02)
    t.hline(0, shade(color, 1.3))
    if text == 'RECYCLE':
        for i in range(3):
            ang = i * 2.09
            t.circle(8 + 3 * math.cos(ang), 8 + 3 * math.sin(ang), 1.3, '#F4F4F2')
        t.circle(8, 8, 3, '#F4F4F2', fill=False)
    elif text == 'PETS':
        t.circle(8, 10, 2.2, '#F4F4F2')
        for (x, y) in ((5, 6.5), (7.2, 5), (9.2, 5), (11.4, 6.5)):
            t.circle(x, y, 1, '#F4F4F2')
    else:  # trash can pictogram
        c = '#F4F4F2'
        t.rect(4, 4, 12, 5, c)
        t.rect(6, 3, 10, 4, c)
        t.rect(5, 6, 11, 13, c)
        t.vline(7, color, 7, 12)
        t.vline(9, color, 7, 12)
    return t


# =============================================================================== art
def art() -> None:
    # Rothko-style colour fields
    t = Tex(16, 16, '#5A1E1E', 'art_fields')
    t.rect(1, 1, 15, 7, '#D9662E')
    t.rect(1, 8, 15, 15, '#8E2F2F')
    t.noise(0.04)
    reg('art_fields', t)
    # Mondrian grid
    t = Tex(16, 16, '#F2EFE6', 'art_grid')
    for x in (4, 11):
        t.vline(x, '#111111')
    for y in (5, 10):
        t.hline(y, '#111111')
    t.rect(0, 0, 4, 5, '#D7261E')
    t.rect(12, 11, 16, 16, '#1E4FA8')
    t.rect(5, 11, 11, 16, '#F2C81E')
    reg('art_grid', t)
    # ocean waves
    t = Tex(16, 16, '#1E4F7A', 'art_waves')
    for y in range(16):
        for x in range(16):
            v = math.sin(x * 0.6 + y * 0.9) + math.sin(y * 0.4)
            t.px(x, y, mix('#1E4F7A', '#8FD3E0', (v + 2) / 4))
    reg('art_waves', t)
    # mountain sunset
    t = Tex(16, 16, '#F2A24A', 'art_sunset')
    t.vgrad('#F27A4A', '#F2D27A', 0, 0, 16, 9)
    t.circle(8, 8, 3, '#FFF0C0')
    for x in range(16):
        h = int(4 + 2 * math.sin(x * 0.7) + math.sin(x * 1.7))
        t.rect(x, 16 - h - 3, x + 1, 16, '#5A3A5A')
    t.rect(0, 13, 16, 16, '#3A2A4A')
    reg('art_sunset', t)
    # botanical print
    t = Tex(16, 16, '#EFE8D8', 'art_botanical')
    t.vline(8, '#4A6B3A', 3, 15)
    for i, y in enumerate(range(4, 14, 2)):
        side = -1 if i % 2 == 0 else 1
        for k in range(1, 4):
            t.px(8 + side * k, y - k // 2, '#5C8A48')
            t.px(8 + side * k, y - k // 2 + 1, '#4A6B3A')
    t.frame(0, 0, 16, 16, '#D8CFBC')
    reg('art_botanical', t)
    # mid-century geometry
    t = Tex(16, 16, '#EDE4D0', 'art_geometric')
    t.circle(5, 5, 3.5, '#D9662E')
    for i in range(6):
        t.rect(9, 9 + i, 9 + i + 1, 10 + i, '#2F6B6B')
    t.rect(10, 2, 14, 6, '#C99A3A')
    t.circle(5, 12, 2, '#2E3B55')
    reg('art_geometric', t)
    # black and white city photo
    t = Tex(16, 16, '#C9C9C9', 'art_city')
    t.vgrad('#E0E0E0', '#9A9A9A')
    rng = t.rng
    x = 0
    while x < 16:
        w = int(rng.integers(2, 4))
        h = int(rng.integers(5, 13))
        g = int(rng.integers(40, 90))
        t.rect(x, 16 - h, x + w, 16, (g, g, g))
        x += w + (1 if rng.random() < 0.3 else 0)
    reg('art_city', t)
    # abstract brush strokes (wide 32x16)
    t = Tex(32, 16, '#F2EFE6', 'art_wide_strokes')
    for k, c in enumerate(['#2E3B55', '#C99A3A', '#B76A4B', '#2F6B57']):
        for x in range(32):
            y = int(8 + 5 * math.sin(x * 0.25 + k * 1.3) * (0.4 + 0.15 * k))
            t.rect(x, y, x + 1, y + 2, c)
    reg('art_wide_strokes', t)
    # panoramic landscape (wide 32x16)
    t = Tex(32, 16, '#87B7E0', 'art_wide_landscape')
    t.vgrad('#87B7E0', '#D9ECF7', 0, 0, 32, 9)
    for x in range(32):
        h = int(5 + 2 * math.sin(x * 0.3) + 1.5 * math.sin(x * 0.75 + 2))
        t.rect(x, 16 - h - 2, x + 1, 16, '#5E7A5A')
        h2 = int(3 + math.sin(x * 0.5 + 1))
        t.rect(x, 16 - h2, x + 1, 16, '#3E5A3A')
    reg('art_wide_landscape', t)


# =============================================================================== plants
PLANT_GREENS = {
    'monstera': ('#2E6B34', '#3E8A44', '#1E4F24'),
    'fern': ('#4E8C3E', '#6FAE52', '#3B6E2C'),
    'snake': ('#3F6B3A', '#C9C25A', '#2C4F28'),
    'fiddle': ('#355F2A', '#4E7E3A', '#24441C'),
    'olive': ('#7A8C6A', '#A3B494', '#5C6B4E'),
    'succulent': ('#7FAE8A', '#A8D0B0', '#5C8A66'),
    'palm': ('#4E8C3E', '#7FB860', '#3B6E2C'),
    'herbs': ('#4E9A3E', '#6FBF52', '#3B7A2C'),
}


def plants() -> None:
    for kind, (base, light, dark) in PLANT_GREENS.items():
        reg(f'plant_{kind}', plant_sprite(kind, base, light, dark))
    reg('plant_flowers', flower_sprite('plant_flowers'))


def plant_sprite(kind, base, light, dark):
    t = Tex(16, 16, (0, 0, 0, 0), f'plant_{kind}')
    rng = t.rng
    if kind == 'snake':
        for i, x in enumerate((3, 6, 8, 10, 13)):
            h = 9 + int(rng.integers(0, 6))
            for y in range(16 - h, 16):
                t.px(x, y, base)
                t.px(x + 1, y, light if y % 3 else base)
            t.px(x, 16 - h - 1, dark)
    elif kind in ('fern', 'palm', 'herbs'):
        for k in range(7):
            ang = -math.pi / 2 + (k - 3) * 0.42
            for r in range(1, 9 if kind != 'herbs' else 6):
                x = 7.5 + math.cos(ang) * r
                y = 15 + math.sin(ang) * r * 1.5 - r * 0.2
                t.px(int(x), int(y), base if r % 2 else light)
                if r > 2:
                    t.px(int(x + math.cos(ang + 1.57) * 1.2), int(y + math.sin(ang + 1.57) * 1.2), dark)
    elif kind == 'succulent':
        for r, c in ((5, dark), (4, base), (2.5, light)):
            for k in range(10):
                ang = k * 0.63
                t.circle(7.5 + math.cos(ang) * r * 0.6, 11 + math.sin(ang) * r * 0.35, 1.3, c)
    else:
        t.vline(7, '#5A4030', 6, 16)
        t.vline(8, '#4A3424', 8, 16)
        n = 7 if kind != 'olive' else 12
        for k in range(n):
            cx = 7.5 + rng.uniform(-5.5, 5.5)
            cy = rng.uniform(1.5, 10)
            rad = rng.uniform(1.5, 2.8) if kind != 'olive' else rng.uniform(0.8, 1.4)
            t.circle(cx, cy, rad, base)
            t.circle(cx - 0.6, cy - 0.6, rad * 0.5, light)
            if kind == 'monstera':
                t.px(int(cx), int(cy), dark)
    return t


def flower_sprite(name):
    t = plant_sprite('fern', '#4E8C3E', '#6FAE52', '#3B6E2C')
    t.name = name
    rng = t.rng
    for _ in range(9):
        x, y = int(rng.integers(2, 14)), int(rng.integers(2, 10))
        c = ['#E35B9B', '#F2D24A', '#F4F4F2', '#C678DD', '#F28A3A'][int(rng.integers(0, 5))]
        t.px(x, y, c)
        t.px(x + 1, y, c)
        t.px(x, y + 1, c)
    return t


# =============================================================================== doors
DOORS = {
    'walnut': 'Walnut Unit Door', 'white': 'White Interior Door', 'charcoal': 'Charcoal Unit Door',
    'glass': 'Glass Amenity Door', 'barn': 'Barn Door', 'steel': 'Steel Service Door',
    'patio': 'Sliding Patio Door', 'oak': 'Oak Unit Door',
}


def doors() -> None:
    for kind in DOORS:
        bottom, top = door_halves(kind)
        reg(f'door_{kind}_bottom', bottom)
        reg(f'door_{kind}_top', top)
        reg(f'door_{kind}', door_item(kind, bottom, top), folder='item')


def door_halves(kind):
    if kind in ('walnut', 'oak'):
        base = M.wood('walnut' if kind == 'walnut' else 'light', f'door_{kind}', vertical=True)
        b, t = base.copy(f'door_{kind}_b'), base.copy(f'door_{kind}_t')
        for tex in (b, t):
            tex.frame(0, 0, 16, 16, shade(rgb(base.a[3, 3].astype(int).tolist()), 0.75))
        b.rect(12, 0, 14, 1, '#D8DCE0')
        t.circle(8, 6, 0.9, '#1E1F22')  # peephole
        t.rect(6, 9, 10, 11, '#C9A55A')  # unit number plate (blank)
        return b, t
    if kind == 'white':
        b = Tex(16, 16, '#F0EEE9', 'door_white_b').noise(0.008)
        t = b.copy('door_white_t')
        b.inset(3, 2, 13, 14)
        t.inset(3, 2, 13, 14)
        b.rect(11, 0, 14, 1, '#C9CDD1')
        for tex in (b, t):
            tex.frame(0, 0, 16, 16, '#D9D6CF')
        return b, t
    if kind == 'charcoal':
        b = Tex(16, 16, '#3C3F43', 'door_charcoal_b').noise(0.012)
        t = b.copy('door_charcoal_t')
        b.rect(12, 0, 13, 4, '#1E1F22')
        b.rect(11, 0, 14, 1, '#1E1F22')
        t.circle(8, 6, 0.9, '#1E1F22')
        for tex in (b, t):
            tex.frame(0, 0, 16, 16, '#2C2E31')
        t.rect(5, 9, 11, 11, '#C9A55A')
        return b, t
    if kind in ('glass', 'patio'):
        frame = '#26272A' if kind == 'glass' else '#9EA3A8'
        b = Tex(16, 16, '#BCD3DE', f'door_{kind}_b')
        t = b.copy(f'door_{kind}_t')
        for tex in (b, t):
            tex.alpha(110)
            for i in range(16):
                for k in (0, 1, 14, 15):
                    tex.a[i, k] = (*rgb(frame)[:3], 255)
        b.rect(0, 13, 16, 16, frame)
        t.rect(0, 0, 16, 2, frame)
        b.rect(11, 0, 13, 10, frame if kind == 'glass' else '#D8DCE0')
        return b, t
    if kind == 'barn':
        base = M.slats('#8A5A3A', '#4A2E1C', 'door_barn', vertical=True, width=4)
        b, t = base.copy('door_barn_b'), base.copy('door_barn_t')
        for i in range(16):
            b.px(i, 15 - i, '#4A2E1C')
        t.rect(0, 1, 16, 3, '#1E1F22')
        b.rect(0, 12, 16, 14, '#1E1F22')
        return b, t
    # steel service door
    b = M.brushed('#8E9399', 'door_steel_b')
    t = b.copy('door_steel_t')
    b.rect(2, 1, 14, 3, '#C9CDD1')
    t.rect(4, 4, 12, 10, '#BCD3DE')
    t.frame(4, 4, 12, 10, '#5A5D62')
    for tex in (b, t):
        tex.frame(0, 0, 16, 16, '#6A6F75')
    return b, t


def door_item(kind, bottom, top):
    t = Tex(16, 16, (0, 0, 0, 0), f'door_{kind}_item')
    for y in range(8):
        for x in range(8):
            t.a[y, x + 4] = top.a[y * 2, x * 2]
            t.a[y + 8, x + 4] = bottom.a[y * 2, x * 2]
    return t


# =============================================================================== items
def items() -> None:
    t = Tex(16, 16, (0, 0, 0, 0), 'apartment_key')
    t.circle(5, 5, 3.2, '#D6B04A')
    t.circle(5, 5, 1.4, (0, 0, 0, 0))
    for i in range(7):
        t.rect(7 + i, 7 + i, 9 + i, 9 + i, '#D6B04A')
    t.rect(11, 12, 13, 14, '#D6B04A')
    t.rect(13, 10, 15, 12, '#D6B04A')
    t.px(4, 4, '#F2D27A')
    reg('apartment_key', t, folder='item')

    t = Tex(16, 16, (0, 0, 0, 0), 'access_keycard')
    t.rect(1, 4, 15, 13, '#F4F4F2')
    t.frame(1, 4, 15, 13, '#C9C9C4')
    t.rect(1, 5, 15, 7, '#2F5FA8')
    t.rect(3, 9, 6, 11, '#D6B04A')
    t.rect(8, 9, 13, 10, '#9A9A96')
    reg('access_keycard', t, folder='item')

    t = Tex(16, 16, (0, 0, 0, 0), 'master_keycard')
    t.rect(1, 4, 15, 13, '#202124')
    t.frame(1, 4, 15, 13, '#3C3F43')
    t.rect(1, 5, 15, 7, '#C9A55A')
    t.rect(3, 9, 6, 11, '#D6B04A')
    reg('master_keycard', t, folder='item')

    t = Tex(16, 16, (0, 0, 0, 0), 'coffee_cup')
    t.rect(4, 4, 12, 15, '#F4F4F2')
    t.rect(4, 7, 12, 11, '#8A5A3A')
    t.rect(3, 3, 13, 5, '#2A2B2E')
    t.rect(5, 1, 11, 3, '#3C3F43')
    reg('coffee_cup', t, folder='item')

    t = Tex(16, 16, (0, 0, 0, 0), 'takeout_box')
    t.rect(3, 6, 13, 15, '#F4F4F2')
    t.rect(4, 3, 12, 6, '#E8E8E4')
    t.rect(7, 1, 9, 3, '#C9A06A')
    t.rect(6, 9, 10, 12, '#C8362F')
    reg('takeout_box', t, folder='item')

    for key, color in BLUEPRINT_COLORS.items():
        reg(f'blueprint_{key}', blueprint_icon(key, color), folder='item')
    t = blueprint_icon('remover', '#C8362F')
    reg('demolition_permit', t, folder='item')


BLUEPRINT_COLORS = {
    'metropolitan': '#C9A55A', 'parkside': '#5C9A48', 'skyline': '#5BA8E8', 'courtyard': '#E8A24A',
    'urban_lofts': '#B76A4B',
}


def blueprint_icon(key, accent):
    t = Tex(16, 16, (0, 0, 0, 0), f'bp_{key}')
    t.rect(2, 2, 14, 14, '#2F5FA8')
    t.frame(2, 2, 14, 14, '#1E3F78')
    for x in range(3, 13, 3):
        t.vline(x, '#4A7AC0', 3, 13)
    for y in range(3, 13, 3):
        t.hline(y, '#4A7AC0', 3, 13)
    # tiny building silhouette in accent colour
    heights = {'metropolitan': (6, 8, 6), 'parkside': (4, 5, 4), 'skyline': (5, 10, 5), 'courtyard': (4, 3, 4),
               'urban_lofts': (5, 5, 5), 'remover': (3, 3, 3)}[key]
    for i, h in enumerate(heights):
        t.rect(4 + i * 3, 13 - h, 6 + i * 3, 13, accent)
        t.px(4 + i * 3, 13 - h, '#FFFFFF')
    t.rect(12, 1, 15, 4, accent)
    return t


def build_all() -> dict:
    materials()
    building()
    faces()
    plants()
    doors()
    items()
    return TEXTURES
