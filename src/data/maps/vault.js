// PLACEHOLDER — replaced by maps-E (see docs/CONTENT.md §2). Minimal valid map with every required anchor.
export default {
  id: 'vault', name: 'vault (placeholder)', floor: '1F', offset: [0, 0], ambience: 'silence', dark: 0.6,
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
  rooms: [{ id: 'vault_room', name: 'vault', rect: [2, 4, 20, 3], kind: 'special' }],
  anchors: {
    from_aud: [2, 5],
    stair_bottom: [3, 5],
    sarcophagus: [4, 5],
    adair: [5, 5],
    to_breaker: [6, 5],
  },
};
