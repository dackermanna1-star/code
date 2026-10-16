// Package "phone": the player's period mobile phone (ctx.game.phone) and a shared library of
// Russian texts (notices, ads, graffiti, shop labels, metro and street signs, SMS) with
// helpers that turn them into readable things in the world (see api.js, texts.js).

import { Phone } from './Phone.js'
import { registerPhoneSounds } from './sounds.js'
import { TEXTS, ALL_TEXTS } from './texts.js'
import { buildTestScene } from './testScene.js'
import { handFontsReady, redrawHandTexts } from './api.js'

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()

export default {
  name: 'phone',
  order: 60,

  async build(ctx) {
    // the text library is reachable without importing this package
    ctx.registry.texts = TEXTS
    ctx.registry.allTexts = ALL_TEXTS
    ctx.registry.notices = ctx.registry.notices || []
    // texts placed by earlier packages may have been drawn before the handwriting fonts
    // arrived: wait for them (briefly) and redraw those before the sign atlas is built
    await handFontsReady(6000)
    redrawHandTexts()
    if (params.get('phonetest') === '1') buildTestScene(ctx)
  },

  init(ctx) {
    const phone = new Phone(ctx)
    ctx.game.phone = phone
    ctx.registry.phone = phone
    if (ctx.audio) {
      registerPhoneSounds(ctx.audio)
      // the audio context starts on the first click; register again then in case it was reset
      ctx.events?.on?.('start', () => registerPhoneSounds(ctx.audio))
    }
    // development / screenshot hook: ?phone=open (or a screen name: menu, inbox, msg, contacts,
    // call, unavailable, log, games, snake, settings, ringtones, contrast, dial, sms)
    const want = params.get('phone')
    if (want) {
      phone.show(want === 'open' ? undefined : want)
      phone.anim = 1
      if (params.get('phonelight') === '0') { phone.lastKey = -100; phone.light = 0 }
    }
  },

  update() {
    // Game drives game.phone.update(dt) / handleInput(input, dt) itself.
  },
}
