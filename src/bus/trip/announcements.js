// =============================================================================
// ONBOARD ANNOUNCEMENTS (shared contract, like src/flight/announcements.js).
//  * The trip director decides WHEN: app.events.emit('trip:announce', { id }).
//  * The audio module plays assets/audio/bus/announcements/<id>.ogg (pre-rendered
//    offline TTS through a coach PA filter) after the chime; fallback speechSynthesis.
//  * The HUD shows `text` as captions (cabin:announcement payload, as in the flight sim).
// speakers: 'driver' (male, handheld PA mic, slightly distorted/close),
//           'system' (automated female next-stop voice, clean).
// chime: 'gong' (two-tone coach PA gong), 'stop' (single next-stop ding), 'none'.
// =============================================================================
export const SPEAKERS = {
  driver: { name: 'Marco, your driver', voice: 'male' },
  system: { name: 'Coastline Express', voice: 'female' },
};

export const ANNOUNCEMENTS = {
  welcome: {
    speaker: 'driver', chime: 'gong',
    text: 'Good afternoon, everybody, and welcome aboard Coastline Express service two-fourteen to Port Solano, travelling via Ridgefield and the Hollow Pass. ' +
      'My name is Marco and I will be your driver today. Our journey time is about two hours, with a short stop at the Hollow Pass summit. ' +
      'Please find your seat and fasten your seatbelt; it is the law on this coach. The toilet is at the middle of the coach, by the second door. Thank you.',
  },
  departing: {
    speaker: 'system', chime: 'gong',
    text: 'This is the Coastline Express service to Port Solano. The doors are closing. Please remain seated while the coach is moving.',
  },
  safety: {
    speaker: 'system', chime: 'none',
    text: 'For your safety, please keep your seatbelt fastened at all times while the coach is in motion. ' +
      'Emergency exits are located at both doors and at the windows marked with a red hammer. In an emergency, use the hammer to break the glass. ' +
      'Free wifi is available on board. The network name is Coastline Guest. Thank you for travelling with Coastline Express.',
  },
  highway: {
    speaker: 'driver', chime: 'gong',
    text: 'Folks, we are now on Highway Nine heading west. It is about twenty-five minutes to our first stop at Ridgefield. ' +
      'Feel free to recline your seat and enjoy the view. If the air conditioning is too cold, you can adjust the nozzle above your seat.',
  },
  next_ridgefield: {
    speaker: 'system', chime: 'stop',
    text: 'Next stop: Ridgefield, Main Street.',
  },
  at_ridgefield: {
    speaker: 'system', chime: 'none',
    text: 'Ridgefield, Main Street. This coach continues to Port Solano Central.',
  },
  mountain: {
    speaker: 'driver', chime: 'gong',
    text: 'Okay, everyone, we are starting the climb up to the Hollow Pass. The road gets a little twisty from here, so please stay seated with your belt on. ' +
      'There is a tunnel on the way up, and the views from the top are worth it.',
  },
  next_reststop: {
    speaker: 'driver', chime: 'gong',
    text: 'We will be stopping at the Hollow Pass rest area in a couple of minutes. We will have ten minutes there. ' +
      'There are restrooms, a small cafe and a viewpoint. Please be back on board on time; I will not wait long.',
  },
  at_reststop: {
    speaker: 'driver', chime: 'gong',
    text: 'Here we are, the Hollow Pass, about five hundred metres above sea level. Ten minutes, folks. Mind the step on the way out.',
  },
  reststop_5min: {
    speaker: 'driver', chime: 'none',
    text: 'Five minutes, everyone. Five minutes.',
  },
  reststop_boarding: {
    speaker: 'driver', chime: 'gong',
    text: 'All aboard for Port Solano, please. We are leaving in one minute.',
  },
  descent: {
    speaker: 'driver', chime: 'gong',
    text: 'We are on our way down the Hollow valley now. In about twenty minutes we will reach the coast. ' +
      'If you are sitting on the right-hand side, you will have the sea on your side all the way into Port Solano.',
  },
  coast: {
    speaker: 'driver', chime: 'gong',
    text: 'And there is the gulf. We will follow the coast road from here, about forty minutes to Port Solano. Looks like we will get a beautiful sunset tonight.',
  },
  next_portsolano: {
    speaker: 'system', chime: 'stop',
    text: 'Next stop: Port Solano Central, the final stop of this service. Please remember to take all your belongings with you.',
  },
  arrived: {
    speaker: 'driver', chime: 'gong',
    text: 'Ladies and gentlemen, welcome to Port Solano Central. This is the final stop. Please wait until the coach has come to a complete stop before you stand up. ' +
      'Luggage from the hold will be unloaded on the right-hand side. Thank you for travelling with Coastline Express, and have a lovely evening.',
  },
  tunnel: {
    speaker: 'system', chime: 'none',
    text: 'Entering the Hollow Tunnel. Please keep your seatbelt fastened.',
  },
  rain: {
    speaker: 'driver', chime: 'gong',
    text: 'Bit of rain coming through, folks. Nothing to worry about, it should clear up once we are over the pass.',
  },
};
export const ANNOUNCEMENT_IDS = Object.keys(ANNOUNCEMENTS);
