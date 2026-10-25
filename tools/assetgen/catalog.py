"""Every block of the mod: templates (geometry) and block definitions (variants, kinds, names).

The Java side registers the same block ids with matching block classes; a game test verifies the
two stay in sync (every registered block must have a blockstate, item model, loot table and name).
"""
from __future__ import annotations

from model import (LONG_ITEM_DISPLAY, TALL_ITEM_DISPLAY, WIDE_ITEM_DISPLAY, Box, box)

NS = 'modernapartments'

TEMPLATES: dict[str, dict] = {}
BLOCKS: list['BlockDef'] = []

# Tabletop items get a `drop` state (0..12 px) so they sit exactly on lower furniture tops.
TABLETOP = {
    'table_lamp_ceramic', 'table_lamp_brass', 'table_lamp_black', 'laptop', 'desktop_monitor', 'book_stack', 'vase',
    'candle_set', 'fruit_bowl', 'toaster', 'kitchen_utensils', 'coffee_maker', 'espresso_machine', 'microwave',
    'succulent_pot', 'flower_vase', 'toiletries', 'towel_stack', 'game_console', 'speaker', 'wifi_router',
    'concierge_bell', 'treat_jar', 'printer',
}
DROPS = tuple(range(0, 13))


def template(name: str, boxes: list, display=None, ao=True, collision=None, item_boxes=None):
    TEMPLATES[name] = {'boxes': boxes, 'display': display, 'ao': ao, 'collision': collision,
                       'item_boxes': item_boxes}
    return name


class BlockDef:
    """kind decides blockstate layout & Java class; models maps state-key -> (template, textures)."""

    def __init__(self, id, name, kind, models, render='solid', item=None, particle=None, tags=(), group='furniture'):
        self.id = id
        self.name = name
        self.kind = kind
        self.models = models
        self.render = render
        self.item = item  # optional (template, textures, display) for the item model
        self.particle = particle
        self.tags = tuple(tags)
        self.group = group


def add(*args, **kw) -> BlockDef:
    b = BlockDef(*args, **kw)
    BLOCKS.append(b)
    return b


def T(name: str) -> str:
    """Texture reference helper: bare names live in our namespace."""
    return name if ':' in name else f'{NS}:block/{name}'


# =============================================================================== templates
def legs4(x1, z1, x2, z2, h, tex='leg', w=1.0):
    return [box(x1, 0, z1, x1 + w, h, z1 + w, tex, collide=False),
            box(x2 - w, 0, z1, x2, h, z1 + w, tex, collide=False),
            box(x1, 0, z2 - w, x1 + w, h, z2, tex, collide=False),
            box(x2 - w, 0, z2 - w, x2, h, z2, tex, collide=False)]


def sofa_templates():
    base = legs4(1, 2, 15, 15, 2) + [box(0, 2, 1, 16, 5, 16, 'fabric')]
    back = [box(0, 5, 13, 16, 13, 16, 'fabric')]
    arm_l = box(0, 5, 1, 2.5, 11, 16, 'fabric')
    arm_r = box(13.5, 5, 1, 16, 11, 16, 'fabric')

    def seat(x1, x2):
        return [box(x1, 5, 1, x2, 8, 12.5, 'fabric'), box(x1 + 0.25, 8, 10.5, x2 - 0.25, 14, 13, 'fabric')]

    pillow_l = box(3, 8, 8.5, 7, 12, 10.5, 'pillow', collide=False)
    pillow_r = box(9, 8, 8.5, 13, 12, 10.5, 'pillow', collide=False)
    template('sofa_single', base + back + [arm_l, arm_r] + seat(2.5, 13.5) + [pillow_l])
    template('sofa_left', base + back + [arm_l] + seat(2.5, 16) + [pillow_l])
    template('sofa_right', base + back + [arm_r] + seat(0, 13.5) + [pillow_r])
    template('sofa_middle', base + back + seat(0, 16))
    corner_l = base + back + [
        box(0, 5, 0, 3, 13, 13, 'fabric'),
        box(3, 5, 0, 16, 8, 12.5, 'fabric'),
        box(3.25, 8, 10.5, 16, 14, 13, 'fabric'),
        box(3, 8, 0, 5.5, 14, 10.5, 'fabric'),
        box(4, 8, 8, 8, 12, 10, 'pillow', collide=False),
    ]
    template('sofa_corner_left', corner_l)
    template('sofa_corner_right', [b.mirrored_x() for b in corner_l])


def seating_templates():
    template('armchair', legs4(2, 2, 14, 14, 2) + [
        box(1, 2, 2, 15, 5, 15, 'fabric'),
        box(3.5, 5, 2, 12.5, 8, 12, 'fabric'),
        box(1, 5, 12, 15, 15, 15, 'fabric'),
        box(1, 5, 2, 3.5, 11, 15, 'fabric'),
        box(12.5, 5, 2, 15, 11, 15, 'fabric'),
        box(5, 8, 9.5, 11, 13, 11.5, 'pillow', collide=False),
    ])
    template('lounge_chair', [
        box(7, 0, 7, 9, 4, 9, 'leg', collide=False),
        box(3, 0, 7.5, 13, 1, 8.5, 'leg', collide=False),
        box(7.5, 0, 3, 8.5, 1, 13, 'leg', collide=False),
        box(2, 4, 2, 14, 6, 13, 'frame'),
        box(3, 6, 2.5, 13, 7.5, 12, 'seat'),
        box(2, 6, 11, 14, 17, 13, 'frame', rot={'origin': [8, 6, 12], 'axis': 'x', 'angle': 22.5}),
        box(3, 7, 9.8, 13, 16, 11, 'seat', rot={'origin': [8, 6, 12], 'axis': 'x', 'angle': 22.5}),
        box(1.5, 6, 4, 3, 10, 12, 'seat'),
        box(13, 6, 4, 14.5, 10, 12, 'seat'),
    ], collision=[[2, 0, 2, 14, 8, 13], [2, 8, 11, 14, 15, 14]])
    template('dining_chair', legs4(2.5, 2.5, 13.5, 13.5, 8, tex='frame', w=1.2) + [
        box(2, 8, 2, 14, 9.5, 14, 'seat'),
        box(2.5, 9.5, 12.5, 3.7, 18, 13.7, 'frame'),
        box(12.3, 9.5, 12.5, 13.5, 18, 13.7, 'frame'),
        box(2.5, 13, 12.6, 13.5, 18.5, 13.6, 'frame'),
    ], collision=[[2, 0, 2, 14, 9.5, 14], [2.5, 9.5, 12.5, 13.5, 16, 13.7]])
    template('bar_stool', [
        box(4, 0, 4, 5, 11, 5, 'frame', collide=False), box(11, 0, 4, 12, 11, 5, 'frame', collide=False),
        box(4, 0, 11, 5, 11, 12, 'frame', collide=False), box(11, 0, 11, 12, 11, 12, 'frame', collide=False),
        box(5, 4, 4.2, 11, 4.6, 4.8, 'frame', collide=False), box(5, 4, 11.2, 11, 4.6, 11.8, 'frame', collide=False),
        box(4.2, 4, 5, 4.8, 4.6, 11, 'frame', collide=False), box(11.2, 4, 5, 11.8, 4.6, 11, 'frame', collide=False),
        box(3.5, 11, 3.5, 12.5, 12.5, 12.5, 'seat'),
        box(4, 12.5, 11.5, 12, 16, 12.5, 'seat'),
    ], collision=[[3.5, 0, 3.5, 12.5, 12.5, 12.5], [4, 12.5, 11.5, 12, 16, 12.5]])
    template('office_chair', [
        box(2, 0, 7.5, 14, 1, 8.5, 'frame', collide=False), box(7.5, 0, 2, 8.5, 1, 14, 'frame', collide=False),
        box(7, 1, 7, 9, 7, 9, 'leg', collide=False),
        box(3, 7, 3, 13, 9, 13, 'seat'),
        box(3.5, 9, 12, 12.5, 19, 13.5, 'back', collide=False),
        box(4, 9, 12.5, 12, 18.5, 13.2, 'frame', collide=False),
        box(2.5, 9, 6, 3.5, 12, 11, 'frame', collide=False),
        box(12.5, 9, 6, 13.5, 12, 11, 'frame', collide=False),
    ], collision=[[3, 0, 3, 13, 9, 13], [3.5, 9, 12, 12.5, 16, 13.5]])
    template('bench', [
        box(0.5, 0, 3, 1.5, 7, 13, 'leg', collide=False), box(14.5, 0, 3, 15.5, 7, 13, 'leg', collide=False),
        box(0, 7, 3, 16, 8, 6, 'frame'), box(0, 7, 6.5, 16, 8, 9.5, 'frame'), box(0, 7, 10, 16, 8, 13, 'frame'),
        box(0.5, 7, 12.5, 1.5, 16, 13.5, 'leg'), box(14.5, 7, 12.5, 15.5, 16, 13.5, 'leg'),
        box(0, 10, 12.6, 16, 12, 13.4, 'frame'), box(0, 13, 12.6, 16, 15, 13.4, 'frame'),
    ], collision=[[0, 0, 3, 16, 8, 13], [0, 8, 12.5, 16, 15, 13.5]])
    template('lobby_bench', [
        box(1, 0, 3, 3, 6, 13, 'leg', collide=False), box(13, 0, 3, 15, 6, 13, 'leg', collide=False),
        box(0, 6, 3, 16, 8.5, 13, 'seat'),
    ])
    template('adirondack_chair', [
        box(1, 0, 1, 2.5, 9, 3, 'frame', collide=False), box(13.5, 0, 1, 15, 9, 3, 'frame', collide=False),
        box(1, 0, 11, 2.5, 6, 13, 'frame', collide=False), box(13.5, 0, 11, 15, 6, 13, 'frame', collide=False),
        box(2.5, 4, 1, 13.5, 5.5, 12, 'frame', rot={'origin': [8, 5, 6], 'axis': 'x', 'angle': 22.5}),
        box(2.5, 5, 11, 13.5, 18, 12.5, 'frame', rot={'origin': [8, 5, 12], 'axis': 'x', 'angle': 22.5}),
        box(0.5, 9, 1, 3, 10, 11, 'frame'), box(13, 9, 1, 15.5, 10, 11, 'frame'),
    ], collision=[[1, 0, 1, 15, 7, 13], [2, 7, 11, 14, 15, 14]])
    template('bean_bag', [
        box(2, 0, 2, 14, 5, 14, 'fabric'),
        box(2.5, 5, 9, 13.5, 11, 14, 'fabric'),
        box(1.5, 1, 1.5, 14.5, 4, 14.5, 'fabric', collide=False),
    ])
    template('toilet', [
        box(5, 0, 3, 11, 6, 11, 'ceramic'),
        box(4, 6, 2, 12, 7.5, 11, 'ceramic'),
        box(4.2, 7.5, 2.2, 11.8, 8, 10.8, 'seat'),
        box(3.5, 6, 11, 12.5, 15, 15, 'ceramic'),
        box(3.3, 15, 10.8, 12.7, 15.7, 15.2, 'ceramic'),
        box(11, 13, 10.4, 12.5, 13.6, 11, 'metal', collide=False),
    ], collision=[[4, 0, 2, 12, 8, 11], [3.5, 0, 11, 12.5, 15.7, 15.2]])
    template('exercise_bike', [
        box(6, 0, 2, 10, 1, 14, 'frame'),
        box(7, 1, 9, 9, 9, 11, 'frame'),
        box(5.5, 9, 8, 10.5, 10.5, 13, 'seat'),
        box(7, 1, 2, 9, 12, 4, 'frame'),
        box(4, 12, 2, 12, 13, 3, 'frame'),
        box(7, 1, 4, 9, 7, 8, 'metal'),
        box(6, 12, 3, 10, 15, 4, 'frame', faces={'south': 'console'}),
    ], collision=[[5, 0, 2, 11, 10.5, 14]])
    template('weight_bench', [
        box(5, 0, 1, 11, 1, 15, 'frame', collide=False),
        box(7, 1, 3, 9, 6, 5, 'frame', collide=False), box(7, 1, 11, 9, 6, 13, 'frame', collide=False),
        box(5, 6, 0, 11, 8, 16, 'seat'),
        box(1, 0, 13, 2, 15, 14, 'frame'), box(14, 0, 13, 15, 15, 14, 'frame'),
        box(-6, 15, 13, 22, 15.8, 13.8, 'metal', collide=False),
        box(-5, 12, 12, -3, 19, 15, 'plate', collide=False), box(19, 12, 12, 21, 19, 15, 'plate', collide=False),
    ], collision=[[5, 0, 0, 11, 8, 16], [1, 0, 13, 15, 15, 14]])
    template('lounger_head', [
        box(1, 0, 1, 2, 4, 2, 'frame', collide=False), box(14, 0, 1, 15, 4, 2, 'frame', collide=False),
        box(1, 3, 0, 15, 4, 16, 'frame'),
        box(1.5, 4, 8, 14.5, 6, 16, 'cushion'),
        box(1.5, 4, 0, 14.5, 6, 9, 'cushion', rot={'origin': [8, 4, 9], 'axis': 'x', 'angle': 22.5}),
    ], collision=[[1, 0, 0, 15, 6, 16]])
    template('lounger_foot', [
        box(1, 0, 14, 2, 4, 15, 'frame', collide=False), box(14, 0, 14, 15, 4, 15, 'frame', collide=False),
        box(1, 3, 0, 15, 4, 16, 'frame'),
        box(1.5, 4, 0, 14.5, 6, 15.5, 'cushion'),
    ])


def table_templates():
    template('coffee_table', legs4(1, 3, 15, 13, 6) + [
        box(0, 6, 2, 16, 7.5, 14, 'top'),
        box(1, 2, 3, 15, 2.8, 13, 'top', collide=False),
    ])
    template('glass_coffee_table', [
        box(1, 0, 3, 2, 6, 4, 'leg', collide=False), box(14, 0, 3, 15, 6, 4, 'leg', collide=False),
        box(1, 0, 12, 2, 6, 13, 'leg', collide=False), box(14, 0, 12, 15, 6, 13, 'leg', collide=False),
        box(1, 5, 3, 15, 6, 4, 'leg', collide=False), box(1, 5, 12, 15, 6, 13, 'leg', collide=False),
        box(0, 6, 2, 16, 7, 14, 'top'),
    ])
    template('side_table', [
        box(5, 0, 5, 11, 1, 11, 'leg', collide=False),
        box(7, 1, 7, 9, 9, 9, 'leg', collide=False),
        box(3, 9, 3, 13, 10, 13, 'top'),
    ], collision=[[3, 0, 3, 13, 10, 13]])
    template('media_console', legs4(1, 5, 15, 14, 2) + [
        box(0, 2, 4, 16, 8, 15, 'side', faces={'north': 'front'}),
        box(0, 8, 3.5, 16, 9, 15.5, 'top'),
    ])
    template('nightstand', [
        box(2, 0, 3, 14, 9, 15, 'side', faces={'north': 'front'}),
        box(1.5, 9, 2.5, 14.5, 10, 15.5, 'top'),
    ])
    template('dresser', legs4(1, 4, 15, 14, 1) + [
        box(0, 1, 3, 16, 13, 15, 'side', faces={'north': 'front'}),
        box(0, 13, 2.5, 16, 14, 15.5, 'top'),
    ])
    template('desk', [
        box(0, 12, 1, 16, 13.5, 16, 'top'),
        box(0.5, 0, 2, 2, 12, 15, 'leg'),
        box(10, 0, 2, 15.5, 12, 15, 'leg', faces={'north': 'drawer'}),
        box(2, 5, 14, 10, 12, 15, 'leg', collide=False),
    ], collision=[[0, 12, 1, 16, 13.5, 16], [0.5, 0, 2, 2, 12, 15], [10, 0, 2, 15.5, 12, 15]])
    template('picnic_table', [
        box(0, 12, 3, 16, 13, 13, 'top'),
        box(0, 7, 0, 16, 8, 2.5, 'top'), box(0, 7, 13.5, 16, 8, 16, 'top'),
        box(1, 0, 7, 2.5, 12, 9, 'top', collide=False), box(13.5, 0, 7, 15, 12, 9, 'top', collide=False),
        box(1, 6, 0.5, 2.5, 7, 15.5, 'top', collide=False), box(13.5, 6, 0.5, 15, 7, 15.5, 'top', collide=False),
    ], collision=[[0, 7, 0, 16, 8, 2.5], [0, 7, 13.5, 16, 8, 16], [0, 12, 3, 16, 13, 13], [1, 0, 7, 15, 12, 9]])
    # connecting table (multipart): top + 4 optional legs
    template('table_top', [box(0, 13, 0, 16, 15, 16, 'top')])
    template('table_leg_nw', [box(0.5, 0, 0.5, 2.5, 13, 2.5, 'leg')])
    template('table_leg_ne', [box(13.5, 0, 0.5, 15.5, 13, 2.5, 'leg')])
    template('table_leg_sw', [box(0.5, 0, 13.5, 2.5, 13, 15.5, 'leg')])
    template('table_leg_se', [box(13.5, 0, 13.5, 15.5, 13, 15.5, 'leg')])
    template('table_item', [box(0, 13, 0, 16, 15, 16, 'top')] + legs4(0.5, 0.5, 15.5, 15.5, 13, w=2))


def storage_templates():
    template('wardrobe_lower', [box(0, 0, 2, 16, 16, 16, 'side', faces={'north': 'front_lower'})])
    template('wardrobe_upper', [
        box(0, 0, 2, 16, 15, 16, 'side', faces={'north': 'front_upper'}),
        box(-0.01, 15, 1.5, 16.01, 16, 16, 'side'),
    ], item_boxes=None)
    template('bookcase_lower', [
        box(0, 0, 2, 1, 16, 16, 'frame'), box(15, 0, 2, 16, 16, 16, 'frame'),
        box(1, 0, 15, 15, 16, 16, 'frame'),
        box(1, 0, 2, 15, 1, 15, 'frame'),
        box(1, 1, 3, 15, 16, 15, 'frame', faces={'north': 'books'}, uv={'north': [0, 0, 16, 15]}),
    ], collision=[[0, 0, 2, 16, 16, 16]])
    template('bookcase_upper', [
        box(0, 0, 2, 1, 16, 16, 'frame'), box(15, 0, 2, 16, 16, 16, 'frame'),
        box(1, 0, 15, 15, 16, 16, 'frame'),
        box(0, 15, 2, 16, 16, 16, 'frame'),
        box(1, 0, 3, 15, 15, 15, 'frame', faces={'north': 'books2'}, uv={'north': [0, 1, 16, 16]}),
    ], collision=[[0, 0, 2, 16, 16, 16]])
    template('locker_lower', [box(0, 0, 2, 16, 16, 16, 'side', faces={'north': 'front_lower'})])
    template('locker_upper', [box(0, 0, 2, 16, 16, 16, 'side', faces={'north': 'front_upper'})])
    template('parcel_lower', [box(0, 0, 3, 16, 16, 16, 'side', faces={'north': 'front_lower'})])
    template('parcel_upper', [box(0, 0, 3, 16, 16, 16, 'side', faces={'north': 'front_upper'})])
    template('vending_lower', [box(0, 0, 1, 16, 16, 16, 'side', faces={'north': 'front_lower'})])
    template('vending_upper', [
        box(0, 0, 1, 16, 15, 16, 'side', faces={'north': 'front_upper'}),
        box(-0.2, 15, 0.8, 16.2, 16, 16.2, 'side'),
    ])
    template('fridge_lower', [
        box(0, 0, 1, 16, 16, 16, 'side', faces={'north': 'front_lower'}),
        box(3, 8, 0, 13, 9, 1, 'handle', collide=False),
    ])
    template('fridge_upper', [
        box(0, 0, 1, 16, 16, 16, 'side', faces={'north': 'front_upper'}),
        box(5, 2, 0, 6, 14, 1, 'handle', collide=False),
        box(10, 2, 0, 11, 14, 1, 'handle', collide=False),
    ])
    template('arcade_lower', [
        box(1, 0, 3, 15, 12, 15, 'side', faces={'north': 'front_lower'}),
        box(1, 12, 1, 15, 14, 9, 'side', faces={'up': 'panel'}),
        box(4, 14, 3, 5, 16, 4, 'button', collide=False),
        box(9, 14, 3, 10, 14.6, 4, 'button_b', collide=False),
        box(11, 14, 4, 12, 14.6, 5, 'button_b', collide=False),
        box(1, 14, 9, 15, 16, 15, 'side'),
    ], collision=[[1, 0, 1, 15, 16, 15]])
    template('arcade_upper', [
        box(1, 0, 9, 15, 13, 15, 'side'),
        box(2, 1, 8.6, 14, 11, 9, 'side', faces={'north': 'screen'}, uv={'north': 'full'}),
        box(1, 13, 5, 15, 16, 15, 'side', faces={'north': 'marquee'}, uv={'north': 'full'}),
        box(1, 0, 3, 1.5, 13, 9, 'side'), box(14.5, 0, 3, 15, 13, 9, 'side'),
    ], collision=[[1, 0, 3, 15, 16, 15]])
    template('kitchen_cabinet', [
        box(0, 0, 2.5, 16, 1, 16, 'toe', collide=False),
        box(0, 1, 1, 16, 14, 16, 'side', faces={'north': 'front'}),
        box(0, 14, 0, 16, 16, 16, 'top'),
    ], collision=[[0, 0, 0, 16, 16, 16]])
    template('kitchen_sink', [
        box(0, 0, 2.5, 16, 1, 16, 'toe', collide=False),
        box(0, 1, 1, 16, 11, 16, 'side', faces={'north': 'front'}),
        box(0, 11, 1, 3, 14, 16, 'side', faces={'north': 'front'}),
        box(13, 11, 1, 16, 14, 16, 'side', faces={'north': 'front'}),
        box(3, 11, 1, 13, 14, 3, 'side', faces={'north': 'front'}),
        box(3, 11, 12, 13, 14, 16, 'side'),
        box(0, 14, 0, 16, 16, 3, 'top'), box(0, 14, 12, 16, 16, 16, 'top'),
        box(0, 14, 3, 3, 16, 12, 'top'), box(13, 14, 3, 16, 16, 12, 'top'),
        box(3, 11, 3, 13, 11.01, 12, 'basin', faces={'up': 'basin'}),
        box(7, 16, 13, 9, 17, 15, 'faucet', collide=False),
        box(7.5, 17, 13.5, 8.5, 21, 14.5, 'faucet', collide=False),
        box(7.5, 20, 9.5, 8.5, 21, 14, 'faucet', collide=False),
    ], collision=[[0, 0, 0, 16, 11, 16], [0, 11, 0, 3, 16, 16], [13, 11, 0, 16, 16, 16], [3, 11, 0, 13, 16, 3],
                  [3, 11, 12, 13, 16, 16]])
    template('kitchen_sink_on', TEMPLATES['kitchen_sink']['boxes'] + [
        box(7.7, 11, 10, 8.3, 20, 10.6, 'water', collide=False, shade=False),
        box(3, 11.5, 3, 13, 12, 12, 'water', faces={'up': 'water'}, collide=False, shade=False),
    ], collision=TEMPLATES['kitchen_sink']['collision'])
    template('kitchen_upper', [box(0, 0, 8, 16, 16, 16, 'side', faces={'north': 'front'})])
    template('dishwasher', [
        box(0, 0, 2.5, 16, 1, 16, 'toe', collide=False),
        box(0, 1, 1, 16, 14, 16, 'side', faces={'north': 'front'}),
        box(0, 14, 0, 16, 16, 16, 'top'),
    ], collision=[[0, 0, 0, 16, 16, 16]])
    template('oven_range', [
        box(0, 0, 1, 16, 15, 16, 'side', faces={'north': 'front'}),
        box(0, 15, 1, 16, 16, 16, 'side', faces={'up': 'cooktop'}),
        box(0, 16, 14.5, 16, 18, 16, 'side', collide=False),
        box(1, 11, 0, 15, 11.8, 1, 'handle', collide=False),
    ], collision=[[0, 0, 0, 16, 16, 16]])
    template('vanity', [
        box(0, 0, 4, 16, 12, 16, 'side', faces={'north': 'front'}),
        box(0, 12, 3, 16, 13, 16, 'top'),
        box(4, 13, 5.5, 12, 16, 12.5, 'ceramic'),
        box(5, 15.99, 6.5, 11, 16, 11.5, 'basin', faces={'up': 'basin'}, collide=False),
        box(7.5, 13, 13.5, 8.5, 19, 14.5, 'faucet', collide=False),
        box(7.5, 18, 10, 8.5, 19, 14, 'faucet', collide=False),
    ], collision=[[0, 0, 3, 16, 13, 16], [4, 13, 5.5, 12, 16, 12.5]])
    template('mailbox_bank', [box(0, 0, 10, 16, 16, 16, 'side', faces={'north': 'front'})])
    template('medicine_cabinet', [box(3, 2, 12, 13, 14, 16, 'side', faces={'north': 'front'})])
    template('wall_shelf', [
        box(0, 7, 9, 16, 8, 16, 'frame'),
        box(1, 8, 11, 5, 13, 15, 'books', faces={'north': 'books'}, collide=False),
        box(10, 8, 11, 13, 11, 14, 'pot', collide=False),
        box(10.5, 11, 12.5, 12.5, 15, 12.5, 'plant', faces={'north': 'plant', 'south': 'plant'},
            skip=('east', 'west', 'up', 'down'), collide=False),
    ], collision=[[0, 7, 9, 16, 8, 16]])
    template('package_shelf', [
        box(0, 0, 3, 1, 16, 16, 'frame'), box(15, 0, 3, 16, 16, 16, 'frame'),
        box(1, 0, 3, 15, 1, 16, 'frame'), box(1, 7.5, 3, 15, 8.5, 16, 'frame'), box(1, 15, 3, 15, 16, 16, 'frame'),
        box(2, 1, 5, 7, 5, 14, 'box', collide=False), box(8, 1, 4, 14, 7, 15, 'box', collide=False),
        box(3, 8.5, 6, 10, 12, 14, 'box', collide=False), box(10.5, 8.5, 5, 14, 11, 12, 'box', collide=False),
    ], collision=[[0, 0, 3, 16, 16, 16]])
    template('laundry_basket', [
        box(3, 0, 3, 13, 8, 13, 'basket'),
        box(3.5, 7, 3.5, 12.5, 9, 12.5, 'clothes', collide=False),
    ])
    template('trash_bin', [
        box(3, 0, 3, 13, 13, 13, 'side', faces={'north': 'front'}),
        box(2.5, 13, 2.5, 13.5, 14.5, 13.5, 'side'),
    ])


def appliance_templates():
    template('cube_front', [box(0, 0, 0, 16, 16, 16, 'side', faces={'north': 'front', 'up': 'top'})])
    template('cube_front_inset', [box(0, 0, 1, 16, 16, 16, 'side', faces={'north': 'front', 'up': 'top'})],
             collision=[[0, 0, 0, 16, 16, 16]])
    template('microwave', [
        box(2, 0, 4, 14, 1, 14, 'side', collide=False),
        box(2, 0.5, 4, 14, 7.5, 14, 'side', faces={'north': 'front'}),
    ])
    template('coffee_maker', [
        box(4, 0, 5, 12, 1, 13, 'side'),
        box(4, 0, 9, 12, 10, 13, 'side', faces={'north': 'side'}),
        box(4, 7, 5, 12, 10, 9, 'side'),
        box(5.5, 1, 5.5, 10.5, 6, 8.5, 'glass', collide=False),
        box(5.5, 1.2, 5.7, 10.5, 4, 8.3, 'coffee', collide=False),
    ], collision=[[4, 0, 5, 12, 10, 13]])
    template('espresso_machine', [
        box(2, 0, 4, 14, 9, 14, 'side', faces={'north': 'front'}),
        box(2, 9, 4, 14, 10, 14, 'metal'),
        box(6, 5, 2, 10, 6, 4, 'metal', collide=False),
        box(6.5, 0.5, 2.5, 9.5, 3, 4.5, 'cup', collide=False),
    ], collision=[[2, 0, 4, 14, 10, 14]])
    template('toaster', [box(4, 0, 6, 12, 6, 11, 'side'), box(5, 6, 7, 11, 6.2, 8, 'slot', collide=False),
                         box(5, 6, 9, 11, 6.2, 10, 'slot', collide=False)])
    template('range_hood', [
        box(1, 0, 6, 15, 5, 16, 'side', faces={'north': 'front'}),
        box(5, 5, 11, 11, 16, 16, 'side'),
    ])
    template('washer', [box(0, 0, 1, 16, 16, 16, 'side', faces={'north': 'front'})],
             collision=[[0, 0, 0, 16, 16, 16]])
    template('water_cooler', [
        box(4, 0, 4, 12, 14, 12, 'side', faces={'north': 'front'}),
        box(5, 14, 5, 11, 24, 11, 'bottle'),
    ], collision=[[4, 0, 4, 12, 16, 12]])
    template('printer', [box(2, 0, 3, 14, 7, 13, 'side', faces={'north': 'front'}),
                         box(4, 7, 5, 12, 7.5, 12, 'paper', collide=False)])
    template('mini_fridge', [box(2, 0, 3, 14, 14, 15, 'side', faces={'north': 'front'}),
                             box(11, 4, 2, 12, 11, 3, 'handle', collide=False)])
    template('treadmill_head', [
        box(0, 0, 4, 16, 3, 16, 'side', faces={'up': 'belt'}),
        box(1, 3, 6, 2, 14, 8, 'frame'), box(14, 3, 6, 15, 14, 8, 'frame'),
        box(1, 12, 5, 15, 16, 9, 'frame', faces={'south': 'console'}),
    ], collision=[[0, 0, 4, 16, 3, 16], [1, 3, 5, 15, 16, 9]])
    template('treadmill_foot', [
        box(0, 0, 0, 16, 3, 15, 'side', faces={'up': 'belt'}),
        box(0, 0.5, 15, 16, 2.5, 16, 'frame', collide=False),
    ])
    template('dumbbell_rack', [
        box(1, 0, 4, 2, 9, 12, 'frame'), box(14, 0, 4, 15, 9, 12, 'frame'),
        box(1, 4, 4, 15, 5, 12, 'frame', rot={'origin': [8, 4.5, 8], 'axis': 'x', 'angle': -22.5}),
        box(1, 8, 5, 15, 9, 12, 'frame', rot={'origin': [8, 8.5, 8], 'axis': 'x', 'angle': -22.5}),
    ] + [box(x, 9, 6.5, x + 2.4, 11, 9.5, 'weight', collide=False) for x in (2, 5, 8, 11.5)] +
             [box(x, 5, 5.5, x + 2.4, 7, 8.5, 'weight', collide=False) for x in (2.5, 6, 9.5, 12)],
             collision=[[1, 0, 4, 15, 11, 12]])
    template('kettlebells', [
        box(2, 0, 5, 6, 4, 9, 'weight'), box(3, 4, 6.5, 5, 6, 7.5, 'weight'),
        box(8, 0, 6, 13, 5, 11, 'weight'), box(9.5, 5, 8, 11.5, 7, 9, 'weight'),
    ], collision=[[2, 0, 5, 13, 7, 11]])
    template('punching_bag', [
        box(7.5, 13, 7.5, 8.5, 16, 8.5, 'chain', collide=False),
        box(5, -14, 5, 11, 13, 11, 'bag'),
    ], collision=[[5, 0, 5, 11, 13, 11]])
    template('squat_rack_lower', [
        box(1, 0, 3, 2.5, 16, 4.5, 'frame'), box(13.5, 0, 3, 15, 16, 4.5, 'frame'),
        box(1, 0, 11.5, 2.5, 16, 13, 'frame'), box(13.5, 0, 11.5, 15, 16, 13, 'frame'),
        box(0, 0, 2, 16, 1, 14, 'frame', collide=False),
    ])
    template('squat_rack_upper', [
        box(1, 0, 3, 2.5, 14, 4.5, 'frame'), box(13.5, 0, 3, 15, 14, 4.5, 'frame'),
        box(1, 0, 11.5, 2.5, 14, 13, 'frame'), box(13.5, 0, 11.5, 15, 14, 13, 'frame'),
        box(1, 13, 3, 15, 14, 13, 'frame'),
        box(-6, 4, 7.5, 22, 4.8, 8.3, 'metal', collide=False),
        box(-5, 1, 6.5, -3, 8, 9.5, 'weight', collide=False), box(19, 1, 6.5, 21, 8, 9.5, 'weight', collide=False),
    ])
    template('dog_wash_tub', legs4(0.5, 0.5, 15.5, 15.5, 8, w=1.5) + [
        box(0, 8, 0, 16, 9, 16, 'metal'),
        box(0, 9, 0, 16, 15, 1.5, 'metal'), box(0, 9, 14.5, 16, 15, 16, 'metal'),
        box(0, 9, 1.5, 1.5, 15, 14.5, 'metal'), box(14.5, 9, 1.5, 16, 15, 14.5, 'metal'),
        box(0, 15, 14, 16, 22, 16, 'metal'),
        box(7, 9, 7, 9, 9.1, 9, 'drain', collide=False),
    ], collision=[[0, 0, 0, 16, 15, 16]])
    template('dog_ramp', [
        box(0, 0, 0, 16, 2, 16, 'ramp'), box(0, 2, 4, 16, 4, 16, 'ramp'),
        box(0, 4, 8, 16, 6, 16, 'ramp'), box(0, 6, 12, 16, 8, 16, 'ramp'),
    ])
    template('grooming_table', legs4(1.5, 3.5, 14.5, 12.5, 10) + [
        box(1, 10, 3, 15, 11, 13, 'top'),
        box(13, 11, 12, 14, 22, 13, 'frame', collide=False),
        box(8, 21, 12, 14, 22, 13, 'frame', collide=False),
    ])
    template('bbq_grill', [
        box(1, 0, 3, 15, 9, 13, 'side', faces={'north': 'side'}),
        box(2, 9, 4, 14, 12, 12, 'side', faces={'up': 'grate'}),
        box(2, 12, 11, 14, 18, 12, 'side', collide=False),
        box(-2, 8, 5, 1, 9, 11, 'side', collide=False), box(15, 8, 5, 18, 9, 11, 'side', collide=False),
    ], collision=[[1, 0, 3, 15, 12, 13]])
    template('patio_heater', [
        box(4, 0, 4, 12, 2, 12, 'frame'), box(7, 2, 7, 9, 16, 9, 'frame'),
    ], collision=[[4, 0, 4, 12, 16, 12]])
    template('patio_heater_top', [
        box(7, 0, 7, 9, 6, 9, 'frame'),
        box(5.5, 6, 5.5, 10.5, 9, 10.5, 'flame', shade=False),
        box(1, 9, 1, 15, 10, 15, 'frame'),
        box(4, 10, 4, 12, 11, 12, 'frame', collide=False),
    ], collision=[[5, 0, 5, 11, 10, 11]])
    template('outdoor_shower', [
        box(5, 0, 5, 11, 0.5, 11, 'frame'), box(7.5, 0.5, 13, 8.5, 16, 14, 'metal'),
    ], collision=[[7, 0, 12.5, 9, 16, 14.5]])
    template('outdoor_shower_top', [
        box(7.5, 0, 13, 8.5, 12, 14, 'metal'), box(7.5, 11, 8, 8.5, 12, 14, 'metal'),
        box(6, 9.5, 6.5, 10, 11, 10.5, 'metal'),
    ], collision=[[7, 0, 12.5, 9, 12, 14.5]])


def light_templates():
    template('floor_lamp', [
        box(5, 0, 5, 11, 1, 11, 'metal'),
        box(7.5, 1, 7.5, 8.5, 22, 8.5, 'metal'),
        box(4, 21, 4, 12, 29, 12, 'shade', shade=False),
    ], collision=[[5, 0, 5, 11, 16, 11]])
    template('table_lamp', [
        box(6, 0, 6, 10, 1, 10, 'base'),
        box(6.5, 1, 6.5, 9.5, 6, 9.5, 'base'),
        box(4.5, 6, 4.5, 11.5, 11, 11.5, 'shade', shade=False),
    ], collision=[[4.5, 0, 4.5, 11.5, 11, 11.5]])
    template('pendant_light', [
        box(7.75, 9, 7.75, 8.25, 16, 8.25, 'metal', collide=False),
        box(5, 5, 5, 11, 9, 11, 'metal', faces={'down': 'light'}),
        box(6.5, 9, 6.5, 9.5, 9.5, 9.5, 'metal'),
    ], collision=[[5, 5, 5, 11, 16, 11]])
    template('chandelier', [
        box(7.5, 9, 7.5, 8.5, 16, 8.5, 'metal', collide=False),
        box(6, 6, 6, 10, 9, 10, 'metal'),
        box(1.5, 6.5, 7.5, 14.5, 7.3, 8.5, 'metal'),
        box(7.5, 6.5, 1.5, 8.5, 7.3, 14.5, 'metal'),
        box(1, 7.3, 7, 3, 10, 9, 'light', shade=False), box(13, 7.3, 7, 15, 10, 9, 'light', shade=False),
        box(7, 7.3, 1, 9, 10, 3, 'light', shade=False), box(7, 7.3, 13, 9, 10, 15, 'light', shade=False),
        box(6.5, 4, 6.5, 9.5, 6, 9.5, 'light', shade=False),
    ], collision=[[1, 4, 1, 15, 16, 15]])
    template('ceiling_fan', [
        box(6, 13, 6, 10, 16, 10, 'metal'),
        box(0, 12.5, 6.5, 16, 13, 9.5, 'blade'),
        box(6.5, 12.5, 0, 9.5, 13, 16, 'blade'),
        box(6.5, 11.5, 6.5, 9.5, 12.5, 9.5, 'light', shade=False),
    ], collision=[[0, 11.5, 0, 16, 16, 16]])
    template('electric_fireplace', [
        box(-6, 2, 11, 22, 11, 16, 'frame'),
        box(-5, 3, 10.9, 21, 9, 11, 'flames', faces={'north': 'flames'}, skip=('south',), uv={'north': 'full'}, shade=False),
        box(-6, 11, 10, 22, 12, 16, 'top', collide=False),
    ], collision=[[0, 2, 10, 16, 12, 16]])
    template('wall_sconce', [
        box(6.5, 5, 15, 9.5, 12, 16, 'metal'),
        box(7.5, 8, 12, 8.5, 9, 15, 'metal'),
        box(5.5, 8, 9.5, 10.5, 13, 14.5, 'shade', shade=False),
    ], collision=[[5.5, 5, 9.5, 10.5, 13, 16]])
    template('garage_light', [
        box(1, 14, 5, 15, 16, 11, 'metal'),
        box(1.5, 13.4, 6, 14.5, 14, 10, 'light', shade=False),
    ], collision=[[1, 13.4, 5, 15, 16, 11]])
    template('string_lights', [
        box(0, 14, 7.75, 16, 14.5, 8.25, 'cord'),
    ] + [box(x, 12, 7.25, x + 1.5, 14, 8.75, 'light', shade=False) for x in (1.25, 5.25, 9.25, 13.25)],
             collision=[[0, 12, 7, 16, 14.5, 9]])
    template('lamp_post', [box(6.5, 0, 6.5, 9.5, 16, 9.5, 'metal')])
    template('ceiling_layer', [box(0, 15, 0, 16, 16, 16, 'side', faces={'down': 'face'}, uv={'down': 'full'})])
    template('lamp_head', [
        box(6.5, 0, 6.5, 9.5, 4, 9.5, 'metal'),
        box(3, 4, 3, 13, 7, 13, 'metal', faces={'down': 'light'}),
        box(3.5, 3.6, 3.5, 12.5, 4, 12.5, 'light', shade=False),
        box(4, 7, 4, 12, 8, 12, 'metal'),
    ], collision=[[3, 0, 3, 13, 8, 13]])
    template('bollard_light', [
        box(5, 0, 5, 11, 10, 11, 'metal'),
        box(5.5, 10, 5.5, 10.5, 12, 10.5, 'light', shade=False),
        box(5, 12, 5, 11, 13, 11, 'metal'),
    ])


def decor_templates():
    def cross(y1, y2, tex='plant', inset=0.8):
        return [
            box(inset, y1, 8, 16 - inset, y2, 8, tex, faces={'north': tex, 'south': tex},
                skip=('east', 'west', 'up', 'down'), uv={'north': 'full', 'south': 'full'},
                rot={'origin': [8, 8, 8], 'axis': 'y', 'angle': 45, 'rescale': True}, collide=False, shade=False),
            box(8, y1, inset, 8, y2, 16 - inset, tex, faces={'east': tex, 'west': tex},
                skip=('north', 'south', 'up', 'down'), uv={'east': 'full', 'west': 'full'},
                rot={'origin': [8, 8, 8], 'axis': 'y', 'angle': 45, 'rescale': True}, collide=False, shade=False),
        ]

    pot = [box(5, 0, 5, 11, 6, 11, 'pot'), box(5.5, 5.5, 5.5, 10.5, 5.8, 10.5, 'soil', collide=False)]
    template('potted_plant', pot + cross(5, 19), collision=[[4, 0, 4, 12, 14, 12]])
    template('potted_plant_tall', [box(4, 0, 4, 12, 8, 12, 'pot'),
                                   box(4.5, 7.5, 4.5, 11.5, 7.8, 11.5, 'soil', collide=False)] + cross(7, 31),
             collision=[[4, 0, 4, 12, 16, 12]])
    template('table_plant', [box(6, 0, 6, 10, 3, 10, 'pot')] + cross(2.5, 10, inset=3.5),
             collision=[[5, 0, 5, 11, 8, 11]])
    template('planter_box', [
        box(0, 0, 0, 16, 10, 16, 'frame'),
        box(1, 9.6, 1, 15, 9.8, 15, 'soil', collide=False),
    ] + cross(9, 20), collision=[[0, 0, 0, 16, 10, 16]])
    template('flower_vase', [box(6.5, 0, 6.5, 9.5, 6, 9.5, 'vase')] + cross(4, 13, inset=3),
             collision=[[5.5, 0, 5.5, 10.5, 10, 10.5]])
    template('book_stack', [
        box(4, 0, 5, 12, 1.5, 11, 'book_a'), box(4.5, 1.5, 5.5, 11, 2.7, 10.5, 'book_b'),
        box(5, 2.7, 5, 12.5, 4, 11, 'book_c'),
    ])
    template('fruit_bowl', [
        box(4, 0, 4, 12, 2.5, 12, 'bowl'),
        box(5, 2, 5, 8, 4.5, 8, 'fruit_a', collide=False), box(8, 2, 7.5, 11, 4.5, 10.5, 'fruit_b', collide=False),
        box(6, 2, 8.5, 8.5, 4, 11, 'fruit_c', collide=False),
    ])
    template('laptop', [
        box(3, 0, 4, 13, 0.6, 11, 'body'),
        box(3, 0.6, 10.4, 13, 7.6, 11, 'body', faces={'north': 'screen'}, uv={'north': 'full'},
            rot={'origin': [8, 0.6, 10.7], 'axis': 'x', 'angle': 22.5}),
    ], collision=[[3, 0, 4, 13, 1, 11]])
    template('monitor', [
        box(5, 0, 7, 11, 0.5, 11, 'body'),
        box(7.5, 0.5, 9.5, 8.5, 4, 10.5, 'body'),
        box(0, 3, 8.5, 16, 12, 9.5, 'body', faces={'north': 'screen'}, uv={'north': 'full'}),
    ], collision=[[0, 0, 7, 16, 12, 11]])
    template('tv_wall', [
        box(-7, 3, 14, 23, 20, 16, 'body', faces={'north': 'screen'}, uv={'north': 'full'}),
    ], collision=[[0, 3, 14, 16, 16, 16]])
    template('tv_stand', [
        box(3, 0, 6, 13, 0.5, 10, 'body'),
        box(7.5, 0.5, 8.5, 8.5, 4, 9.5, 'body'),
        box(-7, 4, 9, 23, 21, 11, 'body', faces={'north': 'screen'}, uv={'north': 'full'}),
    ], collision=[[0, 0, 6, 16, 16, 11]])
    template('game_console', [
        box(3, 0, 5, 13, 2.5, 12, 'body', faces={'north': 'front'}),
        box(4, 0, 2, 7, 1, 4, 'pad', collide=False), box(9, 0, 2.5, 12, 1, 4.5, 'pad', collide=False),
    ])
    template('speaker', [box(5, 0, 6, 11, 12, 11, 'body', faces={'north': 'front'})])
    template('router', [
        box(4, 0, 6, 12, 2, 11, 'body', faces={'north': 'front'}),
        box(5, 2, 10, 5.6, 7, 10.6, 'body', collide=False), box(10.4, 2, 10, 11, 7, 10.6, 'body', collide=False),
    ])
    template('vase', [box(6, 0, 6, 10, 8, 10, 'vase'), box(6.8, 8, 6.8, 9.2, 10, 9.2, 'vase')])
    template('candle_set', [
        box(4, 0, 4, 12, 0.6, 12, 'tray'),
        box(5, 0.6, 5, 7, 5, 7, 'wax'), box(8.5, 0.6, 6, 10.5, 3.5, 8, 'wax'), box(6, 0.6, 9, 8, 4, 11, 'wax'),
    ])
    template('kitchen_utensils', [
        box(3, 0, 9, 7, 6, 13, 'holder'),
        box(3.8, 6, 10, 4.4, 10, 10.6, 'tool', collide=False), box(5, 6, 11, 5.6, 9, 11.6, 'tool', collide=False),
        box(6, 6, 10, 6.6, 10.5, 10.6, 'tool', collide=False),
        box(8, 0, 5, 14, 0.8, 13, 'board'),
    ])
    template('towel_stack', [
        box(3, 0, 4, 13, 2, 12, 'towel_a'), box(3.5, 2, 4.5, 12.5, 4, 11.5, 'towel_b'),
        box(3, 4, 4, 13, 6, 12, 'towel_a'),
    ])
    template('toiletries', [
        box(3, 0, 8, 5.5, 6, 10.5, 'bottle_a'), box(6.5, 0, 8.5, 8.5, 4, 10.5, 'bottle_b'),
        box(9.5, 0, 8, 12, 5, 10.5, 'bottle_c'), box(9.8, 5, 8.8, 11.6, 6.2, 9.8, 'cap', collide=False),
    ])
    template('clothing_rack', [
        box(0, 15, 7.5, 16, 16, 8.5, 'rod'),
        box(0, 1, 7, 16, 15, 7, 'clothes', faces={'north': 'clothes', 'south': 'clothes'},
            skip=('east', 'west', 'up', 'down'), uv={'north': [0, 1, 16, 15], 'south': [0, 1, 16, 15]},
            collide=False, shade=True),
        box(0, 1, 9, 16, 15, 9, 'clothes', faces={'north': 'clothes', 'south': 'clothes'},
            skip=('east', 'west', 'up', 'down'), uv={'north': [16, 1, 0, 15], 'south': [16, 1, 0, 15]},
            collide=False, shade=True),
    ], collision=[[0, 0, 6, 16, 16, 10]])
    template('shoe_rack', [
        box(0, 0, 9, 16, 1, 15, 'frame'), box(0, 4, 9, 16, 5, 15, 'frame'),
        box(0, 0, 9, 1, 8, 15, 'frame'), box(15, 0, 9, 16, 8, 15, 'frame'),
        box(2, 1, 10, 5, 2.5, 14, 'shoe_a', collide=False), box(6, 1, 10, 9, 2.5, 14, 'shoe_b', collide=False),
        box(11, 5, 10, 14, 6.5, 14, 'shoe_a', collide=False), box(3, 5, 10, 6, 6.5, 14, 'shoe_c', collide=False),
    ], collision=[[0, 0, 9, 16, 8, 15]])
    template('rug_runner', [box(1, 0, 0, 15, 0.5, 16, 'fabric')])
    template('mat', [box(2, 0, 3, 14, 0.5, 13, 'fabric')])
    template('yoga_mat', [box(3, 0, 0, 13, 0.4, 16, 'foam')])
    template('rolled_mat', [box(2, 0, 6, 14, 3, 9, 'foam')])
    template('concierge_bell', [box(6, 0, 6, 10, 0.5, 10, 'metal'), box(6.5, 0.5, 6.5, 9.5, 2.5, 9.5, 'metal'),
                                box(7.5, 2.5, 7.5, 8.5, 3, 8.5, 'metal')])
    template('luggage_cart', [
        box(1, 1, 2, 15, 2, 14, 'base'),
        box(1, 1, 2, 2, 24, 3, 'metal'), box(14, 1, 2, 15, 24, 3, 'metal'),
        box(1, 1, 13, 2, 24, 14, 'metal'), box(14, 1, 13, 15, 24, 14, 'metal'),
        box(1, 23, 2, 15, 24, 14, 'metal', skip=()),
        box(2, 0, 2, 4, 1, 4, 'wheel', collide=False), box(12, 0, 12, 14, 1, 14, 'wheel', collide=False),
        box(3, 2, 4, 9, 9, 12, 'bag', collide=False), box(9.5, 2, 5, 13.5, 7, 11, 'bag2', collide=False),
    ], collision=[[1, 0, 2, 15, 16, 14]])
    template('reception_desk', [
        box(0, 0, 0, 16, 15, 3, 'front'),
        box(0, 15, 0, 16, 16, 6, 'top'),
        box(0, 10, 3, 16, 11, 16, 'top'),
        box(0, 0, 14, 16, 10, 16, 'front', collide=False),
    ], collision=[[0, 0, 0, 16, 16, 6], [0, 0, 6, 16, 11, 16]])
    template('wheel_stop', [box(0, 0, 6, 16, 2, 10, 'concrete'), box(0, 0.01, 6, 3, 2.01, 10, 'paint'),
                            box(13, 0.01, 6, 16, 2.01, 10, 'paint')])
    template('speed_bump', [box(0, 0, 4, 16, 1.5, 12, 'paint')])
    template('bike_rack', [
        box(1, 0, 7.5, 2, 10, 8.5, 'metal'), box(6, 0, 7.5, 7, 10, 8.5, 'metal'), box(1, 9, 7.5, 7, 10, 8.5, 'metal'),
        box(9, 0, 7.5, 10, 10, 8.5, 'metal'), box(14, 0, 7.5, 15, 10, 8.5, 'metal'),
        box(9, 9, 7.5, 15, 10, 8.5, 'metal'),
    ], collision=[[1, 0, 7, 15, 10, 9]])
    template('cornhole', [
        box(1, 0, 13, 2, 7, 14, 'frame', collide=False), box(14, 0, 13, 15, 7, 14, 'frame', collide=False),
        box(1, 2, 0, 15, 3, 16, 'board', faces={'up': 'board'}, uv={'up': 'full'},
            rot={'origin': [8, 2.5, 8], 'axis': 'x', 'angle': -22.5}),
    ], collision=[[1, 0, 0, 15, 6, 16]])
    template('swing_set', [
        box(-8, 0, 2, -7, 30, 3, 'frame', rot={'origin': [-7.5, 0, 2.5], 'axis': 'x', 'angle': 0}),
        box(-8, 0, 13, -7, 30, 14, 'frame'), box(23, 0, 2, 24, 30, 3, 'frame'), box(23, 0, 13, 24, 30, 14, 'frame'),
        box(-8, 29, 7.5, 24, 30.5, 8.5, 'frame'),
        box(-3, 6, 7.75, -2.6, 29, 8.25, 'chain', collide=False), box(3, 6, 7.75, 3.4, 29, 8.25, 'chain', collide=False),
        box(-4, 5, 6.5, 4.5, 6, 9.5, 'seat'),
        box(12.6, 6, 7.75, 13, 29, 8.25, 'chain', collide=False), box(18.6, 6, 7.75, 19, 29, 8.25, 'chain', collide=False),
        box(11.5, 5, 6.5, 20, 6, 9.5, 'seat'),
        box(-8, 0, 3, -7, 1, 13, 'frame', collide=False), box(23, 0, 3, 24, 1, 13, 'frame', collide=False),
    ], collision=[[0, 5, 6.5, 4.5, 6, 9.5], [11.5, 5, 6.5, 16, 6, 9.5]])
    template('slide_top', [
        box(0, 0, 0, 1.5, 16, 1.5, 'post'), box(14.5, 0, 0, 16, 16, 1.5, 'post'),
        box(0, 0, 14.5, 1.5, 16, 16, 'post'), box(14.5, 0, 14.5, 16, 16, 16, 'post'),
        box(0, 14, 0, 16, 16, 16, 'deck'),
        box(2, 14, 14.5, 14, 22, 16, 'post', collide=False),
    ], collision=[[0, 14, 0, 16, 16, 16]])
    template('slide_chute', [
        box(3, 7, -2, 13, 8, 18, 'chute', rot={'origin': [8, 7.5, 8], 'axis': 'x', 'angle': 22.5}),
        box(2, 7, -2, 3, 10, 18, 'chute', rot={'origin': [8, 7.5, 8], 'axis': 'x', 'angle': 22.5}),
        box(13, 7, -2, 14, 10, 18, 'chute', rot={'origin': [8, 7.5, 8], 'axis': 'x', 'angle': 22.5}),
    ], collision=[[2, 0, 0, 14, 10, 16]])
    template('agility_hurdle', [
        box(0, 0, 7, 2, 12, 9, 'post'), box(14, 0, 7, 16, 12, 9, 'post'),
        box(2, 7, 7.5, 14, 8, 8.5, 'bar'),
    ], collision=[[0, 0, 7, 16, 12, 9]])
    template('pet_waste_station', [
        box(7, 0, 12, 9, 16, 14, 'metal'),
        box(4, 11, 11, 12, 16, 15, 'box', faces={'north': 'front'}),
        box(5, 0, 3, 11, 9, 9, 'bin'),
    ], collision=[[4, 0, 3, 12, 16, 15]])
    template('umbrella', [
        box(5, 0, 5, 11, 1, 11, 'metal'),
        box(7.5, 1, 7.5, 8.5, 28, 8.5, 'pole'),
        box(-8, 24, -8, 24, 25, 24, 'canvas', collide=False),
        box(-4, 25, -4, 20, 26, 20, 'canvas', collide=False),
        box(1, 26, 1, 15, 27, 15, 'canvas', collide=False),
        box(7, 27, 7, 9, 29, 9, 'pole', collide=False),
    ], collision=[[5, 0, 5, 11, 16, 11]])
    template('pool_ladder', [
        box(2, -10, 13, 3, 20, 14, 'metal'), box(13, -10, 13, 14, 20, 14, 'metal'),
        box(2, 20, 13, 3, 21, 17, 'metal', collide=False), box(13, 20, 13, 14, 21, 17, 'metal', collide=False),
        box(3, 9, 11.5, 13, 9.6, 15, 'step'), box(3, 1, 11.5, 13, 1.6, 15, 'step'),
        box(3, -7, 11.5, 13, -6.4, 15, 'step', collide=False),
    ], collision=[[2, 0, 11.5, 14, 16, 15]])
    template('lifebuoy', [box(1, 1, 15, 15, 15, 16, 'buoy', faces={'north': 'buoy', 'south': 'buoy'},
                              uv={'north': 'full', 'south': 'full'})])
    template('hot_tub_jet', [box(5, 5, 15, 11, 11, 16, 'metal', faces={'north': 'grille'}, uv={'north': 'full'})])
    template('towel_rack', [
        box(2, 8, 14, 14, 9, 15, 'metal'),
        box(2, 8, 15, 3, 9, 16, 'metal'), box(13, 8, 15, 14, 9, 16, 'metal'),
        box(3, 3, 13.4, 13, 9.2, 14.4, 'towel'),
    ], collision=[[2, 3, 13, 14, 9.5, 16]])
    template('tp_holder', [
        box(5, 6, 15, 11, 7, 16, 'metal'),
        box(6, 3.5, 11, 10, 7.5, 15, 'paper'),
    ], collision=[[5, 3.5, 11, 11, 7.5, 16]])
    template('pet_sprayer', [
        box(6, 4, 15, 10, 12, 16, 'metal'),
        box(7, 6, 13, 9, 11, 15, 'sprayer'),
        box(7.3, 2, 14.5, 7.7, 6, 15, 'hose', collide=False),
    ], collision=[[6, 2, 13, 10, 12, 16]])
    template('shower_head', [
        box(7.5, 10, 13, 8.5, 11, 16, 'metal'),
        box(5.5, 9, 9, 10.5, 10.5, 14, 'metal', faces={'down': 'head'}),
        box(6.5, 3, 15, 9.5, 6, 16, 'metal'),
    ], collision=[[5.5, 3, 9, 10.5, 11, 16]])
    template('paw_station', [
        box(1, 0, 1, 15, 0.5, 15, 'mat'),
        box(9, 0.5, 9, 15, 3, 15, 'metal'),
        box(10, 3, 10, 14, 3.01, 14, 'water', faces={'up': 'water'}, collide=False),
    ])
    template('treat_jar', [box(6, 0, 6, 10, 5, 10, 'glass'), box(6.5, 0.2, 6.5, 9.5, 3.5, 9.5, 'treats', collide=False),
                           box(6.3, 5, 6.3, 9.7, 6, 9.7, 'lid')], collision=[[6, 0, 6, 10, 6, 10]])


def wall_templates():
    template('wall_panel', [box(1, 1, 15, 15, 15, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('wall_panel_full', [box(0, 0, 15, 16, 16, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('wall_plaque', [box(2, 2, 15.5, 14, 14, 16, 'face', uv={'north': 'full'})])
    template('wall_small', [box(5, 5, 15.2, 11, 11, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('wall_switch', [box(5.5, 3, 15.4, 10.5, 10, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('wall_art', [
        box(1, 2, 15, 15, 14, 16, 'frame'),
        box(1.5, 2.5, 14.9, 14.5, 13.5, 15, 'art', faces={'north': 'art'}, skip=('south',), uv={'north': 'full'}),
    ], collision=[[1, 2, 14.9, 15, 14, 16]])
    template('wall_art_wide', [
        box(-7, 2, 15, 23, 14, 16, 'frame'),
        box(-6.5, 2.5, 14.9, 22.5, 13.5, 15, 'art', faces={'north': 'art'}, skip=('south',), uv={'north': 'full'}),
    ], collision=[[0, 2, 14.9, 16, 14, 16]])
    template('wall_mirror', [
        box(2, 1, 15, 14, 15, 16, 'frame'),
        box(2.6, 1.6, 14.9, 13.4, 14.4, 15, 'glass', faces={'north': 'glass'}, skip=('south',), uv={'north': 'full'}),
    ], collision=[[2, 1, 14.9, 14, 15, 16]])
    template('vanity_mirror', [
        box(-3, 2, 15, 19, 15, 16, 'frame'),
        box(-2.5, 2.5, 14.9, 18.5, 14.5, 15, 'glass', faces={'north': 'glass'}, skip=('south',), uv={'north': 'full'}),
    ], collision=[[0, 2, 14.9, 16, 15, 16]])
    template('whiteboard', [
        box(-6, 1, 15, 22, 15, 16, 'frame'),
        box(-5.5, 1.5, 14.9, 21.5, 14.5, 15, 'board', faces={'north': 'board'}, skip=('south',), uv={'north': 'full'}),
        box(-4, 1, 13.5, 20, 1.6, 15, 'frame', collide=False),
    ], collision=[[0, 1, 14.9, 16, 15, 16]])
    template('exit_sign', [
        box(1, 4, 14, 15, 12, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'}),
    ])
    template('security_camera', [
        box(7, 11, 13, 9, 13, 16, 'mount'),
        box(5, 9, 5, 11, 13, 14, 'body', faces={'north': 'lens'}, uv={'north': 'full'},
            rot={'origin': [8, 11, 13], 'axis': 'x', 'angle': -22.5}),
    ], collision=[[5, 8, 5, 11, 13, 16]])
    template('camera_dome', [box(5, 14, 5, 11, 16, 11, 'body'), box(6, 13, 6, 10, 14, 10, 'lens_body',
                                                                          faces={'down': 'lens'}, uv={'down': 'full'})])
    template('ceiling_disk', [box(5, 15, 5, 11, 16, 11, 'face', uv={'down': 'full'})])
    template('sprinkler', [box(7.5, 14, 7.5, 8.5, 16, 8.5, 'metal'), box(6.5, 13.5, 6.5, 9.5, 14, 9.5, 'metal')])
    template('extinguisher', [
        box(6, 1, 12, 10, 12, 16, 'body'),
        box(7, 12, 13, 9, 14, 15, 'top'),
        box(7.5, 13, 11, 8.5, 14, 13, 'top', collide=False),
    ])
    template('wall_clock', [
        box(3, 3, 15, 13, 13, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'}),
    ])
    template('elevator_panel', [box(4.5, 3, 15, 11.5, 14, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('keycard_reader', [box(5, 4, 15, 11, 12, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('intercom', [box(4.5, 2, 15, 11.5, 14, 16, 'frame', faces={'north': 'face'}, uv={'north': 'full'})])
    template('ev_charger', [
        box(4, 2, 13, 12, 14, 16, 'body', faces={'north': 'face'}, uv={'north': 'full'}),
        box(11.5, 3, 12, 13, 10, 13.5, 'cable', collide=False),
    ])
    template('fire_alarm', [box(5, 6, 15, 11, 13, 16, 'face', uv={'north': 'full'})])
    template('thermostat', [box(5, 5, 15.3, 11, 11, 16, 'face', uv={'north': 'full'})])
    template('curtain_closed', [
        box(i * 2, 0, 13 + (0.6 if i % 2 else 0), i * 2 + 2, 16, 14.4 + (0.6 if i % 2 else 0), 'fabric',
            collide=False) for i in range(8)
    ], collision=[[0, 0, 13, 16, 16, 15]])
    template('curtain_open', [
        box(0, 0, 12.6, 1.5, 16, 15.4, 'fabric'), box(1.5, 0, 13, 3, 16, 15, 'fabric'),
        box(13, 0, 13, 14.5, 16, 15, 'fabric'), box(14.5, 0, 12.6, 16, 16, 15.4, 'fabric'),
    ])
    template('blinds_closed', [box(0, 0, 14, 16, 16, 15, 'slats', collide=False)],
             collision=[[0, 0, 14, 16, 16, 15]])
    template('blinds_open', [box(0, 13.5, 13.5, 16, 16, 15.5, 'slats')])


def door_templates():
    # Elevator doors: a sliding steel panel; "open" slides the panel to the hinge side.
    template('elevator_door_closed', [box(0, 0, 7, 16, 16, 9, 'panel')])
    template('elevator_door_open_left', [box(0, 0, 7, 2, 16, 9, 'panel')])
    template('elevator_door_open_right', [box(14, 0, 7, 16, 16, 9, 'panel')])


def build_templates():
    sofa_templates()
    seating_templates()
    table_templates()
    storage_templates()
    appliance_templates()
    light_templates()
    decor_templates()
    wall_templates()
    door_templates()


# =============================================================================== blocks
SOFA_COLORS = {
    'gray': ('fabric_gray', 'wood_ebony', 'pillow_pattern', 'Gray'),
    'charcoal': ('fabric_charcoal', 'metal_black', 'fabric_mustard', 'Charcoal'),
    'navy': ('fabric_navy', 'wood_light', 'cushion_white', 'Navy'),
    'beige': ('fabric_beige', 'wood_walnut', 'fabric_terracotta', 'Beige'),
    'emerald': ('fabric_emerald', 'metal_brass', 'fabric_blush', 'Emerald Velvet'),
    'cognac': ('leather_cognac', 'metal_black', 'fabric_cream', 'Cognac Leather'),
    'white': ('fabric_cream', 'wood_light', 'fabric_sky', 'Cream'),
    'outdoor': ('canvas_beige', 'wood_teak', 'fabric_stripe_navy', 'Outdoor'),
}

FABRIC_NAMES = {'gray': 'Gray', 'charcoal': 'Charcoal', 'navy': 'Navy', 'beige': 'Beige', 'cream': 'Cream',
                'emerald': 'Emerald', 'terracotta': 'Terracotta', 'blush': 'Blush', 'mustard': 'Mustard',
                'teal': 'Teal', 'sky': 'Sky Blue', 'olive': 'Olive'}

KITCHEN_STYLES = {
    'white': ('White Shaker', 'stone_marble_white'),
    'navy': ('Navy', 'stone_quartz'),
    'sage': ('Sage', 'wood_teak'),
    'charcoal': ('Charcoal', 'stone_concrete'),
    'walnut': ('Walnut', 'stone_granite'),
}


def define_blocks():
    # ------------------------------------------------------------------ building materials
    def cube(id, name, tex, render='solid', group='materials', tags=()):
        add(id, name, 'cube', {'': ('minecraft:block/cube_all', {'all': tex})}, render=render, group=group,
            tags=tags)

    for c in ('white', 'gray', 'charcoal'):
        cube(f'concrete_panel_{c}', f'{c.title()} Concrete Panel', f'concrete_panel_{c}')
    for c in ('white', 'gray', 'navy', 'sage', 'charcoal'):
        cube(f'lap_siding_{c}', f'{c.title()} Lap Siding', f'lap_siding_{c}')
    for c in ('white', 'gray', 'charcoal', 'cream'):
        cube(f'facade_panel_{c}', f'{c.title()} Facade Panel', f'facade_panel_{c}')
    for c in ('bronze', 'graphite', 'silver'):
        cube(f'metal_panel_{c}', f'{c.title()} Metal Panel', f'metal_panel_{c}')
    for c, n in (('red', 'Red'), ('charcoal', 'Charcoal'), ('white', 'White Painted'), ('tan', 'Tan'),
                 ('exposed', 'Exposed')):
        cube(f'brick_{c}', f'{n} Modern Brick', f'brick_{c}')
    cube('cedar_cladding', 'Cedar Cladding', 'cedar_cladding')
    cube('walnut_cladding', 'Walnut Cladding', 'walnut_cladding')
    cube('white_marble', 'White Marble', 'white_marble')
    cube('black_marble', 'Black Marble', 'black_marble')
    cube('travertine', 'Travertine', 'travertine')
    cube('terrazzo', 'Terrazzo', 'terrazzo')
    cube('limestone', 'Limestone', 'limestone')
    for k, n in (('light', 'Light Oak'), ('walnut', 'Walnut'), ('gray', 'Gray Washed'), ('white_oak', 'White Oak')):
        cube(f'hardwood_{k}', f'{n} Hardwood Floor', f'hardwood_{k}')
    cube('herringbone_oak', 'Herringbone Oak Floor', 'herringbone_oak')
    cube('subway_tile', 'White Subway Tile', 'subway_tile')
    cube('subway_tile_sage', 'Sage Subway Tile', 'subway_tile_sage')
    cube('subway_tile_navy', 'Navy Subway Tile', 'subway_tile_navy')
    cube('mosaic_tile', 'Mosaic Tile', 'mosaic_tile')
    cube('large_tile_light', 'Light Porcelain Tile', 'large_tile_light')
    cube('large_tile_dark', 'Dark Porcelain Tile', 'large_tile_dark')
    cube('slate_tile', 'Slate Tile', 'slate_tile')
    cube('pool_tile', 'Pool Tile', 'pool_tile')
    cube('pool_tile_dark', 'Pool Lane Tile', 'pool_tile_dark')
    cube('pool_coping', 'Pool Coping', 'pool_coping')
    for c in ('white', 'greige', 'sage', 'navy', 'blush', 'sky', 'charcoal', 'terracotta'):
        cube(f'drywall_{c}', f'{c.title()} Painted Drywall', f'drywall_{c}')
    cube('ceiling', 'Smooth Ceiling', 'ceiling')
    cube('acoustic_ceiling', 'Acoustic Ceiling Tile', 'acoustic_ceiling')
    cube('polished_concrete', 'Polished Concrete', 'polished_concrete')
    cube('asphalt', 'Asphalt', 'asphalt')
    cube('sidewalk', 'Concrete Sidewalk', 'sidewalk')
    cube('pavers_gray', 'Gray Pavers', 'pavers_gray')
    cube('pavers_charcoal', 'Charcoal Pavers', 'pavers_charcoal')
    cube('pavers_sand', 'Sand Pavers', 'pavers_sand')
    cube('artificial_turf', 'Artificial Turf', 'artificial_turf')
    cube('rubber_flooring', 'Rubber Gym Flooring', 'rubber_flooring')
    cube('pool_deck', 'Pool Deck Pavers', 'pool_deck')
    cube('green_wall', 'Living Green Wall', 'green_wall')
    cube('elevator_wall', 'Elevator Wall Panel', 'elevator_wall')
    cube('playground_mulch', 'Playground Mulch', 'playground_mulch')
    cube('rubber_safety_surface', 'Rubber Safety Surface', 'rubber_safety')
    cube('curb_yellow', 'Painted Curb', 'curb_yellow')
    cube('mullion_black', 'Black Window Mullion', 'mullion_black')
    cube('mullion_silver', 'Silver Window Mullion', 'mullion_silver')
    add('garage_column', 'Garage Column', 'cube', {'': ('minecraft:block/cube_column',
                                                        {'side': 'garage_column', 'end': 'garage_column_top'})},
        group='materials')
    add('steel_beam', 'Steel I-Beam', 'pillar', {'': ('minecraft:block/cube_column',
                                                       {'side': 'steel_beam', 'end': 'steel_beam_end'}),
                                                  'horizontal': ('minecraft:block/cube_column_horizontal',
                                                                 {'side': 'steel_beam', 'end': 'steel_beam_end'})},
        group='materials')
    for id, name, tex in (('window_glass', 'Window Glass', 'window_clear'),
                          ('curtain_wall_blue', 'Blue Curtain Wall Glass', 'curtain_wall_blue'),
                          ('curtain_wall_gray', 'Gray Curtain Wall Glass', 'curtain_wall_gray'),
                          ('smoked_glass', 'Smoked Glass', 'smoked_glass'),
                          ('frosted_glass', 'Frosted Glass', 'frosted_glass'),
                          ('factory_window', 'Steel Factory Window', 'factory_window')):
        add(id, name, 'glass', {'': ('minecraft:block/cube_all', {'all': tex})}, render='translucent',
            group='materials')
    # facing cubes for parking markings
    for id, name, tex in (('parking_line', 'Parking Line', 'parking_line'),
                          ('parking_line_yellow', 'Yellow Parking Line', 'parking_line_yellow'),
                          ('parking_accessible', 'Accessible Parking Marking', 'parking_accessible'),
                          ('parking_arrow', 'Parking Arrow', 'parking_arrow'),
                          ('crosswalk', 'Crosswalk', 'crosswalk')):
        add(id, name, 'facing_cube', {'': ('minecraft:block/cube_bottom_top',
                                           {'top': tex, 'side': 'asphalt', 'bottom': 'asphalt'})}, group='materials')
    # thin ceiling finishes hung under the floor slab above (white ceilings with recessed lights)
    add('ceiling_finish', 'Ceiling Finish', 'ceiling', {'': ('ceiling_layer', {'side': 'ceiling', 'face': 'ceiling'})},
        group='materials')
    add('ceiling_finish_wood', 'Wood Slat Ceiling', 'ceiling', {'': ('ceiling_layer', {'side': 'wood_light',
                                                                                    'face': 'cedar_cladding'})},
        group='materials')
    add('ceiling_downlight', 'Recessed Downlight', 'ceiling_lamp', {
        'on': ('ceiling_layer', {'side': 'ceiling', 'face': 'recessed_light'}),
        'off': ('ceiling_layer', {'side': 'ceiling', 'face': 'recessed_light_off'}),
    }, group='lighting')
    add('ceiling_led_panel', 'Ceiling LED Panel', 'ceiling_lamp', {
        'on': ('ceiling_layer', {'side': 'acoustic_ceiling', 'face': 'led_panel'}),
        'off': ('ceiling_layer', {'side': 'acoustic_ceiling', 'face': 'led_panel_off'}),
    }, group='lighting')
    # ceiling light panels (lit property)
    for id, name, tex, side in (('recessed_light', 'Recessed Ceiling Light', 'recessed_light', 'ceiling'),
                                ('led_panel', 'LED Ceiling Panel', 'led_panel', 'acoustic_ceiling')):
        add(id, name, 'light_panel', {
            'on': ('minecraft:block/cube_bottom_top', {'bottom': tex, 'top': side, 'side': side}),
            'off': ('minecraft:block/cube_bottom_top', {'bottom': f'{tex}_off', 'top': side, 'side': side}),
        }, group='lighting')

    # ------------------------------------------------------------------ living room
    for c, (fab, leg, pil, n) in SOFA_COLORS.items():
        models = {k: (f'sofa_{k}', {'fabric': fab, 'leg': leg, 'pillow': pil})
                  for k in ('single', 'left', 'middle', 'right', 'corner_left', 'corner_right')}
        add(f'sofa_{c}', f'{n} Modular Sofa', 'sofa', models, group='living')
    for c in ('gray', 'navy', 'mustard', 'terracotta', 'emerald', 'cream'):
        add(f'armchair_{c}', f'{FABRIC_NAMES[c]} Armchair', 'seat',
            {'': ('armchair', {'fabric': f'fabric_{c}', 'leg': 'wood_walnut', 'pillow': 'cushion_white'})},
            group='living')
    add('lounge_chair', 'Mid-Century Lounge Chair', 'seat',
        {'': ('lounge_chair', {'frame': 'wood_walnut', 'seat': 'leather_black', 'leg': 'metal_black'})}, group='living')
    add('lounge_chair_cognac', 'Cognac Lounge Chair', 'seat',
        {'': ('lounge_chair', {'frame': 'wood_light', 'seat': 'leather_cognac', 'leg': 'metal_chrome'})}, group='living')
    add('coffee_table_walnut', 'Walnut Coffee Table', 'furniture',
        {'': ('coffee_table', {'top': 'wood_walnut', 'leg': 'wood_walnut'})}, group='living')
    add('coffee_table_oak', 'Oak Coffee Table', 'furniture',
        {'': ('coffee_table', {'top': 'wood_light', 'leg': 'metal_black'})}, group='living')
    add('coffee_table_marble', 'Marble Coffee Table', 'furniture',
        {'': ('coffee_table', {'top': 'stone_marble_white', 'leg': 'metal_brass'})}, group='living')
    add('glass_coffee_table', 'Glass Coffee Table', 'furniture',
        {'': ('glass_coffee_table', {'top': 'glass_clear', 'leg': 'metal_brass'})}, render='translucent',
        group='living')
    add('side_table', 'Pedestal Side Table', 'furniture',
        {'': ('side_table', {'top': 'stone_marble_white', 'leg': 'metal_black'})}, group='living')
    add('side_table_wood', 'Walnut Side Table', 'furniture',
        {'': ('side_table', {'top': 'wood_walnut', 'leg': 'wood_walnut'})}, group='living')
    for c, front, side in (('walnut', 'cabinet_walnut_door', 'wood_walnut'),
                           ('white', 'cabinet_white_door', 'paint_white'),
                           ('charcoal', 'cabinet_charcoal_door', 'paint_charcoal')):
        add(f'media_console_{c}', f'{c.title()} Media Console', 'storage',
            {'': ('media_console', {'front': front, 'side': side, 'top': side, 'leg': 'metal_black'})},
            group='living')
    add('wall_tv', 'Wall-Mounted Smart TV', 'toggle', {
        'off': ('tv_wall', {'body': 'plastic_black', 'screen': 'screen_off'}),
        'on': ('tv_wall', {'body': 'plastic_black', 'screen': 'screen_tv'}),
    }, item=('tv_wall', {'body': 'plastic_black', 'screen': 'screen_off'}, WIDE_ITEM_DISPLAY), group='electronics')
    add('smart_tv', 'Smart TV on Stand', 'toggle', {
        'off': ('tv_stand', {'body': 'plastic_black', 'screen': 'screen_off'}),
        'on': ('tv_stand', {'body': 'plastic_black', 'screen': 'screen_tv'}),
    }, item=('tv_stand', {'body': 'plastic_black', 'screen': 'screen_off'}, WIDE_ITEM_DISPLAY), group='electronics')
    for c, frame, n in (('walnut', 'wood_walnut', 'Walnut'), ('white', 'paint_white', 'White'),
                        ('black', 'metal_black', 'Black Steel')):
        add(f'bookcase_{c}', f'{n} Bookcase', 'tall', {
            'lower': ('bookcase_lower', {'frame': frame, 'books': 'book_spines'}),
            'upper': ('bookcase_upper', {'frame': frame, 'books2': 'book_spines_2'}),
        }, group='living')
    for c, n in (('cream', 'Cream'), ('gray', 'Gray'), ('navy', 'Navy'), ('sage', 'Sage'), ('blush', 'Blush')):
        fab = f'fabric_{c}' if c != 'sage' else 'paint_sage'
        add(f'curtains_{c}', f'{n} Curtains', 'curtain', {
            'closed': ('curtain_closed', {'fabric': fab}),
            'open': ('curtain_open', {'fabric': fab}),
        }, group='living')
    for c, tex, n in (('white', 'paint_white', 'White'), ('wood', 'wood_light', 'Wooden')):
        add(f'blinds_{c}', f'{n} Blinds', 'curtain', {
            'closed': ('blinds_closed', {'slats': tex}),
            'open': ('blinds_open', {'slats': tex}),
        }, group='living')

    # ------------------------------------------------------------------ lighting
    add('floor_lamp', 'Arc Floor Lamp', 'lamp', {
        'off': ('floor_lamp', {'metal': 'metal_brass', 'shade': 'fabric_cream'}),
        'on': ('floor_lamp', {'metal': 'metal_brass', 'shade': 'light_diffuser'}),
    }, item=('floor_lamp', {'metal': 'metal_brass', 'shade': 'fabric_cream'}, TALL_ITEM_DISPLAY), group='lighting')
    add('floor_lamp_black', 'Black Floor Lamp', 'lamp', {
        'off': ('floor_lamp', {'metal': 'metal_black', 'shade': 'fabric_gray'}),
        'on': ('floor_lamp', {'metal': 'metal_black', 'shade': 'light_diffuser'}),
    }, item=('floor_lamp', {'metal': 'metal_black', 'shade': 'fabric_gray'}, TALL_ITEM_DISPLAY), group='lighting')
    for c, base, shade_tex in (('ceramic', 'ceramic_white', 'fabric_cream'), ('brass', 'metal_brass', 'fabric_beige'),
                               ('black', 'plastic_black', 'fabric_gray')):
        add(f'table_lamp_{c}', f'{c.title()} Table Lamp', 'lamp', {
            'off': ('table_lamp', {'base': base, 'shade': shade_tex}),
            'on': ('table_lamp', {'base': base, 'shade': 'light_diffuser'}),
        }, group='lighting')
    for c, metal in (('black', 'metal_black'), ('brass', 'metal_brass'), ('white', 'metal_white')):
        add(f'pendant_light_{c}', f'{c.title()} Pendant Light', 'ceiling_lamp', {
            'off': ('pendant_light', {'metal': metal, 'light': 'light_diffuser_off'}),
            'on': ('pendant_light', {'metal': metal, 'light': 'light_diffuser'}),
        }, group='lighting')
    add('chandelier', 'Brass Chandelier', 'ceiling_lamp', {
        'off': ('chandelier', {'metal': 'metal_brass', 'light': 'light_diffuser_off'}),
        'on': ('chandelier', {'metal': 'metal_brass', 'light': 'light_diffuser'}),
    }, group='lighting')
    add('ceiling_fan', 'Ceiling Fan', 'ceiling_lamp', {
        'off': ('ceiling_fan', {'metal': 'metal_white', 'blade': 'wood_walnut', 'light': 'light_diffuser_off'}),
        'on': ('ceiling_fan', {'metal': 'metal_white', 'blade': 'wood_walnut', 'light': 'light_diffuser'}),
    }, group='lighting')
    add('electric_fireplace', 'Linear Electric Fireplace', 'wall_toggle', {
        'off': ('electric_fireplace', {'frame': 'plastic_black', 'flames': 'screen_off', 'top': 'stone_marble_white'}),
        'on': ('electric_fireplace', {'frame': 'plastic_black', 'flames': 'fireplace_flames', 'top': 'stone_marble_white'}),
    }, item=('electric_fireplace', {'frame': 'plastic_black', 'flames': 'screen_off', 'top': 'stone_marble_white'},
             WIDE_ITEM_DISPLAY), group='living')
    add('wall_sconce', 'Wall Sconce', 'wall_lamp', {
        'off': ('wall_sconce', {'metal': 'metal_brass', 'shade': 'fabric_cream'}),
        'on': ('wall_sconce', {'metal': 'metal_brass', 'shade': 'light_diffuser'}),
    }, group='lighting')
    add('garage_light', 'Fluorescent Garage Light', 'ceiling_lamp', {
        'off': ('garage_light', {'metal': 'metal_white', 'light': 'light_diffuser_off'}),
        'on': ('garage_light', {'metal': 'metal_white', 'light': 'light_diffuser'}),
    }, group='lighting')
    add('string_lights', 'String Lights', 'string_lights', {
        'off': ('string_lights', {'cord': 'plastic_black', 'light': 'light_diffuser_off'}),
        'on': ('string_lights', {'cord': 'plastic_black', 'light': 'light_diffuser'}),
    }, render='cutout', group='lighting')
    add('lamp_post', 'Street Lamp Post', 'post', {'': ('lamp_post', {'metal': 'metal_black'})}, group='outdoor')
    add('lamp_head', 'Street Lamp Head', 'lamp_nodir', {
        'off': ('lamp_head', {'metal': 'metal_black', 'light': 'light_diffuser_off'}),
        'on': ('lamp_head', {'metal': 'metal_black', 'light': 'light_diffuser'}),
    }, group='outdoor')
    add('bollard_light', 'Bollard Light', 'lamp_nodir', {
        'off': ('bollard_light', {'metal': 'metal_black', 'light': 'light_diffuser_off'}),
        'on': ('bollard_light', {'metal': 'metal_black', 'light': 'light_diffuser'}),
    }, group='outdoor')

    # ------------------------------------------------------------------ kitchen
    for c, (n, top) in KITCHEN_STYLES.items():
        side = 'wood_walnut' if c == 'walnut' else f'cabinet_{c}_side'
        add(f'kitchen_{c}_cabinet', f'{n} Base Cabinet', 'storage',
            {'': ('kitchen_cabinet', {'front': f'cabinet_{c}_door', 'side': side, 'top': top, 'toe': 'plastic_black'})},
            group='kitchen')
        add(f'kitchen_{c}_drawers', f'{n} Drawer Cabinet', 'storage',
            {'': ('kitchen_cabinet', {'front': f'cabinet_{c}_drawers', 'side': side, 'top': top,
                                      'toe': 'plastic_black'})}, group='kitchen')
        sink_tex = {'front': f'cabinet_{c}_sink', 'side': side, 'top': top, 'toe': 'plastic_black',
                    'basin': 'sink_basin', 'faucet': 'metal_chrome', 'water': 'glass_clear'}
        add(f'kitchen_{c}_sink', f'{n} Sink Cabinet', 'toggle', {
            'off': ('kitchen_sink', sink_tex), 'on': ('kitchen_sink_on', sink_tex)}, render='translucent',
            group='kitchen')
        add(f'kitchen_{c}_upper', f'{n} Wall Cabinet', 'storage',
            {'': ('kitchen_upper', {'front': f'cabinet_{c}_upper', 'side': side})}, group='kitchen')
        add(f'kitchen_{c}_dishwasher', f'{n} Dishwasher', 'toggle', {
            'off': ('dishwasher', {'front': 'dishwasher_front', 'side': 'metal_steel', 'top': top, 'toe': 'plastic_black'}),
            'on': ('dishwasher', {'front': 'dishwasher_front', 'side': 'metal_steel', 'top': top, 'toe': 'plastic_black'}),
        }, group='kitchen')
    add('refrigerator', 'Stainless French-Door Refrigerator', 'tall_storage', {
        'lower': ('fridge_lower', {'front_lower': 'fridge_lower', 'side': 'metal_steel', 'handle': 'metal_chrome'}),
        'upper': ('fridge_upper', {'front_upper': 'fridge_upper', 'side': 'metal_steel', 'handle': 'metal_chrome'}),
    }, group='kitchen')
    add('oven_range', 'Stainless Oven Range', 'oven', {
        'off': ('oven_range', {'front': 'range_front', 'side': 'metal_steel', 'cooktop': 'cooktop', 'handle': 'metal_chrome'}),
        'on': ('oven_range', {'front': 'range_front_on', 'side': 'metal_steel', 'cooktop': 'cooktop_on',
                              'handle': 'metal_chrome'}),
    }, group='kitchen')
    add('range_hood', 'Chimney Range Hood', 'wall', {'': ('range_hood', {'front': 'range_hood', 'side': 'metal_steel'})},
        group='kitchen')
    add('microwave', 'Microwave', 'toggle', {
        'off': ('microwave', {'front': 'microwave_front', 'side': 'metal_steel'}),
        'on': ('microwave', {'front': 'microwave_front_on', 'side': 'metal_steel'}),
    }, group='kitchen')
    add('coffee_maker', 'Coffee Maker', 'coffee', {
        '': ('coffee_maker', {'side': 'plastic_black', 'glass': 'glass_clear', 'coffee': 'wood_ebony'}),
    }, render='translucent', group='kitchen')
    add('espresso_machine', 'Espresso Machine', 'coffee', {
        '': ('espresso_machine', {'front': 'coffee_maker_front', 'side': 'metal_steel', 'metal': 'metal_chrome',
                                  'cup': 'ceramic_white'}),
    }, group='kitchen')
    add('toaster', 'Toaster', 'furniture', {'': ('toaster', {'side': 'metal_chrome', 'slot': 'plastic_black'})},
        group='kitchen')
    add('kitchen_utensils', 'Utensil Crock & Cutting Board', 'furniture',
        {'': ('kitchen_utensils', {'holder': 'ceramic_white', 'tool': 'wood_light', 'board': 'wood_teak'})},
        group='kitchen')
    add('fruit_bowl', 'Fruit Bowl', 'furniture', {'': ('fruit_bowl', {
        'bowl': 'wood_walnut', 'fruit_a': 'plastic_red', 'fruit_b': 'plastic_yellow', 'fruit_c': 'plastic_green'})},
        group='kitchen')
    for c, (top, leg, n) in {'walnut': ('wood_walnut', 'wood_walnut', 'Walnut'), 'oak': ('wood_light', 'metal_black', 'Oak'),
                             'white': ('stone_marble_white', 'metal_brass', 'Marble'),
                             'black': ('wood_ebony', 'metal_black', 'Espresso')}.items():
        add(f'dining_table_{c}', f'{n} Dining Table', 'table', {
            'top': ('table_top', {'top': top}), 'leg_nw': ('table_leg_nw', {'leg': leg}),
            'leg_ne': ('table_leg_ne', {'leg': leg}), 'leg_sw': ('table_leg_sw', {'leg': leg}),
            'leg_se': ('table_leg_se', {'leg': leg}),
        }, item=('table_item', {'top': top, 'leg': leg}, None), group='kitchen')
    for c, (frame, seat, n) in {'walnut': ('wood_walnut', 'fabric_cream', 'Walnut'),
                                'oak': ('wood_light', 'fabric_gray', 'Oak'),
                                'black': ('metal_black', 'leather_cognac', 'Black'),
                                'white': ('paint_white', 'fabric_sky', 'White')}.items():
        add(f'dining_chair_{c}', f'{n} Dining Chair', 'seat', {'': ('dining_chair', {'frame': frame, 'seat': seat})},
            group='kitchen')
    for c, (frame, seat, n) in {'black': ('metal_black', 'leather_black', 'Black'),
                                'brass': ('metal_brass', 'leather_cognac', 'Brass')}.items():
        add(f'bar_stool_{c}', f'{n} Bar Stool', 'seat', {'': ('bar_stool', {'frame': frame, 'seat': seat})},
            group='kitchen')

    # ------------------------------------------------------------------ bedroom & closet
    for c, front, side, n in (('walnut', 'nightstand_front', 'wood_walnut', 'Walnut'),):
        add(f'nightstand_{c}', f'{n} Nightstand', 'storage',
            {'': ('nightstand', {'front': front, 'side': side, 'top': side})}, group='bedroom')
    add('nightstand_white', 'White Nightstand', 'storage',
        {'': ('nightstand', {'front': 'cabinet_white_drawers', 'side': 'paint_white', 'top': 'wood_light'})},
        group='bedroom')
    add('dresser_oak', 'Oak Dresser', 'storage',
        {'': ('dresser', {'front': 'dresser_front', 'side': 'wood_light', 'top': 'wood_light', 'leg': 'metal_black'})},
        group='bedroom')
    add('dresser_white', 'White Dresser', 'storage',
        {'': ('dresser', {'front': 'cabinet_white_drawers', 'side': 'paint_white', 'top': 'stone_marble_white',
                          'leg': 'metal_brass'})}, group='bedroom')
    add('wardrobe_white', 'White Wardrobe', 'tall_storage', {
        'lower': ('wardrobe_lower', {'front_lower': 'wardrobe_front_lower', 'side': 'paint_white'}),
        'upper': ('wardrobe_upper', {'front_upper': 'wardrobe_front', 'side': 'paint_white'}),
    }, group='bedroom')
    add('wardrobe_walnut', 'Walnut Wardrobe', 'tall_storage', {
        'lower': ('wardrobe_lower', {'front_lower': 'wardrobe_walnut_front_lower', 'side': 'wood_walnut'}),
        'upper': ('wardrobe_upper', {'front_upper': 'wardrobe_walnut_front', 'side': 'wood_walnut'}),
    }, group='bedroom')
    for c, (top, leg, drawer, n) in {'walnut': ('wood_walnut', 'wood_walnut', 'cabinet_walnut_drawers', 'Walnut'),
                                     'white': ('paint_white', 'paint_white', 'cabinet_white_drawers', 'White')}.items():
        add(f'desk_{c}', f'{n} Desk', 'furniture', {'': ('desk', {'top': top, 'leg': leg, 'drawer': drawer})},
            group='bedroom')
    add('office_chair', 'Ergonomic Office Chair', 'seat',
        {'': ('office_chair', {'frame': 'plastic_black', 'seat': 'fabric_charcoal', 'back': 'mesh_black',
                               'leg': 'metal_chrome'})}, group='bedroom')
    add('wall_mirror', 'Wall Mirror', 'wall', {'': ('wall_mirror', {'frame': 'metal_black', 'glass': 'mirror'})},
        group='bedroom')
    add('wall_mirror_brass', 'Brass Wall Mirror', 'wall', {'': ('wall_mirror', {'frame': 'metal_brass', 'glass': 'mirror'})},
        group='bedroom')
    add('clothing_rack', 'Closet Clothing Rail', 'furniture',
        {'': ('clothing_rack', {'rod': 'metal_chrome', 'clothes': 'clothes_rack'})}, render='cutout', group='bedroom')
    add('shoe_rack', 'Shoe Rack', 'furniture', {'': ('shoe_rack', {
        'frame': 'wood_light', 'shoe_a': 'plastic_black', 'shoe_b': 'fabric_sky', 'shoe_c': 'leather_cognac'})},
        group='bedroom')
    add('laundry_basket', 'Laundry Basket', 'storage', {'': ('laundry_basket', {
        'basket': 'wicker', 'clothes': 'laundry_clothes'})}, group='bedroom')
    add('wall_shelf', 'Floating Wall Shelf', 'wall', {'': ('wall_shelf', {
        'frame': 'wood_walnut', 'books': 'book_spines', 'pot': 'ceramic_white', 'plant': 'plant_herbs'})},
        render='cutout', group='bedroom')

    # ------------------------------------------------------------------ bathroom
    add('toilet', 'Toilet', 'seat', {'': ('toilet', {'ceramic': 'ceramic_white', 'seat': 'ceramic_white',
                                                      'metal': 'metal_chrome'})}, group='bathroom')
    for c, (front, side, top, n) in {'white': ('cabinet_white_door', 'cabinet_white_side', 'stone_marble_white', 'White'),
                                     'walnut': ('cabinet_walnut_door', 'wood_walnut', 'stone_quartz', 'Walnut'),
                                     'navy': ('cabinet_navy_door', 'cabinet_navy_side', 'stone_marble_white', 'Navy')}.items():
        add(f'vanity_{c}', f'{n} Bathroom Vanity', 'storage', {'': ('vanity', {
            'front': front, 'side': side, 'top': top, 'ceramic': 'ceramic_white', 'basin': 'ceramic_white',
            'faucet': 'metal_chrome'})}, group='bathroom')
    add('bathtub', 'Soaking Bathtub', 'bathtub', {
        'head': ('bathtub_head', {'ceramic': 'ceramic_white', 'metal': 'metal_chrome', 'water': 'glass_clear'}),
        'foot': ('bathtub_foot', {'ceramic': 'ceramic_white', 'water': 'glass_clear'}),
    }, item=('bathtub_item', {'ceramic': 'ceramic_white', 'metal': 'metal_chrome'}, LONG_ITEM_DISPLAY), group='bathroom')
    add('shower_head', 'Rain Shower Head', 'wall_toggle', {
        'off': ('shower_head', {'metal': 'metal_chrome', 'head': 'metal_steel'}),
        'on': ('shower_head', {'metal': 'metal_chrome', 'head': 'metal_steel'}),
    }, group='bathroom')
    add('shower_floor', 'Shower Floor Drain', 'cube', {'': ('minecraft:block/cube_bottom_top', {
        'top': 'shower_drain', 'side': 'mosaic_tile', 'bottom': 'mosaic_tile'})}, group='bathroom')
    add('towel_rack', 'Towel Rack', 'wall', {'': ('towel_rack', {'metal': 'metal_chrome', 'towel': 'towel_white'})},
        group='bathroom')
    add('toilet_paper_holder', 'Toilet Paper Holder', 'wall',
        {'': ('tp_holder', {'metal': 'metal_chrome', 'paper': 'paper_white'})}, group='bathroom')
    add('medicine_cabinet', 'Mirrored Medicine Cabinet', 'wall_storage',
        {'': ('medicine_cabinet', {'front': 'mirror', 'side': 'metal_white'})}, group='bathroom')
    add('vanity_mirror', 'Wide Vanity Mirror', 'wall', {'': ('vanity_mirror', {'frame': 'metal_black', 'glass': 'mirror'})},
        item=('vanity_mirror', {'frame': 'metal_black', 'glass': 'mirror'}, WIDE_ITEM_DISPLAY), group='bathroom')
    add('bath_mat', 'Bath Mat', 'furniture', {'': ('mat', {'fabric': 'towel_gray'})}, group='bathroom')
    add('towel_stack', 'Folded Towels', 'furniture', {'': ('towel_stack', {'towel_a': 'towel_white', 'towel_b': 'towel_navy'})},
        group='bathroom')
    add('toiletries', 'Toiletries', 'furniture', {'': ('toiletries', {
        'bottle_a': 'plastic_white', 'bottle_b': 'plastic_blue', 'bottle_c': 'glass_tinted', 'cap': 'metal_chrome'})},
        group='bathroom')

    # ------------------------------------------------------------------ laundry
    add('washing_machine', 'Front-Load Washer', 'appliance', {
        'off': ('washer', {'front': 'washer_front', 'side': 'plastic_white'}),
        'on': ('washer', {'front': 'washer_front_on', 'side': 'plastic_white'}),
    }, group='laundry')
    add('dryer', 'Front-Load Dryer', 'appliance', {
        'off': ('washer', {'front': 'dryer_front', 'side': 'plastic_white'}),
        'on': ('washer', {'front': 'dryer_front_on', 'side': 'plastic_white'}),
    }, group='laundry')

    # ------------------------------------------------------------------ decor & electronics
    for kind, n in (('monstera', 'Monstera'), ('snake', 'Snake Plant'), ('fern', 'Boston Fern'),
                    ('herbs', 'Herb Pot'), ('flowers', 'Flower Pot')):
        add(f'potted_{kind}', f'Potted {n}', 'plant', {'': ('potted_plant', {
            'pot': 'ceramic_white', 'soil': 'soil', 'plant': f'plant_{kind}'})}, render='cutout', group='decor')
    for kind, pot, n in (('fiddle', 'plastic_black', 'Fiddle-Leaf Fig'), ('olive', 'ceramic_white', 'Olive Tree'),
                         ('palm', 'wicker', 'Areca Palm')):
        add(f'potted_{kind}', f'Potted {n}', 'plant', {'': ('potted_plant_tall', {
            'pot': pot, 'soil': 'soil', 'plant': f'plant_{kind}'})}, render='cutout',
            item=('potted_plant_tall', {'pot': pot, 'soil': 'soil', 'plant': f'plant_{kind}'}, TALL_ITEM_DISPLAY),
            group='decor')
    add('succulent_pot', 'Succulent Pot', 'plant', {'': ('table_plant', {'pot': 'ceramic_white',
                                                                        'plant': 'plant_succulent'})},
        render='cutout', group='decor')
    add('flower_vase', 'Flower Vase', 'plant', {'': ('flower_vase', {'vase': 'glass_tinted', 'plant': 'plant_flowers'})},
        render='cutout', group='decor')
    add('planter_box', 'Garden Planter Box', 'plant', {'': ('planter_box', {
        'frame': 'cedar_cladding', 'soil': 'soil', 'plant': 'plant_flowers'})}, render='cutout', group='outdoor')
    add('planter_box_grass', 'Ornamental Grass Planter', 'plant', {'': ('planter_box', {
        'frame': 'concrete_panel_charcoal', 'soil': 'soil', 'plant': 'plant_palm'})}, render='cutout', group='outdoor')
    add('book_stack', 'Book Stack', 'furniture', {'': ('book_stack', {
        'book_a': 'fabric_navy', 'book_b': 'fabric_terracotta', 'book_c': 'paint_cream'})}, group='decor')
    add('vase', 'Ceramic Vase', 'furniture', {'': ('vase', {'vase': 'ceramic_white'})}, group='decor')
    add('candle_set', 'Candle Set', 'furniture', {'': ('candle_set', {'tray': 'metal_brass', 'wax': 'paint_cream'})},
        group='decor')
    for art in ('fields', 'grid', 'waves', 'sunset', 'botanical', 'geometric', 'city'):
        add(f'art_{art}', f'Framed Art ({art.title()})', 'wall', {'': ('wall_art', {
            'frame': 'wood_ebony' if art != 'botanical' else 'wood_light', 'art': f'art_{art}'})}, group='decor')
    for art in ('wide_strokes', 'wide_landscape'):
        add(f'art_{art}', f'Wide Framed Art ({art.split("_")[1].title()})', 'wall', {'': ('wall_art_wide', {
            'frame': 'metal_black', 'art': f'art_{art}'})},
            item=('wall_art_wide', {'frame': 'metal_black', 'art': f'art_{art}'}, WIDE_ITEM_DISPLAY), group='decor')
    add('wall_clock', 'Wall Clock', 'wall', {'': ('wall_clock', {'frame': 'metal_black', 'face': 'clock_face'})},
        group='decor')
    add('laptop', 'Laptop', 'toggle', {
        'off': ('laptop', {'body': 'metal_steel', 'screen': 'screen_off'}),
        'on': ('laptop', {'body': 'metal_steel', 'screen': 'screen_laptop'}),
    }, group='electronics')
    add('desktop_monitor', 'Desktop Monitor', 'toggle', {
        'off': ('monitor', {'body': 'plastic_black', 'screen': 'screen_off'}),
        'on': ('monitor', {'body': 'plastic_black', 'screen': 'screen_monitor'}),
    }, group='electronics')
    add('game_console', 'Game Console', 'furniture', {'': ('game_console', {
        'body': 'plastic_white', 'front': 'game_console', 'pad': 'plastic_black'})}, group='electronics')
    add('speaker', 'Bookshelf Speaker', 'furniture', {'': ('speaker', {'body': 'wood_walnut', 'front': 'speaker_grille'})},
        group='electronics')
    add('wifi_router', 'Wi-Fi Router', 'furniture', {'': ('router', {'body': 'plastic_black', 'front': 'router'})},
        group='electronics')
    for c, tex, n in (('charcoal', 'fabric_charcoal', 'Charcoal'), ('cream', 'fabric_cream', 'Cream'),
                      ('terracotta', 'fabric_terracotta', 'Terracotta')):
        add(f'runner_rug_{c}', f'{n} Runner Rug', 'furniture', {'': ('rug_runner', {'fabric': tex})}, group='decor')
    add('doormat', 'Welcome Doormat', 'furniture', {'': ('mat', {'fabric': 'doormat'})}, group='decor')

    # ------------------------------------------------------------------ gym
    add('treadmill', 'Treadmill', 'treadmill', {
        'head': ('treadmill_head', {'side': 'plastic_black', 'belt': 'treadmill_belt', 'frame': 'metal_gunmetal',
                                    'console': 'treadmill_console'}),
        'foot': ('treadmill_foot', {'side': 'plastic_black', 'belt': 'treadmill_belt', 'frame': 'metal_gunmetal'}),
    }, item=('treadmill_item', {'side': 'plastic_black', 'belt': 'treadmill_belt', 'frame': 'metal_gunmetal',
                                'console': 'treadmill_console'}, LONG_ITEM_DISPLAY), group='fitness')
    add('exercise_bike', 'Exercise Bike', 'seat', {'': ('exercise_bike', {
        'frame': 'metal_gunmetal', 'seat': 'leather_black', 'metal': 'metal_chrome', 'console': 'treadmill_console'})},
        group='fitness')
    add('weight_bench', 'Weight Bench', 'seat', {'': ('weight_bench', {
        'frame': 'metal_black', 'seat': 'leather_black', 'metal': 'metal_chrome', 'plate': 'rubber_black'})},
        group='fitness')
    add('dumbbell_rack', 'Dumbbell Rack', 'furniture', {'': ('dumbbell_rack', {'frame': 'metal_black',
                                                                              'weight': 'rubber_black'})},
        group='fitness')
    add('kettlebells', 'Kettlebells', 'furniture', {'': ('kettlebells', {'weight': 'metal_black'})}, group='fitness')
    add('punching_bag', 'Punching Bag', 'ceiling', {'': ('punching_bag', {'chain': 'metal_steel', 'bag': 'leather_black'})},
        group='fitness')
    add('squat_rack', 'Squat Rack', 'tall', {
        'lower': ('squat_rack_lower', {'frame': 'metal_black'}),
        'upper': ('squat_rack_upper', {'frame': 'metal_black', 'metal': 'metal_chrome', 'weight': 'rubber_black'}),
    }, group='fitness')
    for c, tex, n in (('purple', 'foam_purple', 'Purple'), ('teal', 'foam_teal', 'Teal'), ('coral', 'foam_coral', 'Coral')):
        add(f'yoga_mat_{c}', f'{n} Yoga Mat', 'furniture', {'': ('yoga_mat', {'foam': tex})}, group='fitness')
    add('rolled_yoga_mat', 'Rolled Yoga Mat', 'furniture', {'': ('rolled_mat', {'foam': 'foam_teal'})}, group='fitness')
    add('gym_mirror', 'Gym Mirror Panel', 'wall', {'': ('wall_panel_full', {'frame': 'metal_steel', 'face': 'mirror'})},
        group='fitness')
    add('locker', 'Locker', 'tall_storage', {
        'lower': ('locker_lower', {'front_lower': 'locker_lower', 'side': 'metal_gunmetal'}),
        'upper': ('locker_upper', {'front_upper': 'locker_upper', 'side': 'metal_gunmetal'}),
    }, group='fitness')
    add('water_cooler', 'Water Cooler', 'furniture', {'': ('water_cooler', {
        'front': 'water_cooler', 'side': 'plastic_white', 'bottle': 'glass_tinted'})}, render='translucent',
        group='fitness')
    add('towel_cart', 'Towel Cart', 'furniture', {'': ('towel_stack', {'towel_a': 'towel_white', 'towel_b': 'towel_gray'})},
        group='fitness')

    # ------------------------------------------------------------------ pool & outdoor
    add('pool_lounger', 'Pool Lounger', 'lounger', {
        'head': ('lounger_head', {'frame': 'metal_white', 'cushion': 'fabric_stripe_navy'}),
        'foot': ('lounger_foot', {'frame': 'metal_white', 'cushion': 'fabric_stripe_navy'}),
    }, item=('lounger_item', {'frame': 'metal_white', 'cushion': 'fabric_stripe_navy'}, LONG_ITEM_DISPLAY),
        group='outdoor')
    for c, tex, n in (('navy', 'canvas_navy_stripe', 'Navy'), ('teal', 'canvas_teal_stripe', 'Teal'),
                      ('beige', 'canvas_beige', 'Beige')):
        add(f'patio_umbrella_{c}', f'{n} Patio Umbrella', 'furniture', {'': ('umbrella', {
            'metal': 'metal_black', 'pole': 'metal_white', 'canvas': tex})},
            item=('umbrella', {'metal': 'metal_black', 'pole': 'metal_white', 'canvas': tex}, TALL_ITEM_DISPLAY),
            group='outdoor')
    add('pool_ladder', 'Pool Ladder', 'pool_ladder', {'': ('pool_ladder', {'metal': 'metal_chrome', 'step': 'metal_steel'})},
        group='outdoor')
    add('lifebuoy', 'Lifebuoy', 'wall', {'': ('lifebuoy', {'buoy': 'lifebuoy'})}, render='cutout', group='outdoor')
    add('hot_tub_jet', 'Hot Tub Jet', 'jet', {'': ('hot_tub_jet', {'metal': 'metal_chrome', 'grille': 'speaker_grille'})},
        group='outdoor')
    add('outdoor_shower', 'Outdoor Shower', 'tall_toggle', {
        'lower': ('outdoor_shower', {'frame': 'pool_deck', 'metal': 'metal_chrome'}),
        'upper': ('outdoor_shower_top', {'metal': 'metal_chrome'}),
        'lower_on': ('outdoor_shower', {'frame': 'pool_deck', 'metal': 'metal_chrome'}),
        'upper_on': ('outdoor_shower_top', {'metal': 'metal_chrome'}),
    }, group='outdoor')
    add('park_bench', 'Park Bench', 'seat', {'': ('bench', {'frame': 'wood_teak', 'leg': 'metal_black'})}, group='outdoor')
    add('lobby_bench', 'Upholstered Bench', 'seat', {'': ('lobby_bench', {'seat': 'leather_cognac', 'leg': 'metal_brass'})},
        group='living')
    add('adirondack_chair', 'Adirondack Chair', 'seat', {'': ('adirondack_chair', {'frame': 'paint_white'})},
        group='outdoor')
    add('bean_bag', 'Bean Bag', 'seat', {'': ('bean_bag', {'fabric': 'fabric_mustard'})}, group='living')
    add('picnic_table', 'Picnic Table', 'furniture', {'': ('picnic_table', {'top': 'wood_teak'})}, group='outdoor')
    add('bbq_grill', 'Gas BBQ Grill', 'grill', {
        'off': ('bbq_grill', {'side': 'metal_black', 'grate': 'grill_grate'}),
        'on': ('bbq_grill', {'side': 'metal_black', 'grate': 'cooktop_on'}),
    }, group='outdoor')
    add('patio_heater', 'Patio Heater', 'tall_toggle', {
        'lower': ('patio_heater', {'frame': 'metal_steel'}),
        'upper': ('patio_heater_top', {'frame': 'metal_steel', 'flame': 'glass_tinted'}),
        'lower_on': ('patio_heater', {'frame': 'metal_steel'}),
        'upper_on': ('patio_heater_top', {'frame': 'metal_steel', 'flame': 'fireplace_flames'}),
    }, group='outdoor')
    add('bike_rack', 'Bike Rack', 'furniture', {'': ('bike_rack', {'metal': 'metal_steel'})}, group='outdoor')
    add('trash_bin', 'Trash Bin', 'storage', {'': ('trash_bin', {'front': 'trash_bin', 'side': 'paint_charcoal'})},
        group='outdoor')
    add('recycling_bin', 'Recycling Bin', 'storage', {'': ('trash_bin', {'front': 'recycle_bin', 'side': 'plastic_blue'})},
        group='outdoor')
    add('cornhole_board', 'Cornhole Board', 'furniture', {'': ('cornhole', {'frame': 'wood_light', 'board': 'cornhole_board'})},
        group='outdoor')
    add('swing_set', 'Swing Set', 'seat', {'': ('swing_set', {'frame': 'paint_navy', 'chain': 'metal_steel',
                                                               'seat': 'rubber_black'})},
        item=('swing_set', {'frame': 'paint_navy', 'chain': 'metal_steel', 'seat': 'rubber_black'}, WIDE_ITEM_DISPLAY),
        group='outdoor')
    add('slide', 'Playground Slide', 'slide', {
        'head': ('slide_top', {'post': 'plastic_blue', 'deck': 'plastic_yellow'}),
        'foot': ('slide_chute', {'chute': 'plastic_red'}),
    }, item=('slide_item', {'post': 'plastic_blue', 'deck': 'plastic_yellow', 'chute': 'plastic_red'}, LONG_ITEM_DISPLAY),
        group='outdoor')
    add('agility_hurdle', 'Dog Agility Hurdle', 'furniture', {'': ('agility_hurdle', {'post': 'plastic_white',
                                                                                    'bar': 'plastic_yellow'})},
        group='outdoor')
    add('pet_waste_station', 'Pet Waste Station', 'furniture', {'': ('pet_waste_station', {
        'metal': 'metal_black', 'box': 'paint_charcoal', 'front': 'pet_station', 'bin': 'paint_charcoal'})},
        group='outdoor')

    # ------------------------------------------------------------------ amenities
    add('dog_wash_tub', 'Elevated Dog Wash Tub', 'furniture', {'': ('dog_wash_tub', {
        'metal': 'metal_steel', 'leg': 'metal_steel', 'drain': 'plastic_black'})}, group='amenity')
    add('dog_ramp', 'Dog Wash Ramp', 'furniture', {'': ('dog_ramp', {'ramp': 'rubber_black'})}, group='amenity')
    add('pet_sprayer', 'Handheld Pet Sprayer', 'wall_toggle', {
        'off': ('pet_sprayer', {'metal': 'metal_steel', 'sprayer': 'sprayer', 'hose': 'plastic_black'}),
        'on': ('pet_sprayer', {'metal': 'metal_steel', 'sprayer': 'sprayer', 'hose': 'plastic_black'}),
    }, group='amenity')
    add('grooming_table', 'Grooming Table', 'furniture', {'': ('grooming_table', {
        'top': 'rubber_black', 'leg': 'metal_steel', 'frame': 'metal_steel'})}, group='amenity')
    add('grooming_supplies', 'Grooming Supplies Shelf', 'wall', {'': ('wall_panel', {'frame': 'wood_light',
                                                                                   'face': 'grooming_supplies'})},
        render='cutout', group='amenity')
    add('paw_station', 'Paw Cleaning Station', 'furniture', {'': ('paw_station', {
        'mat': 'rubber_black', 'metal': 'metal_steel', 'water': 'glass_clear'})}, render='translucent', group='amenity')
    add('treat_jar', 'Dog Treat Jar', 'furniture', {'': ('treat_jar', {'glass': 'glass_clear', 'treats': 'wood_teak',
                                                                      'lid': 'metal_chrome'})},
        render='translucent', group='amenity')
    add('pool_table', 'Billiards Table', 'two_part', {
        'head': ('pool_table_head', {'felt': 'felt_green', 'wood': 'wood_walnut'}),
        'foot': ('pool_table_foot', {'felt': 'pool_table_top', 'wood': 'wood_walnut'}),
    }, item=('pool_table_item', {'felt': 'felt_green', 'wood': 'wood_walnut'}, LONG_ITEM_DISPLAY), group='amenity')
    add('ping_pong_table', 'Ping Pong Table', 'two_part', {
        'head': ('ping_pong_head', {'top': 'felt_blue', 'leg': 'metal_black', 'net': 'mesh_black'}),
        'foot': ('ping_pong_foot', {'top': 'felt_blue', 'leg': 'metal_black'}),
    }, item=('ping_pong_item', {'top': 'felt_blue', 'leg': 'metal_black', 'net': 'mesh_black'}, LONG_ITEM_DISPLAY),
        group='amenity')
    add('arcade_machine', 'Arcade Cabinet', 'tall_toggle', {
        'lower': ('arcade_lower', {'side': 'plastic_black', 'front_lower': 'arcade_panel', 'panel': 'plastic_black',
                                   'button': 'plastic_red', 'button_b': 'plastic_yellow'}),
        'upper': ('arcade_upper', {'side': 'plastic_black', 'screen': 'screen_off', 'marquee': 'arcade_marquee'}),
        'lower_on': ('arcade_lower', {'side': 'plastic_black', 'front_lower': 'arcade_panel', 'panel': 'plastic_black',
                                      'button': 'plastic_red', 'button_b': 'plastic_yellow'}),
        'upper_on': ('arcade_upper', {'side': 'plastic_black', 'screen': 'screen_arcade', 'marquee': 'arcade_marquee'}),
    }, group='amenity')
    add('vending_machine', 'Snack Vending Machine', 'vending', {
        'lower': ('vending_lower', {'front_lower': 'vending_lower', 'side': 'plastic_red'}),
        'upper': ('vending_upper', {'front_upper': 'vending_upper', 'side': 'plastic_red'}),
    }, group='amenity')
    add('mini_fridge', 'Beverage Fridge', 'storage', {'': ('mini_fridge', {
        'front': 'smoked_glass', 'side': 'plastic_black', 'handle': 'metal_chrome'})}, group='amenity')
    add('dartboard', 'Dartboard', 'wall', {'': ('wall_panel', {'frame': 'wood_ebony', 'face': 'dartboard'})},
        render='cutout', group='amenity')
    add('whiteboard', 'Whiteboard', 'wall', {'': ('whiteboard', {'frame': 'metal_steel', 'board': 'whiteboard'})},
        item=('whiteboard', {'frame': 'metal_steel', 'board': 'whiteboard'}, WIDE_ITEM_DISPLAY), group='amenity')
    add('printer', 'Office Printer', 'furniture', {'': ('printer', {'front': 'printer_front', 'side': 'plastic_gray',
                                                                   'paper': 'paper_white'})}, group='amenity')
    for c, (top, leg, n) in {'conference': ('wood_ebony', 'metal_chrome', 'Conference')}.items():
        add(f'{c}_table', f'{n} Table', 'table', {
            'top': ('table_top', {'top': top}), 'leg_nw': ('table_leg_nw', {'leg': leg}),
            'leg_ne': ('table_leg_ne', {'leg': leg}), 'leg_sw': ('table_leg_sw', {'leg': leg}),
            'leg_se': ('table_leg_se', {'leg': leg}),
        }, item=('table_item', {'top': top, 'leg': leg}, None), group='amenity')

    # ------------------------------------------------------------------ lobby & building systems
    add('reception_desk_marble', 'Marble Reception Desk', 'furniture', {'': ('reception_desk', {
        'front': 'white_marble', 'top': 'wood_walnut'})}, group='lobby')
    add('reception_desk_walnut', 'Walnut Reception Desk', 'furniture', {'': ('reception_desk', {
        'front': 'walnut_cladding', 'top': 'stone_quartz'})}, group='lobby')
    add('concierge_bell', 'Concierge Bell', 'bell', {'': ('concierge_bell', {'metal': 'metal_brass'})}, group='lobby')
    add('luggage_cart', 'Luggage Cart', 'furniture', {'': ('luggage_cart', {
        'base': 'fabric_navy', 'metal': 'metal_brass', 'wheel': 'rubber_black', 'bag': 'leather_cognac',
        'bag2': 'fabric_charcoal'})}, item=('luggage_cart', {
            'base': 'fabric_navy', 'metal': 'metal_brass', 'wheel': 'rubber_black', 'bag': 'leather_cognac',
            'bag2': 'fabric_charcoal'}, TALL_ITEM_DISPLAY), group='lobby')
    add('mailbox_bank', 'Mailbox Bank', 'wall_storage', {'': ('mailbox_bank', {'front': 'mailbox_bank',
                                                                             'side': 'metal_steel'})}, group='lobby')
    add('parcel_locker', 'Smart Parcel Locker', 'tall_storage', {
        'lower': ('parcel_lower', {'front_lower': 'parcel_locker_lower', 'side': 'metal_gunmetal'}),
        'upper': ('parcel_upper', {'front_upper': 'parcel_locker_upper', 'side': 'metal_gunmetal'}),
    }, group='lobby')
    add('package_shelf', 'Package Shelf', 'storage', {'': ('package_shelf', {'frame': 'metal_black', 'box': 'cardboard'})},
        group='lobby')
    add('elevator_floor', 'Elevator Floor', 'elevator', {'': ('minecraft:block/cube_bottom_top', {
        'top': 'elevator_floor', 'side': 'elevator_wall', 'bottom': 'elevator_wall'})}, group='systems')
    add('elevator_door', 'Elevator Door', 'elevator_door', {
        'closed': ('elevator_door_closed', {'panel': 'elevator_door'}),
        'open_left': ('elevator_door_open_left', {'panel': 'elevator_door'}),
        'open_right': ('elevator_door_open_right', {'panel': 'elevator_door'}),
    }, item=('elevator_door_item', {'panel': 'elevator_door'}, TALL_ITEM_DISPLAY), group='systems')
    add('elevator_panel', 'Elevator Floor Panel', 'elevator_panel',
        {'': ('elevator_panel', {'frame': 'metal_steel', 'face': 'elevator_panel'})}, group='systems')
    add('elevator_call_button', 'Elevator Call Button', 'elevator_panel',
        {'': ('keycard_reader', {'frame': 'metal_steel', 'face': 'elevator_call'})}, group='systems')
    add('keycard_reader', 'Keycard Reader', 'keycard_reader', {
        'off': ('keycard_reader', {'frame': 'plastic_black', 'face': 'keycard_reader'}),
        'on': ('keycard_reader', {'frame': 'plastic_black', 'face': 'keycard_reader_open'}),
    }, group='systems')
    add('intercom', 'Lobby Intercom', 'intercom', {'': ('intercom', {'frame': 'metal_steel', 'face': 'intercom'})},
        group='systems')
    add('security_camera', 'Security Camera', 'wall', {'': ('security_camera', {
        'mount': 'plastic_white', 'body': 'plastic_white', 'lens': 'security_camera_lens'})}, group='systems')
    add('security_camera_dome', 'Dome Security Camera', 'ceiling', {'': ('camera_dome', {
        'body': 'plastic_white', 'lens_body': 'plastic_black', 'lens': 'security_camera_lens'})}, group='systems')
    add('smoke_detector', 'Smoke Detector', 'ceiling', {'': ('ceiling_disk', {'face': 'smoke_detector'})},
        group='systems')
    add('sprinkler', 'Fire Sprinkler', 'ceiling', {'': ('sprinkler', {'metal': 'metal_chrome'})}, group='systems')
    add('fire_extinguisher', 'Fire Extinguisher', 'wall', {'': ('extinguisher', {'body': 'extinguisher',
                                                                                'top': 'plastic_black'})},
        group='systems')
    add('fire_alarm', 'Fire Alarm Pull Station', 'wall', {'': ('fire_alarm', {'face': 'fire_alarm'})}, group='systems')
    add('exit_sign', 'Illuminated Exit Sign', 'wall', {'': ('exit_sign', {'frame': 'plastic_white', 'face': 'exit_sign'})},
        group='systems')
    add('thermostat', 'Smart Thermostat', 'wall', {'': ('thermostat', {'face': 'thermostat'})}, group='systems')
    add('light_switch', 'Light Switch', 'light_switch', {
        'off': ('wall_switch', {'frame': 'plastic_white', 'face': 'light_switch'}),
        'on': ('wall_switch', {'frame': 'plastic_white', 'face': 'light_switch_on'}),
    }, group='systems')
    add('wall_outlet', 'Wall Outlet', 'wall', {'': ('wall_switch', {'frame': 'plastic_white', 'face': 'outlet'})},
        group='systems')
    add('ev_charger', 'EV Charging Station', 'wall', {'': ('ev_charger', {'body': 'plastic_white', 'face': 'ev_charger',
                                                                         'cable': 'plastic_black'})}, group='parking')
    add('wheel_stop', 'Parking Wheel Stop', 'furniture', {'': ('wheel_stop', {'concrete': 'stone_concrete',
                                                                             'paint': 'plastic_yellow'})}, group='parking')
    add('speed_bump', 'Speed Bump', 'furniture', {'': ('speed_bump', {'paint': 'plastic_yellow'})}, group='parking')
    from textures import ICONS
    for icon in ICONS:
        add(f'sign_{icon}', f'{icon.title()} Wayfinding Sign', 'wall', {'': ('wall_plaque', {'face': f'sign_{icon}'})},
            group='signage')

    # ------------------------------------------------------------------ doors & railings
    from textures import DOORS
    for kind, name in DOORS.items():
        add(f'door_{kind}', name, 'door', {'': (kind, {})},
            render='cutout' if kind in ('glass', 'patio') else 'cutout', group='doors')
    add('glass_railing', 'Glass Balcony Railing', 'pane', {'': ('glass_railing', {'pane': 'glass_railing',
                                                                                 'edge': 'glass_railing_edge'})},
        render='translucent', group='doors')
    add('metal_railing', 'Black Metal Railing', 'pane', {'': ('metal_railing', {'pane': 'metal_railing',
                                                                               'edge': 'metal_railing_edge'})},
        render='cutout', group='doors')
    add('glass_partition', 'Frameless Glass Partition', 'pane', {'': ('glass_partition', {
        'pane': 'glass_partition', 'edge': 'glass_partition_edge'})}, render='translucent', group='doors')


def extra_templates():
    """Templates that depend on several pieces (two-part items, merged item models)."""
    # bathtub (two blocks along the facing axis; head holds the faucet)
    template('bathtub_head', [
        box(0, 0, 0, 16, 9, 2, 'ceramic'), box(0, 0, 0, 2, 9, 16, 'ceramic'), box(14, 0, 0, 16, 9, 16, 'ceramic'),
        box(2, 0, 2, 14, 2, 16, 'ceramic'),
        box(7, 9, 0.5, 9, 11, 1.5, 'metal', collide=False), box(7.5, 10, 1.5, 8.5, 11, 4, 'metal', collide=False),
    ], collision=[[0, 0, 0, 16, 2, 16], [0, 0, 0, 16, 9, 2], [0, 0, 0, 2, 9, 16], [14, 0, 0, 16, 9, 16]])
    template('bathtub_foot', [
        box(0, 0, 14, 16, 9, 16, 'ceramic'), box(0, 0, 0, 2, 9, 16, 'ceramic'), box(14, 0, 0, 16, 9, 16, 'ceramic'),
        box(2, 0, 0, 14, 2, 14, 'ceramic'),
    ], collision=[[0, 0, 0, 16, 2, 16], [0, 0, 14, 16, 9, 16], [0, 0, 0, 2, 9, 16], [14, 0, 0, 16, 9, 16]])
    template('bathtub_item', TEMPLATES['bathtub_head']['boxes'] +
             [b.moved(dz=16) for b in TEMPLATES['bathtub_foot']['boxes']], display=LONG_ITEM_DISPLAY)
    template('pool_table_head', [
        box(0, 7, 0, 16, 10, 16, 'felt', faces={'north': 'wood', 'east': 'wood', 'west': 'wood', 'down': 'wood'}),
        box(0, 10, 0, 16, 11, 1.5, 'wood'), box(0, 10, 0, 1.5, 11, 16, 'wood'), box(14.5, 10, 0, 16, 11, 16, 'wood'),
        box(1, 0, 1, 4, 7, 4, 'wood', collide=False), box(12, 0, 1, 15, 7, 4, 'wood', collide=False),
    ], collision=[[0, 0, 0, 16, 11, 16]])
    template('pool_table_foot', [
        box(0, 7, 0, 16, 10, 16, 'felt', faces={'south': 'wood', 'east': 'wood', 'west': 'wood', 'down': 'wood'}),
        box(0, 10, 14.5, 16, 11, 16, 'wood'), box(0, 10, 0, 1.5, 11, 16, 'wood'), box(14.5, 10, 0, 16, 11, 16, 'wood'),
        box(1, 0, 12, 4, 7, 15, 'wood', collide=False), box(12, 0, 12, 15, 7, 15, 'wood', collide=False),
    ], collision=[[0, 0, 0, 16, 11, 16]])
    template('pool_table_item', TEMPLATES['pool_table_head']['boxes'] +
             [b.moved(dz=16) for b in TEMPLATES['pool_table_foot']['boxes']], display=LONG_ITEM_DISPLAY)
    template('ping_pong_head', [
        box(0, 11, 0, 16, 12, 16, 'top'),
        box(-1, 12, 15.5, 17, 14.5, 16, 'net', collide=False),
        box(2, 0, 2, 3, 11, 3, 'leg', collide=False), box(13, 0, 2, 14, 11, 3, 'leg', collide=False),
    ], collision=[[0, 0, 0, 16, 12, 16]])
    template('ping_pong_foot', [
        box(0, 11, 0, 16, 12, 16, 'top'),
        box(2, 0, 13, 3, 11, 14, 'leg', collide=False), box(13, 0, 13, 14, 11, 14, 'leg', collide=False),
    ], collision=[[0, 0, 0, 16, 12, 16]])
    template('ping_pong_item', TEMPLATES['ping_pong_head']['boxes'] +
             [b.moved(dz=16) for b in TEMPLATES['ping_pong_foot']['boxes']], display=LONG_ITEM_DISPLAY)
    template('treadmill_item', TEMPLATES['treadmill_head']['boxes'] +
             [b.moved(dz=16) for b in TEMPLATES['treadmill_foot']['boxes']], display=LONG_ITEM_DISPLAY)
    template('lounger_item', TEMPLATES['lounger_head']['boxes'] +
             [b.moved(dz=16) for b in TEMPLATES['lounger_foot']['boxes']], display=LONG_ITEM_DISPLAY)
    template('slide_item', TEMPLATES['slide_top']['boxes'] +
             [b.moved(dz=12) for b in TEMPLATES['slide_chute']['boxes']], display=LONG_ITEM_DISPLAY)
    template('elevator_door_item', TEMPLATES['elevator_door_closed']['boxes'] +
             [b.moved(dy=16) for b in TEMPLATES['elevator_door_closed']['boxes']], display=TALL_ITEM_DISPLAY)


def build():
    build_templates()
    extra_templates()
    define_blocks()
    return TEMPLATES, BLOCKS
