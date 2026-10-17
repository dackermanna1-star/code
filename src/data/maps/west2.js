// PLACEHOLDER — replaced by maps-D (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'west2', name: 'west2 (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
  tiles: [
    '                        ',
    ' ###################### ',
    ' ###################### ',
    ' ###################### ',
    ' #....................# ',
    ' #....................# ',
    ' #....................# ',
    ' ###################### ',
    '                        ',
  ],
  rooms: [{ id: 'west2_room', name: 'west2', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_longhall: [2, 5],
    from_library: [3, 5],
    door_201: [4, 5],
    in_201: [5, 5],
    false_leah: [6, 5],
    desk_201_tess: [7, 5],
    mirror_2f: [8, 5],
    history_board: [9, 5],
    chem_window: [10, 5],
  },
};
