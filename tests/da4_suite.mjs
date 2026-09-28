// Dead Air ch4: boot/nav report, then the scripted walk (MODE=walk) or bot playthrough (MODE=bots) in one browser.
// node tests/play.mjs tests/da4_suite.mjs
import boot from './da4_boot.mjs';
import play from './da4_play.mjs';
export default async (ctx) => { await boot(ctx); await play(ctx); };
