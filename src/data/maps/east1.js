// PLACEHOLDER — replaced by maps-C (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'east1', name: 'east1 (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'east1_room', name: 'east1', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_lobby: [2, 5],
    from_basement: [3, 5],
    from_east2: [4, 5],
    from_gym: [5, 5],
    stair_gate: [6, 5],
    dumbwaiter: [7, 5],
    gym_doors: [8, 5],
  },
};
