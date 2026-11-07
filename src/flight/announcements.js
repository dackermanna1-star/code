// =============================================================================
// CABIN / FLIGHT-DECK ANNOUNCEMENT SCRIPT — shared contract.
//  * The flight director decides WHEN to play them: app.events.emit('cabin:announce', { id }).
//  * The audio module plays assets/audio/announcements/<id>.ogg (pre-rendered
//    from `text` with an offline neural TTS + PA-system filter), preceded by
//    the chime, and falls back to speechSynthesis if the file is missing.
//  * The HUD shows `text` as subtitles (split by sentences, timed to the audio).
// speakers: 'captain' (male, flight-deck PA – slightly more muffled),
//           'purser'  (female lead flight attendant, cabin handset PA).
// chime: 'pa' (hi-lo two-tone), 'seatbelt' (single), 'triple' (crew call), 'none'.
// =============================================================================

export const SPEAKERS = {
  captain: { name: 'Captain Daniel Reyes', voice: 'male' },
  purser: { name: 'Maya, cabin manager', voice: 'female' },
};

export const ANNOUNCEMENTS = {
  boarding_welcome: {
    speaker: 'purser', chime: 'pa',
    text: 'Good afternoon, ladies and gentlemen, and welcome aboard Halcyon Airways flight four eighty-two, with service to Port Solano. ' +
      'As you find your seat, please stow your carry-on items in the overhead bins or under the seat in front of you. ' +
      'Please keep the aisle clear so that we can complete boarding as quickly as possible. Thank you.',
  },
  captain_welcome: {
    speaker: 'captain', chime: 'pa',
    text: 'Good afternoon, folks, this is Captain Daniel Reyes from the flight deck. On behalf of First Officer Okafor and the entire crew, welcome aboard. ' +
      'We are just finishing up the paperwork and loading the last of the bags. Our flight time this afternoon is planned at two hours and fifty minutes, ' +
      'and we will be cruising at thirty-six thousand feet. The weather en route looks mostly smooth, with a few bumps on the climb out. ' +
      'Sit back, relax, and we will be on our way shortly.',
  },
  doors_closed: {
    speaker: 'purser', chime: 'pa',
    text: 'Ladies and gentlemen, the forward door is now closed. At this time, please make sure your seatbelt is fastened, your seatback is upright, ' +
      'and your tray table is stowed. Portable electronic devices must be switched to flight mode. Thank you.',
  },
  doors_armed: {
    speaker: 'purser', chime: 'none',
    text: 'Cabin crew, arm doors and cross-check.',
  },
  safety_demo: {
    speaker: 'purser', chime: 'pa',
    text: 'Ladies and gentlemen, please direct your attention to the safety demonstration. ' +
      'To fasten your seatbelt, insert the metal fitting into the buckle and tighten the strap. To release, lift the top of the buckle. ' +
      'This aircraft has eight emergency exits: two at the front, four over the wings, and two at the rear. Please take a moment to locate the exit nearest you, keeping in mind it may be behind you. ' +
      'In the event of an emergency, floor-path lighting will guide you to an exit. ' +
      'If cabin pressure changes suddenly, oxygen masks will drop from the panel above. Pull the mask towards you, place it over your nose and mouth, and breathe normally. Secure your own mask before helping others. ' +
      'Your life vest is located under your seat. Do not inflate it until you are outside the aircraft. ' +
      'Smoking, including electronic cigarettes, is prohibited on this flight. Thank you for your attention.',
  },
  fa_takeoff: {
    speaker: 'captain', chime: 'pa',
    text: 'Flight attendants, please be seated for departure.',
  },
  seatbelt_off: {
    speaker: 'purser', chime: 'none',
    text: 'Ladies and gentlemen, the captain has turned off the fasten seatbelt sign, and you may now move about the cabin. ' +
      'However, while seated, we recommend that you keep your seatbelt fastened in case of unexpected turbulence. ' +
      'Our seatback entertainment system is now available, with movies, television, music, and the live flight map. Enjoy your flight.',
  },
  captain_cruise: {
    speaker: 'captain', chime: 'pa',
    text: 'Ladies and gentlemen, this is your captain speaking. We have reached our cruising altitude of thirty-six thousand feet, with a ground speed of about five hundred and ten miles per hour. ' +
      'If you are seated on the left side of the aircraft, you have a nice view of the cloud tops below us. ' +
      'The weather in Port Solano is clear, with a light westerly breeze and a temperature of twenty-four degrees. We expect to arrive a few minutes ahead of schedule. Enjoy the flight.',
  },
  service: {
    speaker: 'purser', chime: 'pa',
    text: 'Ladies and gentlemen, in a few moments we will be coming through the cabin with complimentary beverages and a light snack. ' +
      'For your comfort, our lavatories are located at the front and at the rear of the cabin. Thank you.',
  },
  turbulence: {
    speaker: 'captain', chime: 'seatbelt',
    text: 'Ladies and gentlemen, from the flight deck. We are expecting some light turbulence for the next few minutes, so I have turned on the fasten seatbelt sign. ' +
      'Please return to your seats and keep your seatbelts securely fastened. Thank you.',
  },
  turbulence_over: {
    speaker: 'captain', chime: 'seatbelt',
    text: 'Folks, the ride has smoothed out again, so I have switched off the seatbelt sign. Feel free to move about the cabin.',
  },
  descent_captain: {
    speaker: 'captain', chime: 'pa',
    text: 'Ladies and gentlemen, this is the captain. We have begun our descent into Port Solano and should be on the ground in about twenty minutes. ' +
      'Skies are clear, so those of you on the left side should get a lovely view of the coastline and the city on the way in. ' +
      'The flight attendants will now prepare the cabin for landing. Thank you for flying with us today.',
  },
  descent_purser: {
    speaker: 'purser', chime: 'pa',
    text: 'Ladies and gentlemen, as we prepare for landing, please return to your seats and fasten your seatbelts. ' +
      'Make sure your seatback is in the upright position, your tray table is stowed, your window shade is open, and your carry-on items are stowed under the seat in front of you or in the overhead bins. ' +
      'The lavatories will be closed shortly. Thank you.',
  },
  fa_landing: {
    speaker: 'captain', chime: 'pa',
    text: 'Flight attendants, prepare for landing, please.',
  },
  landing_welcome: {
    speaker: 'purser', chime: 'pa',
    text: 'Ladies and gentlemen, welcome to Port Solano, where the local time is a quarter to seven in the evening. ' +
      'For your safety and the safety of those around you, please remain seated with your seatbelt fastened until the captain has turned off the fasten seatbelt sign. ' +
      'Please use caution when opening the overhead bins, as items may have shifted during the flight.',
  },
  doors_disarm: {
    speaker: 'purser', chime: 'none',
    text: 'Cabin crew, disarm doors and cross-check.',
  },
  farewell: {
    speaker: 'captain', chime: 'pa',
    text: 'Ladies and gentlemen, from the flight deck, welcome to Port Solano. On behalf of the whole crew, thank you for flying Halcyon Airways. We hope you enjoyed the flight, and we look forward to seeing you on board again soon. Have a wonderful evening.',
  },
};

export const ANNOUNCEMENT_IDS = Object.keys(ANNOUNCEMENTS);
