// PLACEHOLDER — replaced by maps-A (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'exterior', name: 'exterior (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'exterior_room', name: 'exterior', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    start: [2, 5],
    car: [3, 5],
    oak: [4, 5],
    front_doors: [5, 5],
    chute_exit: [6, 5],
    dawn_steps: [7, 5],
    dawn_lot: [8, 5],
  },
};
