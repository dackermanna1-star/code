"""Non-block items (keys, keycards, blueprints, food) plus all non-block translations."""
from __future__ import annotations

import os

NS = 'modernapartments'

ITEMS = {
    'apartment_key': 'Apartment Key',
    'access_keycard': 'Access Keycard',
    'master_keycard': 'Building Master Keycard',
    'coffee_cup': 'Cup of Coffee',
    'takeout_box': 'Takeout Box',
    'blueprint_metropolitan': 'Blueprint: The Metropolitan',
    'blueprint_parkside': 'Blueprint: The Parkside Residences',
    'blueprint_skyline': 'Blueprint: The Skyline Towers',
    'blueprint_courtyard': 'Blueprint: The Courtyard Apartments',
    'blueprint_urban_lofts': 'Blueprint: The Urban Lofts',
    'demolition_permit': 'Demolition Permit',
}

EXTRA_LANG = {
    'itemGroup.modernapartments.materials': 'Modern Apartments: Materials',
    'itemGroup.modernapartments.furniture': 'Modern Apartments: Furniture',
    'itemGroup.modernapartments.kitchen_bath': 'Modern Apartments: Kitchen & Bath',
    'itemGroup.modernapartments.amenities': 'Modern Apartments: Amenities & Outdoor',
    'itemGroup.modernapartments.systems': 'Modern Apartments: Building Systems',
    'itemGroup.modernapartments.blueprints': 'Modern Apartments: Blueprints',
    'entity.modernapartments.seat': 'Seat',
    'container.modernapartments.storage': 'Storage',
    'structure.modernapartments.metropolitan': 'The Metropolitan',
    'structure.modernapartments.parkside': 'The Parkside Residences',
    'structure.modernapartments.skyline': 'The Skyline Towers',
    'structure.modernapartments.courtyard': 'The Courtyard Apartments',
    'structure.modernapartments.urban_lofts': 'The Urban Lofts',
}


def write(assets: str, lang: dict, write_json) -> None:
    for item_id, name in ITEMS.items():
        write_json(os.path.join(assets, 'models', 'item', f'{item_id}.json'),
                   {'parent': 'minecraft:item/handheld' if 'key' in item_id else 'minecraft:item/generated',
                    'textures': {'layer0': f'{NS}:item/{item_id}'}})
        write_json(os.path.join(assets, 'items', f'{item_id}.json'),
                   {'model': {'type': 'minecraft:model', 'model': f'{NS}:item/{item_id}'}})
        lang[f'item.{NS}.{item_id}'] = name
