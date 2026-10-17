// PLACEHOLDER — replaced by maps-D (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'longhall', name: 'longhall (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'longhall_room', name: 'longhall', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_east2: [2, 5],
    from_west2: [3, 5],
    start: [4, 5],
    kevin: [5, 5],
    loop_reset: [6, 5],
    gallery: [7, 5],
  },
};
