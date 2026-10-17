// PLACEHOLDER — replaced by maps-B (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'library', name: 'library (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'library_room', name: 'library', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_west1: [2, 5],
    from_west2: [3, 5],
    spiral_bottom: [4, 5],
    spiral_top: [5, 5],
    leah_table: [6, 5],
    card_catalog: [7, 5],
    display_case: [8, 5],
  },
};
