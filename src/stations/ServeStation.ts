import * as THREE from 'three';
import { Station } from './Station';
import type { GameContext } from '../game/Context';
import { shot } from '../core/CameraRig';
import { COUNTER, PICKUP, SPOTS } from '../world/Layout';
import { Geo } from '../world/Builder';
import { Ease, pick, rand } from '../core/math';
import type { Order } from '../game/Order';
import type { BurgerStack } from '../food/BurgerStack';
import { combine, computeTip, scoreBuild, scoreGrill, scoreWait, Rating } from '../game/Scoring';
import type { ReadyBurger } from '../game/OrderBook';
import type { Customer } from '../game/Customer';

export const PICKUP_SLOTS = [1.55, 1.95, 2.45, 2.85];

export interface ServeResult {
  order: Order;
  customer: Customer;
  rating: Rating;
  tip: number;
  points: number;
}

export class ServeStation extends Station {
  readonly id = 'serve' as const;
  readonly shot = shot([2.2, 1.52, -2.3], [2.2, 1.22, 0.2], 46);
  // customer framed in the left third; the rating panel slides in on the right
  private closeShot = shot([2.3, 1.46, -1.95], [1.85, 1.3, -0.3], 40);
  private bell: THREE.Group;
  serving = false;
  onServed?: (r: ServeResult) => void;

  constructor(ctx: GameContext) {
    super(ctx);
    const mats = ctx.world.mats;
    const top = COUNTER.height;
    // heat lamp housing over the pickup window
    const lamp = new THREE.Group();
    lamp.position.set(2.2, 2.02, -1.2);
    this.root.add(lamp);
    const housing = new THREE.Mesh(Geo.rbox(1.6, 0.07, 0.24, 0.02), mats.steel);
    lamp.add(housing);
    const glow = new THREE.Mesh(Geo.box(1.45, 0.012, 0.12), mats.emissive(0xff4a1c, 2.6, 'pickupLamp'));
    glow.position.y = -0.04;
    lamp.add(glow);
    for (const x of [-0.72, 0.72]) {
      const rod = new THREE.Mesh(Geo.cyl(0.01, 0.01, 1.3, 8), mats.chrome);
      rod.position.set(x, 0.65, 0);
      lamp.add(rod);
    }
    // order-up bell
    this.bell = new THREE.Group();
    this.bell.position.copy(PICKUP.bell);
    this.root.add(this.bell);
    this.bell.add(new THREE.Mesh(Geo.cyl(0.045, 0.05, 0.012, 20), mats.std(0x2b2b2e, 0.4)));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.phys('brassBell', { color: 0xd8b04a, metalness: 1, roughness: 0.2 }));
    dome.position.y = 0.012;
    this.bell.add(dome);
    // "PICK UP" floor decal on the customer side
    void top;
    this.interactives.push({
      object: this.bell,
      cursor: 'pointer',
      onClick: () => this.ringBell(),
    });
    ctx.world.root.add(this.root);
  }

  ringBell() {
    this.ctx.audio.play('orderUp');
    const d = this.bell.children[1];
    this.ctx.engine.tweens.run(0.2, (_e, raw) => (d.position.y = 0.012 - Math.sin(raw * Math.PI) * 0.008));
  }

  /** Place a finished burger (with its tray) on the pickup counter. */
  addReady(order: Order | null, stack: BurgerStack, tray: THREE.Group) {
    const ctx = this.ctx;
    // no ticket, or its customer is no longer around to eat it
    if (!order || order.status === 'void') {
      stack.dispose();
      tray.removeFromParent();
      return;
    }
    let slot = ctx.orders.freePickupSlot(PICKUP_SLOTS.length);
    if (slot < 0) slot = 0;
    tray.position.set(PICKUP_SLOTS[slot], PICKUP.tray.y, PICKUP.tray.z);
    tray.rotation.set(0, rand(-0.08, 0.08), 0);
    this.root.add(tray);
    const r: ReadyBurger = { order, stack, tray, slot };
    ctx.orders.markReady(order, r);
    // pop-in
    tray.scale.setScalar(0.01);
    ctx.engine.tweens.run(0.35, (e) => tray.scale.setScalar(e), { ease: Ease.outBack });
    ctx.audio.play('orderUp', { volume: 0.7, delay: 0.1 });
    // call the customer
    const c = ctx.orders.customerOf(order);
    if (c && (c.state === 'waiting' || c.state === 'toWait')) {
      ctx.ui.speech.say(c, pick(['Is that mine?!', 'Ooh, smells amazing!', 'Coming!', 'Finally!', 'Yes!']), { duration: 1.4 });
      ctx.customers.callToPickup(c).then(() => ctx.ui.refreshServe());
    }
    ctx.ui.refreshServe();
    ctx.ui.toast(`#${order.ticket} is ready for pickup!`, 'info');
  }

  update(_dt: number) {
    const ready = this.ctx.orders.ready;
    const waitingHere = ready.some((r) => this.ctx.orders.customerOf(r.order)?.state === 'atPickup');
    this.ctx.ui.stationAlert('serve', waitingHere ? 1 : 0);
    if (this.active) {
      for (const r of ready) {
        const p = r.tray.position.clone().setY(r.tray.position.y + 0.26);
        const s = this.ctx.ui.project(p);
        this.ctx.ui.serveButtons.place(r.order.id, s.x, s.y, !s.behind);
      }
    }
  }

  canServe(r: ReadyBurger): boolean {
    const c = this.ctx.orders.customerOf(r.order);
    return !!c && c.state === 'atPickup' && !this.serving;
  }

  /** The big moment: hand over the food, get rated and tipped. */
  async serve(orderId: number): Promise<void> {
    const ctx = this.ctx;
    const r = ctx.orders.ready.find((x) => x.order.id === orderId);
    if (!r || !this.canServe(r)) return;
    const c = ctx.orders.customerOf(r.order)!;
    this.serving = true;
    ctx.busy = true;
    ctx.orders.takeReady(orderId);
    ctx.ui.refreshServe();
    ctx.audio.play('click');
    c.servedAt = ctx.now();
    // --- rating
    const built = r.stack.toBuilt();
    const wait = scoreWait(c.waitTime(), c.def.p.patience, ctx.progress.comfort);
    const grill = scoreGrill(r.order.layers, built.layers);
    const build = scoreBuild(r.order.bun, r.order.layers, built);
    const rating = combine(wait, grill, build, c.def.p.pickiness);
    const layerCount = r.order.layers.length + 2;
    const tip = computeTip(rating.total, layerCount, c.def.p.generosity, ctx.progress.tipMultiplier);
    const points = rating.total;

    // --- cinematic
    const prevShot = this.shot;
    ctx.engine.post.setDof(true);
    ctx.engine.post.dof.target = c.headPos;
    const cam = ctx.rig.go(this.closeShot, 0.7, { ease: Ease.inOutCubic });
    // slide the tray across the counter to the customer
    const tray = r.tray;
    const from = tray.position.clone();
    const to = new THREE.Vector3(SPOTS.pickup.x, from.y, -0.72);
    ctx.audio.play('slide');
    await ctx.engine.tweens.run(0.45, (e) => tray.position.lerpVectors(from, to, e), { ease: Ease.inOutCubic }).done;
    // customer grabs it
    c.gesture('hold');
    c.lookAt = tray.position.clone().setY(tray.position.y + 0.1);
    c.model.rig.chest.attach(tray);
    await ctx.engine.tweens.run(0.35, (e) => {
      tray.position.lerp(new THREE.Vector3(0, -0.02, 0.36), e);
      tray.rotation.set(0.05 * e, 0, 0);
    }).done;
    await cam;
    c.lookAt = ctx.engine.camera.position.clone();
    // reaction
    const t = rating.total;
    let lineKind: 'happy' | 'ok' | 'bad' = 'ok';
    if (t >= 90) {
      c.setExpression('delighted');
      c.gesture('cheer', 1.6);
      lineKind = 'happy';
      ctx.fx.burst('heart', c.bubbleAnchor(), 8, { size: 0.08 });
      ctx.fx.burst('confetti', c.bubbleAnchor(), t >= 97 ? 60 : 24, { floor: 0.02 });
      ctx.audio.play(t >= 97 ? 'perfect' : 'success');
      ctx.audio.voice(c.def.p, 'happy', 1.2);
    } else if (t >= 70) {
      c.setExpression('happy');
      c.gesture('thumbsUp', 1.4);
      lineKind = 'happy';
      ctx.fx.burst('star', c.bubbleAnchor(), 6, { size: 0.06 });
      ctx.audio.play('success', { volume: 0.7 });
      ctx.audio.voice(c.def.p, 'happy', 1.0);
    } else if (t >= 50) {
      c.setExpression('neutral');
      c.gesture('shrug', 1.4);
      lineKind = 'ok';
      ctx.audio.voice(c.def.p, 'neutral', 0.9);
      ctx.audio.play('meh');
    } else {
      c.setExpression(t < 30 ? 'angry' : 'disgusted');
      c.gesture(t < 30 ? 'stomp' : 'facepalm', 1.6);
      lineKind = 'bad';
      ctx.ui.speech.emote(c, 'angry');
      ctx.audio.play('fail');
      ctx.audio.voice(c.def.p, 'angry', 1.0);
    }
    ctx.ui.speech.say(c, pick(c.def.lines[lineKind]), { duration: 2.6 });
    // results panel
    ctx.progress.record(c.def.id, rating.total, rating.stars);
    await ctx.ui.showRating(rating, tip, c.def.name, c.def.title, c.def.special);
    this.onServed?.({ order: r.order, customer: c, rating, tip, points });
    ctx.orders.markServed(r.order);
    // hand off: go eat
    c.burger = r.stack;
    ctx.customers.goEat(c, tray);
    ctx.engine.post.setDof(false);
    ctx.engine.post.dof.target = null;
    await ctx.rig.go(prevShot, 0.6);
    this.serving = false;
    ctx.busy = false;
    ctx.ui.refreshServe();
    ctx.ui.tutorialEvent('served');
  }

  enter() {
    super.enter();
    this.ctx.ui.serveButtons.show(true);
    this.ctx.ui.refreshServe();
    this.ctx.ui.tutorialEvent('at-serve');
  }

  exit() {
    super.exit();
    this.ctx.ui.serveButtons.show(false);
  }
}
