"""Generates every asset and data file of the mod from the catalog.

Usage: python3 tools/assetgen/generate.py

Outputs (all under src/main/resources):
  assets/modernapartments/{blockstates,models,items,textures,lang}
  data/modernapartments/loot_table/blocks, data/minecraft/tags/block/*
  modernapartments/furniture_shapes.json  (collision boxes read by the Java blocks)
"""
from __future__ import annotations

import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import catalog  # noqa: E402
import textures  # noqa: E402
from model import TALL_ITEM_DISPLAY, LONG_ITEM_DISPLAY, collision_boxes, template_json  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', 'src', 'main', 'resources'))
NS = catalog.NS
ASSETS = os.path.join(ROOT, 'assets', NS)
DATA = os.path.join(ROOT, 'data')

ROT = {'north': 0, 'east': 90, 'south': 180, 'west': 270}
FACINGS = ('north', 'east', 'south', 'west')

FACING_KINDS = {'furniture', 'seat', 'storage', 'wall', 'wall_storage', 'facing_cube', 'coffee', 'intercom',
                'elevator_panel', 'jet', 'pool_ladder'}
TOGGLE_KINDS = {'toggle', 'appliance', 'wall_toggle', 'grill', 'keycard_reader', 'light_switch'}
LIT_FACING_KINDS = {'lamp', 'wall_lamp', 'string_lights'}
LIT_KINDS = {'ceiling_lamp', 'lamp_nodir', 'light_panel'}
SIMPLE_KINDS = {'cube', 'glass', 'elevator', 'plant', 'post', 'ceiling', 'bell'}
TALL_KINDS = {'tall', 'tall_storage', 'vending'}
TWO_PART_KINDS = {'bathtub', 'treadmill', 'lounger', 'two_part', 'slide'}
HALF_LOOT_KINDS = TALL_KINDS | {'tall_toggle', 'door', 'elevator_door'}


def write_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2)
        f.write('\n')


def tex_ref(name: str) -> str:
    return name if ':' in name else f'{NS}:block/{name}'


def model_name(block, key: str) -> str:
    return f'{NS}:block/{block.id}' + (f'_{key}' if key else '')


# ----------------------------------------------------------------------------- models
def write_models(templates: dict, blocks: list) -> None:
    used = set()
    for b in blocks:
        if b.kind in ('door', 'pane'):
            continue
        for key, (tpl, texs) in b.models.items():
            used.add(tpl)
    for name, t in templates.items():
        if name not in used:
            continue
        write_json(os.path.join(ASSETS, 'models', 'block', 'template', f'{name}.json'),
                   template_json(t['boxes'], t.get('display'), t.get('ao', True)))

    for b in blocks:
        if b.kind == 'door':
            write_door_models(b)
            continue
        if b.kind == 'pane':
            write_pane_models(b)
            continue
        for key, (tpl, texs) in b.models.items():
            parent = tpl if tpl.startswith('minecraft:') else f'{NS}:block/template/{tpl}'
            tx = {k: tex_ref(v) for k, v in texs.items()}
            tx['particle'] = tex_ref(b.particle) if b.particle else next(iter(tx.values()))
            write_json(os.path.join(ASSETS, 'models', 'block', f'{b.id}' + (f'_{key}' if key else '') + '.json'),
                       {'parent': parent, 'textures': tx})


def write_door_models(b) -> None:
    kind = b.id[len('door_'):]
    for part in ('bottom_left', 'bottom_left_open', 'bottom_right', 'bottom_right_open',
                 'top_left', 'top_left_open', 'top_right', 'top_right_open'):
        write_json(os.path.join(ASSETS, 'models', 'block', f'{b.id}_{part}.json'), {
            'parent': f'minecraft:block/door_{part}',
            'textures': {'bottom': tex_ref(f'door_{kind}_bottom'), 'top': tex_ref(f'door_{kind}_top')},
        })


def write_pane_models(b) -> None:
    tpl, texs = b.models['']
    pane, edge = tex_ref(texs['pane']), tex_ref(texs['edge'])
    for part in ('post', 'side', 'side_alt', 'noside', 'noside_alt'):
        write_json(os.path.join(ASSETS, 'models', 'block', f'{b.id}_{part}.json'), {
            'parent': f'minecraft:block/template_glass_pane_{part}',
            'textures': {'pane': pane, 'edge': edge, 'particle': pane},
        })


# ----------------------------------------------------------------------------- blockstates
def variant(model: str, y: int = 0, x: int = 0) -> dict:
    v = {'model': model}
    if x:
        v['x'] = x
    if y:
        v['y'] = y
    return v


def blockstate(b) -> dict:
    k = b.kind
    m = lambda key: model_name(b, key)  # noqa: E731
    if k in SIMPLE_KINDS:
        return {'variants': {'': variant(m(''))}}
    if k == 'pillar':
        return {'variants': {'axis=y': variant(m('')), 'axis=x': variant(m('horizontal'), x=90, y=90),
                             'axis=z': variant(m('horizontal'), x=90)}}
    if k in FACING_KINDS:
        return {'variants': {f'facing={f}': variant(m(''), ROT[f]) for f in FACINGS}}
    if k in TOGGLE_KINDS:
        return {'variants': {f'facing={f},on={str(on).lower()}': variant(m('on' if on else 'off'), ROT[f])
                             for f in FACINGS for on in (False, True)}}
    if k in LIT_FACING_KINDS or k == 'oven':
        return {'variants': {f'facing={f},lit={str(on).lower()}': variant(m('on' if on else 'off'), ROT[f])
                             for f in FACINGS for on in (False, True)}}
    if k in LIT_KINDS:
        return {'variants': {'lit=false': variant(m('off')), 'lit=true': variant(m('on'))}}
    if k == 'sofa':
        return {'variants': {f'facing={f},shape={s}': variant(m(s), ROT[f]) for f in FACINGS
                             for s in ('single', 'left', 'middle', 'right', 'corner_left', 'corner_right')}}
    if k in TALL_KINDS:
        return {'variants': {f'facing={f},half={h}': variant(m(h), ROT[f]) for f in FACINGS
                             for h in ('lower', 'upper')}}
    if k == 'tall_toggle':
        return {'variants': {f'facing={f},half={h},on={str(on).lower()}': variant(m(h + ('_on' if on else '')), ROT[f])
                             for f in FACINGS for h in ('lower', 'upper') for on in (False, True)}}
    if k == 'curtain':
        return {'variants': {f'facing={f},open={str(o).lower()}': variant(m('open' if o else 'closed'), ROT[f])
                             for f in FACINGS for o in (False, True)}}
    if k in TWO_PART_KINDS:
        return {'variants': {f'facing={f},part={p}': variant(m(p), ROT[f]) for f in FACINGS for p in ('head', 'foot')}}
    if k == 'table':
        parts = [{'apply': {'model': m('top')}}]
        for corner, (a, c) in {'nw': ('north', 'west'), 'ne': ('north', 'east'), 'sw': ('south', 'west'),
                               'se': ('south', 'east')}.items():
            parts.append({'when': {a: 'false', c: 'false'}, 'apply': {'model': m(f'leg_{corner}')}})
        return {'multipart': parts}
    if k == 'door':
        return door_blockstate(b)
    if k == 'elevator_door':
        out = {}
        for f in FACINGS:
            for h in ('lower', 'upper'):
                for hinge in ('left', 'right'):
                    for o in (False, True):
                        key = 'closed' if not o else f'open_{hinge}'
                        out[f'facing={f},half={h},hinge={hinge},open={str(o).lower()}'] = variant(m(key), ROT[f])
        return {'variants': out}
    if k == 'pane':
        return pane_blockstate(b)
    raise ValueError(f'unknown kind {k} for {b.id}')


def door_blockstate(b) -> dict:
    # Mirrors vanilla's door blockstate layout exactly.
    base = {'east': 0, 'south': 90, 'west': 180, 'north': 270}
    out = {}
    for f in FACINGS:
        for half, hp in (('lower', 'bottom'), ('upper', 'top')):
            for hinge in ('left', 'right'):
                for o in (False, True):
                    model = f'{NS}:block/{b.id}_{hp}_{hinge}' + ('_open' if o else '')
                    y = base[f]
                    if o:
                        y = (y + (90 if hinge == 'left' else 270)) % 360
                    out[f'facing={f},half={half},hinge={hinge},open={str(o).lower()}'] = variant(model, y)
    return {'variants': out}


def pane_blockstate(b) -> dict:
    m = lambda p: f'{NS}:block/{b.id}_{p}'  # noqa: E731
    return {'multipart': [
        {'apply': {'model': m('post')}},
        {'when': {'north': 'true'}, 'apply': {'model': m('side')}},
        {'when': {'east': 'true'}, 'apply': {'model': m('side'), 'y': 90}},
        {'when': {'south': 'true'}, 'apply': {'model': m('side_alt')}},
        {'when': {'west': 'true'}, 'apply': {'model': m('side_alt'), 'y': 90}},
        {'when': {'north': 'false'}, 'apply': {'model': m('noside')}},
        {'when': {'east': 'false'}, 'apply': {'model': m('noside_alt')}},
        {'when': {'south': 'false'}, 'apply': {'model': m('noside_alt'), 'y': 90}},
        {'when': {'west': 'false'}, 'apply': {'model': m('noside'), 'y': 270}},
    ]}


# ----------------------------------------------------------------------------- items
def item_model(b, templates: dict) -> str:
    """Writes any dedicated item model and returns the model id the item definition points at."""
    k = b.kind
    if b.item:
        tpl, texs, display = b.item
        t = templates[tpl]
        tx = {kk: tex_ref(v) for kk, v in texs.items()}
        tx['particle'] = next(iter(tx.values()))
        obj = {'parent': f'{NS}:block/template/{tpl}', 'textures': tx}
        if display:
            obj['display'] = display
        write_json(os.path.join(ASSETS, 'models', 'item', f'{b.id}.json'), obj)
        _ensure_template(tpl, templates)
        return f'{NS}:item/{b.id}'
    if k == 'door':
        write_json(os.path.join(ASSETS, 'models', 'item', f'{b.id}.json'),
                   {'parent': 'minecraft:item/generated', 'textures': {'layer0': f'{NS}:item/{b.id}'}})
        return f'{NS}:item/{b.id}'
    if k == 'pane':
        tex = tex_ref(b.models[''][1]['pane'])
        write_json(os.path.join(ASSETS, 'models', 'item', f'{b.id}.json'),
                   {'parent': 'minecraft:item/generated', 'textures': {'layer0': tex}})
        return f'{NS}:item/{b.id}'
    if k in TALL_KINDS or k == 'tall_toggle':
        return merged_item(b, templates, 'lower', 'upper', (0, 16, 0), TALL_ITEM_DISPLAY)
    if k in TWO_PART_KINDS:
        return merged_item(b, templates, 'head', 'foot', (0, 0, 16), LONG_ITEM_DISPLAY)
    key = {'sofa': 'single', 'curtain': 'closed', 'table': 'top', 'elevator_door': 'closed'}.get(k)
    if key is None:
        if k == 'light_panel':
            key = 'on'
        elif k in TOGGLE_KINDS or k in LIT_FACING_KINDS or k in LIT_KINDS or k == 'oven':
            key = 'off'
        else:
            key = ''
    return model_name(b, key)


def _ensure_template(tpl, templates):
    path = os.path.join(ASSETS, 'models', 'block', 'template', f'{tpl}.json')
    if not os.path.exists(path):
        t = templates[tpl]
        write_json(path, template_json(t['boxes'], t.get('display'), t.get('ao', True)))


def merged_item(b, templates, k1, k2, offset, display) -> str:
    tpl1, tex1 = b.models[k1]
    tpl2, tex2 = b.models[k2]
    boxes = list(templates[tpl1]['boxes']) + [bx.moved(*offset) for bx in templates[tpl2]['boxes']]
    obj = template_json(boxes, display)
    obj.pop('parent', None)
    obj['parent'] = 'minecraft:block/block'
    tx = {kk: tex_ref(v) for kk, v in {**tex1, **tex2}.items()}
    tx['particle'] = next(iter(tx.values()))
    obj['textures'] = tx
    write_json(os.path.join(ASSETS, 'models', 'item', f'{b.id}.json'), obj)
    return f'{NS}:item/{b.id}'


# ----------------------------------------------------------------------------- data
def loot_table(b) -> dict:
    entry = {'type': 'minecraft:item', 'name': f'{NS}:{b.id}'}
    conditions = [{'condition': 'minecraft:survives_explosion'}]
    if b.kind in HALF_LOOT_KINDS:
        conditions.insert(0, {'condition': 'minecraft:block_state_property', 'block': f'{NS}:{b.id}',
                              'properties': {'half': 'lower'}})
    elif b.kind in TWO_PART_KINDS:
        conditions.insert(0, {'condition': 'minecraft:block_state_property', 'block': f'{NS}:{b.id}',
                              'properties': {'part': 'head'}})
    return {'type': 'minecraft:block', 'pools': [{'rolls': 1, 'entries': [entry], 'conditions': conditions}],
            'random_sequence': f'{NS}:blocks/{b.id}'}


WOOD_WORDS = ('wood', 'oak', 'walnut', 'cedar', 'hardwood', 'herringbone', 'bookcase', 'dresser', 'nightstand',
              'wardrobe', 'desk', 'table', 'chair', 'bench', 'cabinet', 'drawers', 'upper', 'console', 'shelf',
              'door_walnut', 'door_white', 'door_oak', 'door_barn', 'picnic', 'cornhole', 'planter_box')


def tool_for(b) -> str:
    if any(w in b.id for w in WOOD_WORDS):
        return 'axe'
    if b.group in ('materials', 'systems', 'parking', 'kitchen', 'bathroom', 'laundry', 'fitness', 'lighting',
                   'electronics', 'lobby', 'signage', 'doors', 'amenity', 'outdoor'):
        return 'pickaxe'
    return 'axe'


def write_data(blocks: list, shapes: dict) -> None:
    for b in blocks:
        write_json(os.path.join(DATA, NS, 'loot_table', 'blocks', f'{b.id}.json'), loot_table(b))
    axe = sorted(f'{NS}:{b.id}' for b in blocks if tool_for(b) == 'axe')
    pick = sorted(f'{NS}:{b.id}' for b in blocks if tool_for(b) == 'pickaxe')
    write_json(os.path.join(DATA, 'minecraft', 'tags', 'block', 'mineable', 'axe.json'), {'values': axe})
    write_json(os.path.join(DATA, 'minecraft', 'tags', 'block', 'mineable', 'pickaxe.json'), {'values': pick})
    write_json(os.path.join(DATA, 'minecraft', 'tags', 'block', 'climbable.json'), {'values': [f'{NS}:pool_ladder']})
    doors = [f'{NS}:{b.id}' for b in blocks if b.kind == 'door']
    write_json(os.path.join(DATA, 'minecraft', 'tags', 'block', 'doors.json'), {'values': doors})
    write_json(os.path.join(DATA, 'minecraft', 'tags', 'item', 'doors.json'), {'values': doors})
    os.makedirs(os.path.join(ROOT, NS), exist_ok=True)
    write_json(os.path.join(ROOT, NS, 'furniture_shapes.json'), shapes)


def collect_shapes(templates: dict, blocks: list) -> dict:
    tpl_shapes = {}
    block_map = {}
    for b in blocks:
        if b.kind in ('door', 'pane') or b.kind in ('cube', 'glass', 'pillar', 'facing_cube', 'light_panel',
                                                     'elevator'):
            continue
        entry = {}
        for key, (tpl, _) in b.models.items():
            if tpl.startswith('minecraft:'):
                continue
            t = templates[tpl]
            if tpl not in tpl_shapes:
                tpl_shapes[tpl] = t['collision'] if t.get('collision') is not None else collision_boxes(t['boxes'])
            entry[key] = tpl
        block_map[b.id] = {'kind': b.kind, 'shapes': entry}
    return {'templates': tpl_shapes, 'blocks': block_map}


def lang(blocks: list) -> dict:
    out = {}
    for b in blocks:
        out[f'block.{NS}.{b.id}'] = b.name
    return out


def template_vars(boxes) -> set:
    out = set()
    for b in boxes:
        for f in ('north', 'south', 'east', 'west', 'up', 'down'):
            if f in b.skip:
                continue
            t = b.faces.get(f, b.tex)
            if t is not None:
                out.add(t)
    return out


def check_models(templates: dict, blocks: list) -> list:
    """Undefined texture variables and out-of-range elements (Minecraft allows -16..32)."""
    problems = []
    for name, t in templates.items():
        for b in t['boxes']:
            for v in b.frm + b.to:
                if v < -16 or v > 32:
                    problems.append(f'template {name}: element outside -16..32 ({b.frm} -> {b.to})')
                    break
    for b in blocks:
        if b.kind in ('door', 'pane'):
            continue
        for key, (tpl, texs) in b.models.items():
            if tpl.startswith('minecraft:'):
                continue
            missing = template_vars(templates[tpl]['boxes']) - set(texs)
            if missing:
                problems.append(f'{b.id}[{key}] ({tpl}) missing texture variables {sorted(missing)}')
        if b.item:
            tpl, texs, _ = b.item
            missing = template_vars(templates[tpl]['boxes']) - set(texs)
            if missing:
                problems.append(f'{b.id} item ({tpl}) missing texture variables {sorted(missing)}')
    return problems


# ----------------------------------------------------------------------------- main
def main() -> None:
    templates, blocks = catalog.build()
    ids = [b.id for b in blocks]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f'duplicate block ids: {sorted(dupes)}')

    for sub in ('blockstates', 'models', 'items', 'textures'):
        shutil.rmtree(os.path.join(ASSETS, sub), ignore_errors=True)
    shutil.rmtree(os.path.join(DATA, NS, 'loot_table', 'blocks'), ignore_errors=True)

    # textures
    tex = textures.build_all()
    for key, (t, meta, folder) in tex.items():
        path = os.path.join(ASSETS, 'textures', f'{key}.png')
        t.save(path)
        if meta:
            write_json(path + '.mcmeta', meta)

    # verify every referenced texture exists
    available = {f'{NS}:{k}' for k in tex}
    missing = set()
    for b in blocks:
        for key, (tpl, texs) in b.models.items():
            for v in texs.values():
                ref = tex_ref(v)
                if ref.startswith(f'{NS}:') and ref not in available:
                    missing.add((b.id, ref))
        if b.item:
            for v in b.item[1].values():
                ref = tex_ref(v)
                if ref.startswith(f'{NS}:') and ref not in available:
                    missing.add((b.id, ref))
    if missing:
        raise SystemExit('missing textures:\n' + '\n'.join(f'  {a}: {r}' for a, r in sorted(missing)))

    problems = check_models(templates, blocks)
    if problems:
        raise SystemExit('model problems:\n' + '\n'.join('  ' + x for x in problems))
    write_models(templates, blocks)
    for b in blocks:
        write_json(os.path.join(ASSETS, 'blockstates', f'{b.id}.json'), blockstate(b))
        model = item_model(b, templates)
        write_json(os.path.join(ASSETS, 'items', f'{b.id}.json'), {'model': {'type': 'minecraft:model', 'model': model}})

    shapes = collect_shapes(templates, blocks)
    write_data(blocks, shapes)

    import items as item_defs  # noqa: E402  (non-block items: keys, blueprints, food)
    lang_map = lang(blocks)
    item_defs.write(ASSETS, lang_map, write_json)
    lang_map.update(item_defs.EXTRA_LANG)
    write_json(os.path.join(ASSETS, 'lang', 'en_us.json'), dict(sorted(lang_map.items())))

    # summary for the Java sync check
    write_json(os.path.join(HERE, 'block_index.json'),
               {b.id: {'kind': b.kind, 'render': b.render, 'group': b.group} for b in blocks})
    print(f'{len(blocks)} blocks, {len(tex)} textures, {len(shapes["templates"])} collision templates')


if __name__ == '__main__':
    main()
