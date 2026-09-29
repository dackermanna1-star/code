import * as THREE from 'three';
import { Station } from './Station';
import type { GameContext } from '../game/Context';
import { shot } from '../core/CameraRig';
import { COUNTER, REGISTER } from '../world/Layout';
import { Geo } from '../world/Builder';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';
import { Ease, pick, rand } from '../core/math';
import { generateOrder } from '../game/Order';
import { DONENESS } from '../food/Ingredients';
import type { Customer } from '../game/Customer';

export class OrderStation extends Station {
  readonly id = 'order' as const;
  readonly shot = shot([-1.0, 1.56, -1.82], [-0.5, 1.22, 2.4], 50);
  private printerPaper: THREE.Mesh;
  private drawer: THREE.Group;
  private display: THREE.CanvasTexture;
  private displayCtx: CanvasRenderingContext2D;
  private jarCoins: THREE.InstancedMesh;
  private coinCount = 0;
  taking = false;
  private jarPos = new THREE.Vector3(-0.35, COUNTER.height, -1.05);
  printerPos = new THREE.Vector3(-1.2, COUNTER.height, -1.34);

  constructor(ctx: GameContext) {
    super(ctx);
    const mats = ctx.world.mats;
    const top = COUNTER.height;
    // ------------------------------------------------------------ cash register (retro)
    const reg = new THREE.Group();
    reg.position.copy(REGISTER);
    reg.rotation.y = 0.35;
    this.root.add(reg);
    const shell = mats.phys('regShell', { color: 0xd9dde2, roughness: 0.25, metalness: 0.85, clearcoat: 0.5 });
    const accent = mats.std(0xc4262e, 0.4);
    const base = new THREE.Mesh(Geo.rbox(0.42, 0.1, 0.36, 0.02), shell);
    base.position.y = 0.05;
    reg.add(base);
    this.drawer = new THREE.Group();
    reg.add(this.drawer);
    const drawerBox = new THREE.Mesh(Geo.rbox(0.38, 0.07, 0.3, 0.01), mats.std(0x2b2b2e, 0.5));
    drawerBox.position.set(0, 0.045, 0.02);
    this.drawer.add(drawerBox);
    const keyboard = new THREE.Mesh(Geo.rbox(0.4, 0.14, 0.24, 0.02), shell);
    keyboard.position.set(0, 0.15, -0.03);
    keyboard.rotation.x = -0.35;
    reg.add(keyboard);
    const keyMat = mats.std(0xf6f1e4, 0.4);
    const keyRed = mats.std(0xd84a3a, 0.4);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++) {
        const k = new THREE.Mesh(Geo.rbox(0.045, 0.02, 0.035, 0.006), c === 4 ? keyRed : keyMat);
        k.position.set(-0.13 + c * 0.065, 0.2 + r * 0.013, 0.02 - r * 0.038);
        k.rotation.x = -0.35;
        reg.add(k);
      }
    const head = new THREE.Mesh(Geo.rbox(0.26, 0.12, 0.1, 0.02), shell);
    head.position.set(0, 0.3, -0.12);
    reg.add(head);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    this.displayCtx = c.getContext('2d')!;
    this.display = new THREE.CanvasTexture(c);
    this.display.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(Geo.plane(0.22, 0.055), new THREE.MeshStandardMaterial({ map: this.display, emissive: 0xffffff, emissiveMap: this.display, emissiveIntensity: 1.1 }));
    disp.position.set(0, 0.31, -0.069);
    reg.add(disp);
    this.setDisplay('WELCOME!');
    const brand = new THREE.Mesh(Geo.box(0.12, 0.018, 0.002), accent);
    brand.position.set(0, 0.255, -0.069);
    reg.add(brand);
    reg.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });

    // ------------------------------------------------------------ ticket printer
    const pr = new THREE.Group();
    pr.position.copy(this.printerPos);
    pr.rotation.y = 0.15;
    this.root.add(pr);
    const prBody = new THREE.Mesh(Geo.rbox(0.18, 0.1, 0.2, 0.025), mats.std(0x2b2b30, 0.45));
    prBody.position.y = 0.05;
    prBody.castShadow = true;
    pr.add(prBody);
    const slot = new THREE.Mesh(Geo.box(0.12, 0.006, 0.02), mats.std(0x111111, 0.6));
    slot.position.set(0, 0.098, 0.05);
    pr.add(slot);
    const led = new THREE.Mesh(Geo.sphere(0.006, 8, 6), mats.emissive(0x3aff7a, 3, 'led'));
    led.position.set(0.065, 0.08, 0.1);
    pr.add(led);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.8, side: THREE.DoubleSide });
    this.printerPaper = new THREE.Mesh(Geo.plane(0.1, 1), paperMat);
    this.printerPaper.position.set(0, 0.1, 0.05);
    this.printerPaper.rotation.x = -Math.PI / 2 + 0.25;
    this.printerPaper.scale.y = 0.001;
    this.printerPaper.geometry = this.printerPaper.geometry.clone().translate(0, 0.5, 0);
    pr.add(this.printerPaper);

    // ------------------------------------------------------------ tip jar
    const jar = new THREE.Group();
    jar.position.copy(this.jarPos);
    this.root.add(jar);
    const glass = new THREE.Mesh(
      Geo.lathe('jar', [[0, 0], [0.06, 0], [0.065, 0.01], [0.065, 0.14], [0.055, 0.16], [0.05, 0.175], [0.052, 0.18]], 28),
      mats.phys('jarGlassTip', { color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.28, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    );
    glass.renderOrder = 6;
    jar.add(glass);
    const tipLabel = canvasTexture(256, 96, (cx, w, h) => {
      cx.fillStyle = '#ffd35a';
      cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#7a1414';
      cx.font = `700 52px ${FONT_DISPLAY}`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText('TIPS ♥', w / 2, h / 2 + 3);
    });
    const lab = new THREE.Mesh(Geo.cyl(0.066, 0.066, 0.04, 24, true), new THREE.MeshStandardMaterial({ map: tipLabel, roughness: 0.6, side: THREE.DoubleSide }));
    lab.position.y = 0.1;
    lab.rotation.y = Math.PI;
    jar.add(lab);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xe8c25a, metalness: 1, roughness: 0.25 });
    this.jarCoins = new THREE.InstancedMesh(Geo.cyl(0.012, 0.012, 0.003, 14), coinMat, 160);
    this.jarCoins.count = 0;
    this.jarCoins.castShadow = true;
    jar.add(this.jarCoins);

    // ------------------------------------------------------------ small props
    const bell = new THREE.Group();
    bell.position.set(-0.75, top, -0.98);
    this.root.add(bell);
    bell.add(new THREE.Mesh(Geo.cyl(0.045, 0.05, 0.012, 20), mats.std(0x2b2b2e, 0.4)));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.chrome);
    dome.position.y = 0.01;
    bell.add(dome);
    const nub = new THREE.Mesh(Geo.cyl(0.006, 0.006, 0.02, 8), mats.chrome);
    nub.position.y = 0.055;
    bell.add(nub);
    // napkins + straws
    const nap = new THREE.Mesh(Geo.rbox(0.12, 0.14, 0.09, 0.012), mats.chrome);
    nap.position.set(-2.1, top + 0.07, -1.05);
    nap.castShadow = true;
    this.root.add(nap);
    const straws = new THREE.Mesh(Geo.cyl(0.035, 0.03, 0.14, 16, true), mats.phys('strawGlass', { color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05 }));
    straws.position.set(-2.35, top + 0.07, -1.08);
    this.root.add(straws);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(Geo.cyl(0.003, 0.003, 0.2, 5), mats.std(i % 2 ? 0xc4262e : 0xffffff, 0.5));
      s.position.set(-2.35 + rand(-0.02, 0.02), top + 0.12, -1.08 + rand(-0.02, 0.02));
      s.rotation.set(rand(-0.15, 0.15), 0, rand(-0.15, 0.15));
      this.root.add(s);
    }
    ctx.world.root.add(this.root);
  }

  private setDisplay(text: string) {
    const c = this.displayCtx;
    c.fillStyle = '#0b1a10';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#6dff9a';
    c.font = `700 34px ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 34);
    this.display.needsUpdate = true;
  }

  update(dt: number) {
    const c = this.ctx.customers.atCounter;
    const show = !!c && !this.taking;
    this.ctx.ui.takeOrder.set(show, c ? c.bubbleAnchor() : null);
    this.ctx.ui.stationAlert('order', show ? 1 : 0);
    void dt;
  }

  /** Customer at the counter tells us their order; a ticket prints. */
  async takeOrder(): Promise<void> {
    const c = this.ctx.customers.atCounter;
    if (!c || this.taking) return;
    this.taking = true;
    const ctx = this.ctx;
    const fast = ctx.progress.level('fast_printer') > 0 ? 0.6 : 1;
    ctx.ui.takeOrder.set(false, null);
    ctx.audio.play('click');
    c.state = 'ordering';
    c.lookAt = ctx.engine.camera.position.clone();
    c.gesture('talk');
    c.setExpression('happy');
    const { bun, layers } = generateOrder(c.def, { rank: ctx.progress.rank, day: ctx.progress.data.day }, (ctx.progress.data.day >> 2) % 2);
    if (this.active) ctx.rig.setNudge(new THREE.Vector3(0.0, -0.03, 0.12));
    // greeting
    ctx.ui.speech.say(c, pick(c.def.lines.hello), { duration: 1.6 * fast });
    ctx.audio.voice(c.def.p, 'neutral', 1.1 * fast);
    await ctx.engine.tweens.wait(1.25 * fast);
    // order reveal + ticket printing
    const items = [bun + ':bottom', ...layers.map((l) => l.id + (l.doneness ? ':' + l.doneness : '')), bun + ':top'];
    ctx.ui.speech.order(c, bun, layers, 0.2 * fast);
    ctx.audio.voice(c.def.p, 'neutral', items.length * 0.2 * fast);
    this.setDisplay(`TICKET #${ctx.orders.orders.length + 1}`);
    ctx.audio.play('printer', { volume: 0.7 });
    await ctx.engine.tweens.run(items.length * 0.2 * fast + 0.25, (e) => {
      this.printerPaper.scale.y = 0.001 + e * 0.12;
    }).done;
    ctx.audio.play('tear', { volume: 0.8 });
    const order = ctx.orders.create(c, bun, layers, ctx.now());
    // ticket flies to the rail
    const from = ctx.ui.project(this.printerPos.clone().setY(this.printerPos.y + 0.18));
    ctx.ui.flyTicket(order, from.x, from.y);
    this.printerPaper.scale.y = 0.001;
    ctx.rig.setNudge(null);
    await ctx.engine.tweens.wait(0.35 * fast);
    ctx.ui.speech.say(c, pick(['Thanks!', 'Cheers!', "Can't wait!", 'Yum!', 'Thank you!']), { duration: 1.2 });
    c.gesture('thumbsUp', 1.2);
    ctx.customers.sendToWait(c);
    this.setDisplay('WELCOME!');
    this.taking = false;
    // the tutorial's grilling tips name this ticket's doneness
    const firstPatty = layers.find((l) => l.doneness);
    if (firstPatty?.doneness && ctx.ui.tutorial.step?.id === 'order') {
      ctx.ui.tutorial.vars.DONENESS = DONENESS[firstPatty.doneness].label.toUpperCase();
      ctx.ui.tutorial.vars.zone = { rare: 'red', medium: 'orange', well: 'brown' }[firstPatty.doneness];
    }
    ctx.ui.tutorialEvent('order-taken');
  }

  /** Coins drop into the tip jar. */
  addCoins(n: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n && this.coinCount < 160; i++) {
      const k = this.coinCount++;
      const layer = Math.floor(k / 9);
      const a = (k % 9) * 0.7 + layer;
      const r = 0.03 + ((k * 37) % 10) * 0.002;
      q.setFromEuler(new THREE.Euler(rand(-0.4, 0.4), rand(0, 6), rand(-0.4, 0.4)));
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0.006 + layer * 0.004, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1));
      this.jarCoins.setMatrixAt(k, m);
    }
    this.jarCoins.count = this.coinCount;
    this.jarCoins.instanceMatrix.needsUpdate = true;
  }

  get jarWorld() {
    return this.jarPos.clone().setY(this.jarPos.y + 0.12);
  }

  openDrawer() {
    const tw = this.ctx.engine.tweens;
    tw.run(0.18, (e) => (this.drawer.position.z = e * 0.12), { ease: Ease.outBack }).done.then(() =>
      tw.run(0.35, (e) => (this.drawer.position.z = 0.12 * (1 - e)), { delay: 0.6, ease: Ease.inOutQuad }),
    );
  }

  resetDay() {
    this.coinCount = 0;
    this.jarCoins.count = 0;
    this.taking = false;
  }

  enter() {
    super.enter();
    this.ctx.ui.tutorialEvent('at-order');
  }
  exit() {
    super.exit();
  }
  customerAtCounter(): Customer | null {
    return this.ctx.customers.atCounter;
  }
}
