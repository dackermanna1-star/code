// PLACEHOLDER — replaced by maps-E (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'breaker', name: 'breaker (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'breaker_room', name: 'breaker', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_vault: [2, 5],
    floor: [3, 5],
    stairs_1: [4, 5],
    stairs_2: [5, 5],
    office: [6, 5],
    register: [7, 5],
  },
};
