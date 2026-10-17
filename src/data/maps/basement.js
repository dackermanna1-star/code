// PLACEHOLDER — replaced by maps-C (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'basement', name: 'basement (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'basement_room', name: 'basement', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_east1: [2, 5],
    coal_heap: [3, 5],
    coal_chute: [4, 5],
    janitor_door: [5, 5],
    janitor_ledge: [6, 5],
    keyring: [7, 5],
    boiler: [8, 5],
    breaker_panel: [9, 5],
  },
};
