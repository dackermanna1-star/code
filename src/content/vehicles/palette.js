// Period car colours, Moscow 2008, as they look under a film of winter road dirt: muted,
// slightly greyed versions of the factory paints. (Names are the AvtoVAZ/GAZ paint names.)
export const CAR_COLORS = {
  white: 0xd9d8d0,        // белый
  beige: 0xb3a27e,        // «Сафари»
  cherry: 0x55212a,       // «Вишня»
  eggplant: 0x3a2635,     // «Баклажан»
  darkGreen: 0x24392f,    // тёмно-зелёный
  murena: 0x2a5354,       // «Мурена»
  lightBlue: 0x7891a3,    // светло-голубой
  darkBlue: 0x27324a,     // тёмно-синий
  silver: 0xa9acae,       // «Снежная королева»
  quartz: 0x7a7d80,       // «Кварц»
  wetAsphalt: 0x4c5054,   // «Мокрый асфальт»
  black: 0x1a1b1c,        // чёрный
  fadedRed: 0x83332b,     // выцветший красный
  sandYellow: 0xa89a62,   // «Бежевый» старый
}

/** Weighted palette (silver/dark dominate, as in the 2008 car park). */
export const CAR_PALETTE = [
  CAR_COLORS.silver, CAR_COLORS.silver, CAR_COLORS.silver, CAR_COLORS.quartz,
  CAR_COLORS.black, CAR_COLORS.black, CAR_COLORS.wetAsphalt, CAR_COLORS.wetAsphalt,
  CAR_COLORS.white, CAR_COLORS.white, CAR_COLORS.darkBlue, CAR_COLORS.cherry, CAR_COLORS.cherry,
  CAR_COLORS.eggplant, CAR_COLORS.darkGreen, CAR_COLORS.murena, CAR_COLORS.beige,
  CAR_COLORS.lightBlue, CAR_COLORS.fadedRed, CAR_COLORS.sandYellow,
]

/** Colours that suit a given model (older Ladas: more white/beige/faded red). */
export const TYPE_PALETTE = {
  vaz2107: [CAR_COLORS.white, CAR_COLORS.white, CAR_COLORS.cherry, CAR_COLORS.fadedRed, CAR_COLORS.beige, CAR_COLORS.darkBlue, CAR_COLORS.eggplant, CAR_COLORS.lightBlue, CAR_COLORS.darkGreen],
  vaz2106: [CAR_COLORS.white, CAR_COLORS.beige, CAR_COLORS.fadedRed, CAR_COLORS.sandYellow, CAR_COLORS.lightBlue, CAR_COLORS.darkGreen, CAR_COLORS.cherry],
  vaz21099: [CAR_COLORS.wetAsphalt, CAR_COLORS.murena, CAR_COLORS.eggplant, CAR_COLORS.silver, CAR_COLORS.cherry, CAR_COLORS.white],
  vaz2110: [CAR_COLORS.silver, CAR_COLORS.wetAsphalt, CAR_COLORS.darkGreen, CAR_COLORS.quartz, CAR_COLORS.black, CAR_COLORS.eggplant],
  moskvich2141: [CAR_COLORS.white, CAR_COLORS.lightBlue, CAR_COLORS.darkBlue, CAR_COLORS.fadedRed, CAR_COLORS.wetAsphalt],
  volga3110: [CAR_COLORS.black, CAR_COLORS.black, CAR_COLORS.white, CAR_COLORS.silver, CAR_COLORS.darkBlue],
  nexia: [CAR_COLORS.silver, CAR_COLORS.darkGreen, CAR_COLORS.cherry, CAR_COLORS.quartz, CAR_COLORS.black],
  focus: [CAR_COLORS.silver, CAR_COLORS.black, CAR_COLORS.darkBlue, CAR_COLORS.quartz, CAR_COLORS.white],
  gazelle: [CAR_COLORS.white, CAR_COLORS.white, CAR_COLORS.white, 0xd8b03a],
  gazelle_van: [CAR_COLORS.white, CAR_COLORS.white, CAR_COLORS.silver, CAR_COLORS.lightBlue],
  uaz452: [0x59603f, 0x59603f, CAR_COLORS.white, 0x6c7a74, 0x3f4a3a],
}
