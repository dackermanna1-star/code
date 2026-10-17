// PLACEHOLDER — replaced by maps-C (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'gym', name: 'gym (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'gym_room', name: 'gym', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_east1: [2, 5],
    denise: [3, 5],
    colonel_hoop: [4, 5],
    center: [5, 5],
    locker_tess: [6, 5],
    locker_room: [7, 5],
    marcus_photo: [8, 5],
    shower_mirrors: [9, 5],
  },
};
