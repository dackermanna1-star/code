// Required anchors per story map (CONTENT.md v2 §2 / TECH §5.7). Shared by tests/maps.mjs and tools.
export const REQUIRED_ANCHORS = {
  exterior: ['start', 'car', 'oak', 'front_doors', 'chute_exit', 'dawn_steps', 'dawn_lot'],
  lobby: ['from_exterior', 'from_west1', 'from_east1', 'from_aud', 'aud_doors', 'portrait', 'memorial', 'plaque', 'danny_bag', 'bench', 'trophy', 'stage_door'],
  west1: ['from_lobby', 'from_library', 'library_end', 'danny_vanish', 'bulletin', 'door_102', 'in_102', 'door_103', 'in_103',
    'desk_103_tess', 'desk_103_leah', 'desk_103_marcus', 'door_office', 'in_office', 'office_bench', 'pa_console', 'principal_portrait', 'colonel_fold_hall'],
  library: ['from_west1', 'from_west2', 'spiral_bottom', 'spiral_top', 'leah_table', 'card_catalog', 'display_case'],
  east1: ['from_lobby', 'from_basement', 'from_east2', 'from_gym', 'stair_gate', 'dumbwaiter', 'gym_doors'],
  gym: ['from_east1', 'denise', 'colonel_hoop', 'center', 'locker_tess', 'locker_room', 'marcus_photo', 'shower_mirrors'],
  basement: ['from_east1', 'coal_heap', 'coal_chute', 'janitor_door', 'janitor_ledge', 'keyring', 'boiler', 'breaker_panel'],
  east2: ['from_east1', 'from_longhall', 'door_205', 'in_205', 'danny_desk', 'desk_205_tess', 'hall_pass', 'terminal'],
  longhall: ['from_east2', 'from_west2', 'start', 'kevin', 'loop_reset', 'gallery'],
  west2: ['from_longhall', 'from_library', 'door_201', 'in_201', 'false_leah', 'desk_201_tess', 'mirror_2f', 'history_board', 'chem_window'],
  aud: ['from_lobby', 'back_row', 'lectern', 'front_row_danny', 'front_row_leah', 'front_row_marcus', 'beside_danny', 'beside_leah',
    'beside_marcus', 'denise_husk', 'music_room', 'music_mirror', 'clarinet_case', 'trap_room', 'trapdoor', 'stage_left', 'stage_right', 'stage_door'],
  vault: ['from_aud', 'stair_bottom', 'sarcophagus', 'adair', 'to_breaker'],
  breaker: ['from_vault', 'floor', 'stairs_1', 'stairs_2', 'office', 'register'],
};
export const STORY_MAPS = Object.keys(REQUIRED_ANCHORS);
