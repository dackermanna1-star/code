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
    # chat / action bar messages
    'message.modernapartments.lights_on': 'Lights on (%s fixtures)',
    'message.modernapartments.lights_off': 'Lights off (%s fixtures)',
    'message.modernapartments.vending_price': 'Insert an emerald for a snack',
    'message.modernapartments.workout': 'Nice workout! Keep it up.',
    'message.modernapartments.this_door': 'this door',
    'message.modernapartments.door_locked': 'Locked %s',
    'message.modernapartments.door_unlocked': 'Unlocked %s',
    'message.modernapartments.door_is_locked': '%s is locked. Use its key, a keycard reader or the intercom.',
    'message.modernapartments.intercom_released': 'Buzzing you in... the door is unlocked for a few seconds',
    'message.modernapartments.intercom_no_answer': 'No answer. There is no door nearby.',
    'message.modernapartments.secure_entry': 'Secure Entry',
    'message.modernapartments.reader_paired': 'Reader paired with this card (%s doors locked)',
    'message.modernapartments.reader_cleared': 'Reader cleared; doors are unlocked',
    'message.modernapartments.reader_needs_card': 'Tap a paired keycard to enter',
    'message.modernapartments.reader_inactive': 'Reader inactive. Sneak and use a keycard to pair it.',
    'message.modernapartments.access_granted': 'Access granted',
    'message.modernapartments.access_denied': 'Access denied',
    'message.modernapartments.no_elevator': 'No elevator car nearby',
    'message.modernapartments.elevator_floor': 'Floor %s',
    'message.modernapartments.too_low': 'Not enough room below this spot for the building',
    'message.modernapartments.too_high': 'The building would reach above the build limit here',
    'message.modernapartments.build_planning': 'Planning %s...',
    'message.modernapartments.build_failed': 'Construction failed; see the server log for details',
    'message.modernapartments.build_done': '%s is complete (%s blocks placed)',
    'message.modernapartments.build_progress': 'Building %s: %s%%',
    'message.modernapartments.no_target': 'Point at the ground within 128 blocks',
    'message.modernapartments.busy': 'Another building is still under construction nearby',
    'message.modernapartments.confirm_build': 'Build %s here (%sx%s, %s tall, front facing %s)? Use again to confirm, sneak-use to turn.',
    'message.modernapartments.no_building_here': 'There is no placed apartment complex here',
    'message.modernapartments.demolishing': 'Demolishing %s and restoring the land...',
    'message.modernapartments.confirm_demolish': 'Demolish %s? Use the permit again to confirm.',
    # tooltips
    'tooltip.modernapartments.master_key': 'Opens every apartment door',
    'tooltip.modernapartments.blank_key': 'Blank. Sneak-use on a door or keycard reader to pair it.',
    'tooltip.modernapartments.paired_key': 'Paired: %s',
    'tooltip.modernapartments.blueprint_metropolitan': 'Luxury high-rise: concierge lobby, pool deck, penthouses, sky lounge',
    'tooltip.modernapartments.blueprint_parkside': 'Mid-rise around a garden courtyard with playground and dog park',
    'tooltip.modernapartments.blueprint_skyline': 'Glass skyscraper: corner homes, sky garden, observation deck',
    'tooltip.modernapartments.blueprint_courtyard': 'Garden community: resort pool, turf lawn, clubhouse',
    'tooltip.modernapartments.blueprint_urban_lofts': 'Warehouse lofts with mezzanines, maker space and roof deck',
    'tooltip.modernapartments.blueprint_size': 'Plot: %s x %s blocks, %s tall',
    'tooltip.modernapartments.blueprint_usage': 'Use on the ground to preview, use again to build. Sneak-use rotates.',
    'tooltip.modernapartments.demolition_permit': 'Use twice on a placed complex to demolish it and restore the land',
    # commands and screens
    'command.modernapartments.unknown_complex': 'Unknown complex. Try metropolitan, parkside, skyline, courtyard or urban_lofts.',
    'command.modernapartments.placing': 'Building %s at %s facing %s (seed %s)',
    'command.modernapartments.list_header': '%s apartment complexes in this dimension:',
    'command.modernapartments.nothing_to_undo': 'Nothing to undo',
    'command.modernapartments.validate_summary': '%s: %s homes, %s rooms checked, %s unreachable, %s warnings (%s positions explored, %s ms)',
    'command.modernapartments.info': '%s at %s, rotation %s, seed %s',
    'screen.modernapartments.elevator': 'Select Floor',
}


def write(assets: str, lang: dict, write_json) -> None:
    for item_id, name in ITEMS.items():
        write_json(os.path.join(assets, 'models', 'item', f'{item_id}.json'),
                   {'parent': 'minecraft:item/handheld' if 'key' in item_id else 'minecraft:item/generated',
                    'textures': {'layer0': f'{NS}:item/{item_id}'}})
        write_json(os.path.join(assets, 'items', f'{item_id}.json'),
                   {'model': {'type': 'minecraft:model', 'model': f'{NS}:item/{item_id}'}})
        lang[f'item.{NS}.{item_id}'] = name
