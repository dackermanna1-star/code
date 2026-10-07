// The words: the notes left round the Ravenhurst, the voices on the
// telephone and the tannoy, the objectives and the hints.
// (An original story: the Ravenhurst Hotel, its night manager Edmund Hale and
// the fire of November 1952 are made up for this place.)

export const NOTES = {
  welcome: {
    title: 'A welcome card',
    text: `<p class="typed">THE RAVENHURST HOTEL<br><small>Est. 1923</small></p>
<p>Welcome, guest of Room <b>313</b>.</p>
<p>Your Night Manager, <b>Mr. E. Hale</b>, is at your service at every hour of the night. Should you require anything at all, simply remain in your room. He will come to you.</p>
<p>Guests are kindly reminded that the hotel <b>does not permit early departures.</b> All accounts are settled at checkout.</p>
<p class="sig">We hope you enjoy your stay. You will be staying for some time.</p>`,
  },
  housekeeper: {
    title: 'A crumpled note',
    text: `<p class="hand">Martha -</p>
<p class="hand">Hale has changed the code on the linen room key box AGAIN. The staff key is in there, it opens the stairs and everything else.</p>
<p class="hand">The new code is the time he always comes up. You know the time. Same as the clocks.</p>
<p class="hand">Don't write it down. Burn this.</p>
<p class="hand sig">- J.</p>
<p class="hand small">ps. if the lights start to flicker get in a wardrobe and DON'T MAKE A SOUND</p>`,
  },
  diary: {
    title: 'A page from a diary',
    text: `<p class="child">the tall man with the smiling face stands in the hall when the lites go funny.</p>
<p class="child">mummy says he is the manager and he is looking for guests who want to leave early.</p>
<p class="child">mummy says if he comes we hide in the cubbord and dont breathe. i am very good at not breathing. i can do it for ages.</p>
<p class="child">he can hear you run. walk on the carpet.</p>
<p class="child">mummy didnt come back from the cubbord in the hall.</p>`,
  },
  stairs: {
    title: 'Scrawled on a sheet of hotel paper',
    text: `<p class="scrawl">HE DOESN'T USE THE STAIRS</p>
<p class="scrawl">HE RIDES THE LIFT. WATCH THE DIAL OVER THE DOORS - IT SHOWS WHERE HE IS</p>
<p class="scrawl">THE STAIRS ARE SAFE. THE STAIRS ARE SAFE. THE STAIRS ARE SAFE</p>
<p class="scrawl small">the front doors are chained. 3 nights I've been on the stairs</p>`,
  },
  register: {
    title: 'The guest register',
    text: (name) => `<p class="typed">GUEST REGISTER - NOVEMBER 1952</p>
<table class="reg"><tr><th>Room</th><th>Guest</th><th>Arrived</th><th>Departed</th></tr>
<tr><td>301</td><td>Mr. &amp; Mrs. A. Whitlock</td><td>3:33 a.m.</td><td class="red">CHECKED OUT</td></tr>
<tr><td>302</td><td>Mr. P. Lowell</td><td>3:33 a.m.</td><td class="red">-</td></tr>
<tr><td>305</td><td>Miss D. Ashford</td><td>3:33 a.m.</td><td class="red">CHECKED OUT</td></tr>
<tr><td>309</td><td>Mrs. R. Kane &amp; daughter</td><td>3:33 a.m.</td><td class="red">CHECKED OUT</td></tr>
<tr><td>311</td><td>Mr. H. Moss</td><td>3:33 a.m.</td><td class="red">-</td></tr>
<tr><td><b>313</b></td><td><b class="hand">${name}</b></td><td>3:33 a.m.</td><td class="red">&nbsp;</td></tr></table>
<p class="small">Signed in, in your own handwriting. You don't remember signing it.</p>`,
  },
  letter: {
    title: "A letter on Hale's desk",
    text: `<p class="typed">To the Board of the Ravenhurst Hotel,</p>
<p class="typed">For thirty-one years I have kept this house. I have never once allowed a guest to leave with an account unsettled, and I shall not begin now, whatever the Board may say about "modern management".</p>
<p class="typed">The guests have been restless. They try the doors at night. Therefore I have <b>removed the three main fuses</b>. In the dark they cannot find the way out, and they sleep the sounder for it.</p>
<p class="typed">I have also seen to the front doors.</p>
<p class="typed">I remain, as ever, your Night Manager,</p>
<p class="sig hand">Edmund Hale</p>`,
  },
  clipping: {
    title: 'A newspaper clipping',
    text: `<p class="typed big">FIRE AT THE RAVENHURST - FOURTEEN DEAD</p>
<p class="typed">Nov. 15, 1952. Fire swept through the second floor of the Ravenhurst Hotel in the early hours of Saturday, at or about 3:33 a.m. according to the stopped lobby clock.</p>
<p class="typed">Firemen were delayed in entering the building: <b>the front doors had been chained shut from the inside.</b> Survivors spoke of a tall figure in a white mask walking the corridors as the guests tried to escape.</p>
<p class="typed">The hotel's night manager, Mr. Edmund Hale, 58, is missing. His body has not been recovered.</p>`,
  },
  maintenance: {
    title: 'The maintenance log',
    text: `<p class="typed">MAINTENANCE LOG - ELECTRICAL</p>
<p class="hand">Nov 14 - Mr. Hale came down and took out all three main fuses. Said the guests "sleep better in the dark". I told him it isn't safe. He smiled at me. He doesn't stop smiling.</p>
<p class="hand">He hid them: one in his office, one in the cold store, one with the piano in the ballroom. He said if I put them back he'd "see to me".</p>
<p class="hand">Three fuses in the box, then throw the main lever. The basement security door runs off the main. No power, no basement.</p>
<p class="hand sig">- F. Doyle</p>`,
  },
  chef: {
    title: "A note pinned in the kitchen",
    text: `<p class="hand">To whoever's on breakfast -</p>
<p class="hand">Somebody keeps leaving the cold store door open at 3:33 every night. And there are things on the hooks that I did not order and I am NOT cooking.</p>
<p class="hand">Hale's put a fuse in a box on the back shelf in there, God knows why. Don't touch it, he counts them.</p>
<p class="hand sig">- Chef Laurent (leaving tonight)</p>`,
  },
  programme: {
    title: 'A dance card',
    text: `<p class="typed big">THE RAVENHURST WINTER BALL</p>
<p class="typed">Friday 14th November 1952 - The Grand Ballroom</p>
<p class="typed">Music by the Lucien Dance Orchestra<br>Supper at midnight - Carriages at three</p>
<p class="typed">Waltz... Foxtrot... Waltz... Quickstep... Waltz...</p>
<p class="typed"><i>The last dance is reserved for the Night Manager.</i></p>
<p class="small hand">The orchestra never stopped playing. Listen.</p>`,
  },
  workshop: {
    title: 'A note on the workbench',
    text: `<p class="hand">Lent the long bolt cutters to Mr. Hale - he says he wants them "for the front door chain".</p>
<p class="hand">He took them down to the boiler room. He sits down there in front of the furnace when he isn't walking the floors.</p>
<p class="hand">If you need them back, God help you, go when he's upstairs.</p>
<p class="hand sig">- F.D.</p>`,
  },
  basement: {
    title: 'Written on the wall',
    noMesh: true,
    text: `<p class="scrawl big">EVERY GUEST IS WELCOME</p><p class="scrawl big">NO GUEST MAY LEAVE</p>`,
  },
};

export const LINES = {
  phone: [
    [0.6, 'Good evening, Room three-thirteen. This is the front desk.'],
    [4.4, "I'm afraid you have... overstayed."],
    [7.8, 'Please remain in your room. The Night Manager will be up to see you shortly.'],
    [12.5, '(click)'],
  ],
  pa: [
    [0.5, 'Good evening, ladies and gentlemen, and welcome back to the Ravenhurst.'],
    [5.2, 'We apologise for the... interruption to the power.'],
    [9.0, 'A guest has been tampering with the hotel\'s fixtures. The Night Manager is attending to it personally.'],
    [15.0, 'Please remain in your rooms.'],
  ],
};

export const OBJ = {
  phone: 'Answer the telephone',
  flashlight: 'Take the flashlight from the nightstand',
  leave: 'Find a way out of the hotel',
  stairsLocked: 'The stairwell door needs a staff key. Search the third floor',
  keybox: 'Open the key box in the Linen Room (it needs a code)',
  hide: 'HIDE',
  sneak: 'Get to the stairwell at the west end of the corridor',
  down: 'Go down to the ground floor',
  lobby: 'Find the way out through the lobby',
  chain: 'The front doors are chained. Find something to cut the chain',
  power: 'The basement needs power. Find the three fuses (0/3)',
  lever: 'Put the fuses in the fuse box and throw the lever',
  basement: 'Go down to the basement and find the bolt cutters',
  boiler: 'Find the bolt cutters in the boiler room',
  run: 'RUN. Get to the front doors',
  cut: 'Cut the chain',
};
