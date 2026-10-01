// Alley acoustics: flutter-echo convolver (width follows head yaw vs. the corridor axis),
// diffuse-tail convolver, enclosure scaling, and a dynamic slap-back network (front wall / back fence)
// with crossfaded twin delay lines so large distance jumps never glide audibly.
import { glide, jump, makePanner, setPannerPos, finite, SPEED_OF_SOUND } from './spatial.js';

function monoIn(ctx, gain = 1) {
  const g = ctx.createGain();
  g.channelCount = 1;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  g.gain.value = gain;
  return g;
}

class SlapLine {
  constructor(ctx, input, output, panner) {
    this.ctx = ctx;
    this.dl = [ctx.createDelay(1.0), ctx.createDelay(1.0)];
    this.g = [ctx.createGain(), ctx.createGain()];
    this.g[0].gain.value = 1;
    this.g[1].gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.lp.frequency.value = 4000;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 130;
    this.hp.Q.value = 0.5;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    for (let k = 0; k < 2; k++) {
      input.connect(this.dl[k]);
      this.dl[k].connect(this.g[k]);
      this.g[k].connect(this.lp);
    }
    this.lp.connect(this.hp);
    this.hp.connect(this.level);
    this.level.connect(panner);
    panner.connect(output);
    this.out = this.level;
    this.active = 0;
    this.cur = null;
    this.lastSwitch = -10;
  }
  set(delay, level, cutoff, now) {
    if (this.cur === null) {
      jump(this.dl[0].delayTime, delay, now);
      jump(this.dl[1].delayTime, delay, now);
      this.cur = delay;
    } else {
      const big = Math.abs(delay - this.cur) > Math.max(0.04, 0.2 * this.cur);
      if (big && now - this.lastSwitch > 0.3) {
        const a = this.active;
        const b = 1 - a;
        jump(this.dl[b].delayTime, delay, now);
        this.g[a].gain.cancelScheduledValues(now);
        this.g[a].gain.setTargetAtTime(0, now, 0.045);
        this.g[b].gain.cancelScheduledValues(now);
        this.g[b].gain.setTargetAtTime(1, now, 0.045);
        this.active = b;
        this.lastSwitch = now;
      } else {
        glide(this.dl[this.active].delayTime, delay, now, 0.12);
      }
      this.cur = delay;
    }
    glide(this.level.gain, level, now, 0.1);
    glide(this.lp.frequency, cutoff, now, 0.1);
  }
}

export class Acoustics {
  /**
   * @param ctx AudioContext
   * @param irs { flutter: AudioBuffer, diffuse: AudioBuffer }
   * @param out destination node (pre-master)
   * @param o  { hrtf: boolean }
   */
  constructor(ctx, irs, out, o = {}) {
    this.ctx = ctx;
    this.out = out;
    this.ret = ctx.createGain();
    this.ret.gain.value = 1;
    this.ret.connect(out);

    // ---- flutter convolver + yaw width matrix
    this.flutterIn = monoIn(ctx);
    this.encF = ctx.createGain();
    this.convF = ctx.createConvolver();
    this.convF.normalize = false;
    this.convF.buffer = irs.flutter;
    this.flutterIn.connect(this.encF);
    this.encF.connect(this.convF);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    this.convF.connect(split);
    this.wLL = ctx.createGain(); this.wRL = ctx.createGain(); this.wRR = ctx.createGain(); this.wLR = ctx.createGain();
    split.connect(this.wLL, 0); split.connect(this.wLR, 0);
    split.connect(this.wRR, 1); split.connect(this.wRL, 1);
    this.wLL.connect(merge, 0, 0); this.wRL.connect(merge, 0, 0);
    this.wRR.connect(merge, 0, 1); this.wLR.connect(merge, 0, 1);
    merge.connect(this.ret);
    this._width = -1;
    this.setWidth(1, ctx.currentTime);

    // ---- diffuse tail
    this.diffuseIn = monoIn(ctx);
    this.encD = ctx.createGain();
    this.convD = ctx.createConvolver();
    this.convD.normalize = false;
    this.convD.buffer = irs.diffuse;
    this.diffuseIn.connect(this.encD);
    this.encD.connect(this.convD);
    this.convD.connect(this.ret);

    // ---- slap-back (front wall / back fence+building)
    this.slapIn = monoIn(ctx);
    this.encS = ctx.createGain();
    this.slapIn.connect(this.encS);
    const model = o.hrtf === false ? 'equalpower' : 'HRTF';
    this.panF = makePanner(ctx, model, 1, 0);
    this.panB = makePanner(ctx, model, 1, 0);
    this.front = new SlapLine(ctx, this.encS, this.ret, this.panF);
    this.back = new SlapLine(ctx, this.encS, this.ret, this.panB);
    // a second round trip (front echo travelling on to the back wall and returning, and vice versa)
    this.crossFB = ctx.createGain();
    this.crossBF = ctx.createGain();
    this.crossFB.gain.value = 0.32;
    this.crossBF.gain.value = 0.32;
    this.front.out.connect(this.crossFB);
    this.back.out.connect(this.crossBF);
    // feed into the *other* line's delays
    for (const d of this.back.dl) this.crossFB.connect(d);
    for (const d of this.front.dl) this.crossBF.connect(d);
    // echoes also excite the diffuse field a little
    this.slapToDiffuse = ctx.createGain();
    this.slapToDiffuse.gain.value = 0.25;
    this.front.out.connect(this.slapToDiffuse);
    this.back.out.connect(this.slapToDiffuse);
    this.slapToDiffuse.connect(this.diffuseIn);

    this._enc = -1;
    this.hrtfCount = model === 'HRTF' ? 2 : 0;
    this.lastFront = null;
    this.lastBack = null;
  }

  setWidth(w, t) {
    if (Math.abs(w - this._width) < 0.01) return;
    this._width = w;
    const a = (1 + w) / 2, b = (1 - w) / 2;
    glide(this.wLL.gain, a, t, 0.08); glide(this.wRR.gain, a, t, 0.08);
    glide(this.wRL.gain, b, t, 0.08); glide(this.wLR.gain, b, t, 0.08);
  }

  static echoParams(d) {
    // distance to wall -> slap delay (s), level, low-pass cutoff
    const dd = Math.min(400, Math.max(1, finite(d, 200)));
    const delay = Math.min(0.5, Math.max(0.04, (2 * dd) / SPEED_OF_SOUND));
    // corridor channels sound: falls slower than 1/r; distant walls further attenuated
    let level = 0.62 * Math.pow(8 / (8 + 2 * dd), 0.85);
    if ((2 * dd) / SPEED_OF_SOUND > 0.5) level *= Math.pow(0.5 / ((2 * dd) / SPEED_OF_SOUND), 2); // beyond clamp: fade
    const cutoff = Math.max(1400, 9000 * Math.pow(10 / (10 + dd), 0.55));
    return { delay, level, cutoff };
  }

  /**
   * @param now  ctx time
   * @param lis  { pos, fwd }
   * @param s    { distFront, distBack, enclosure, corridorDir? }
   */
  update(now, lis, s) {
    const enc = Math.min(1, Math.max(0, finite(s.enclosure, 1)));
    if (Math.abs(enc - this._enc) > 0.005) {
      this._enc = enc;
      glide(this.encF.gain, 0.12 + 0.88 * Math.pow(enc, 1.6), now, 0.35);
      glide(this.encD.gain, 0.6 + 0.4 * enc, now, 0.35);
      glide(this.encS.gain, 0.45 + 0.55 * enc, now, 0.35);
    }
    // head yaw relative to the corridor axis (default: alley along Z)
    const cd = s.corridorDir || { x: 0, z: 1 };
    const f = lis.fwd;
    const fh = Math.hypot(f.x, f.z) || 1;
    const ch = Math.hypot(cd.x, cd.z) || 1;
    const along = Math.abs((f.x * cd.x + f.z * cd.z) / (fh * ch));
    this.setWidth(0.15 + 0.85 * along * along, now);

    const pf = Acoustics.echoParams(s.distFront);
    const pb = Acoustics.echoParams(s.distBack);
    this.front.set(pf.delay, pf.level, pf.cutoff, now);
    this.back.set(pb.delay, pb.level, pb.cutoff, now);
    this.lastFront = pf;
    this.lastBack = pb;
    // echo directions: front wall along -corridor, back along +corridor (world space)
    const p = lis.pos;
    const ux = cd.x / ch, uz = cd.z / ch;
    setPannerPos(this.panF, { x: p.x - ux, y: p.y, z: p.z - uz }, now, 0.03);
    setPannerPos(this.panB, { x: p.x + ux, y: p.y, z: p.z + uz }, now, 0.03);
  }
}
