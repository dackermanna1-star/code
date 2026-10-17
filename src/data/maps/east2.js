// PLACEHOLDER — replaced by maps-D (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'east2', name: 'east2 (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'east2_room', name: 'east2', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_east1: [2, 5],
    from_longhall: [3, 5],
    door_205: [4, 5],
    in_205: [5, 5],
    danny_desk: [6, 5],
    desk_205_tess: [7, 5],
    hall_pass: [8, 5],
    terminal: [9, 5],
  },
};
