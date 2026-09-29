import * as THREE from 'three';
import { Engine, QualityLevel } from '../core/Engine';
import { CameraRig, shot, Shot } from '../core/CameraRig';
import { Input } from '../core/Input';
import { TextureBaker } from '../render/TextureBaker';
import { MaterialLib } from '../world/Materials';
import { Restaurant } from '../world/Restaurant';
import { FoodKit } from '../food/FoodKit';
import { Particles } from '../fx/Particles';
import { AudioEngine } from '../audio/AudioEngine';
import { UI, UIHost } from '../ui/UI';
import { IconRenderer } from '../ui/Icons';
import { Screens, DaySummary, weekday } from '../ui/Screens';
import { CustomerManager } from './CustomerManager';
import { OrderBook } from './OrderBook';
import { Progression, UPGRADES, DECOR, UpgradeId, DecorId, RANK_TITLES } from './Progression';
import { Warmer } from '../stations/Warmer';
import { OrderStation } from '../stations/OrderStation';
import { GrillStation } from '../stations/GrillStation';
import { BuildStation } from '../stations/BuildStation';
import { ServeStation, ServeResult } from '../stations/ServeStation';
import type { Station } from '../stations/Station';
import type { GameContext, StationId } from './Context';
import type { Customer, EmoteKind } from './Customer';
import type { Order } from './Order';
import { Decor } from '../world/Decor';
import { CustomerDef } from '../characters/Roster';
import { DOOR, ROOM } from '../world/Layout';
import { Ease, clamp, rand } from '../core/math';
import type { Customization } from '../world/Structure';

type GameState = 'boot' | 'title' | 'intro' | 'day' | 'closing' | 'summary' | 'shop';

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21.5;

export class Game implements UIHost {
  engine!: Engine;
  rig!: CameraRig;
  input!: Input;
  baker!: TextureBaker;
  mats!: MaterialLib;
  world!: Restaurant;
  food!: FoodKit;
  fx!: Particles;
  audio = new AudioEngine();
  ui!: UI;
  icons!: IconRenderer;
  progress = new Progression();
  orders = new OrderBook();
  customers!: CustomerManager;
  warmer!: Warmer;
  decor!: Decor;
  stations!: { order: OrderStation; grill: GrillStation; build: BuildStation; serve: ServeStation };
  ctx!: GameContext;
  state: GameState = 'boot';
  station: StationId = 'order';
  private dayTime = 0;
  private dayLength = 300;
  private schedule: { def: CustomerDef; at: number; spawned: boolean }[] = [];
  private dayStats = { served: 0, total: 0, tips: 0, sales: 0, perfect: 0, best: null as null | { name: string; score: number; def: CustomerDef }, xpBefore: 0, rankBefore: 1 };
  private paused = false;
  private titleT = 0;
  private dayHour = OPEN_HOUR;
  private transitioning = false;
  private pendingRankUp: number[] = [];

  async boot() {
    const loading = Screens.loading();
    const step = async (p: number, label?: string) => {
      loading.set(p, label);
      await new Promise((r) => setTimeout(r, 16));
    };
    await step(0.02, 'Warming up the kitchen…');
    try {
      await Promise.all([document.fonts.load('700 40px "Fredoka Variable"'), document.fonts.load('700 20px "Nunito Variable"')]);
    } catch {
      /* fonts optional */
    }
    const s = this.progress.data.settings;
    const testMode = new URLSearchParams(location.search).has('test');
    const quality: QualityLevel = testMode ? 'low' : s.quality === 'auto' ? this.detectQuality() : s.quality;
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.engine = new Engine(canvas, quality);
    this.engine.autoQuality = s.quality === 'auto' && !testMode;
    this.engine.paused = false;
    if (testMode) {
      this.engine.fixedStep = 1 / 15;
      (this.engine.quality as any).pixelRatio = 0.6;
      this.engine.resize();
    }
    await step(0.08, 'Baking textures…');
    this.baker = new TextureBaker(this.engine.renderer);
    this.mats = new MaterialLib(this.baker);
    await step(0.14, 'Building the diner…');
    this.world = new Restaurant(this.engine, this.mats, this.progress.data.custom);
    await step(0.42, 'Chopping lettuce…');
    this.food = new FoodKit(this.baker);
    await step(0.55, 'Plating icons…');
    this.icons = new IconRenderer(this.engine.renderer, this.engine.scene.environment);
    this.icons.buildFood(this.food);
    await step(0.66, 'Setting the tables…');
    this.fx = new Particles(this.engine.scene);
    this.fx.density = this.engine.quality.particles;
    this.rig = new CameraRig(this.engine.camera, this.titleShot(0));
    this.input = new Input(canvas, this.engine.camera);
    this.warmer = new Warmer(this.mats, this.progress.warmerSlots);
    this.world.root.add(this.warmer.root);
    this.ui = new UI(this, this.icons, this.audio, this.orders, this.progress);
    this.ui.camera = this.engine.camera;
    this.customers = new CustomerManager(this.world.root, {
      now: () => this.dayTime,
      openDoor: () => this.world.openDoor(),
      path: (a, b) => this.customers.path(a, b),
      emote: (c, k) => this.ui.speech.emote(c, k),
      say: (c, text, mood, dur) => {
        this.ui.speech.say(c, text, { duration: dur, mood: mood === 'angry' ? 'angry' : 'neutral' });
        this.audio.voice(c.def.p, mood, Math.min(1.4, 0.4 + text.length * 0.035));
      },
      footstep: (c) => this.footstep(c),
      crumbs: (p) => this.fx.burst('drop', p, 3, { color: 0xd9a55f, size: 0.006, floor: 0.77 }),
      comfort: () => this.progress.comfort,
      later: (sec, fn) => void this.engine.tweens.wait(sec).then(fn),
    });
    this.orders.onChange = () => this.ui.refreshTickets();
    this.ctx = this.makeContext();
    await step(0.74, 'Hiring the staff…');
    this.stations = {
      order: new OrderStation(this.ctx),
      grill: new GrillStation(this.ctx),
      build: new BuildStation(this.ctx),
      serve: new ServeStation(this.ctx),
    };
    this.stations.build.onComplete = (order, stack, tray) => {
      this.stations.serve.addReady(order, stack, tray);
      this.ui.tutorialEvent('burger-done');
    };
    this.stations.serve.onServed = (r) => this.onServed(r);
    this.decor = new Decor(this.world, this.mats, this.customers);
    this.decor.apply(this.progress.data.decor);
    this.world.onDoorOpen = () => this.audio.play('doorBell', { volume: 0.8 });
    await step(0.82, 'Compiling shaders…');
    this.setupTutorialTargets();
    this.engine.onUpdate((dt, t) => this.update(dt, t));
    this.engine.onUpdate((dt) => this.ui.update(dt), 50, false);
    this.engine.onUpdate((dt) => this.rig.update(dt), 90, true);
    this.input.onPointerMove = (ndc) => this.rig.pointer.copy(ndc);
    this.applySettings();
    this.bindKeys();
    this.world.setHour(19.4, 0);
    this.engine.start();
    try {
      await this.engine.renderer.compileAsync(this.engine.scene, this.engine.camera);
    } catch {
      /* ignore */
    }
    this.baker.disposeTargets();
    await step(1, 'Done!');
    (window as any).__game = this;
    loading.ready(async () => {
      await this.audio.unlock();
      this.applySettings();
      this.toTitle();
    });
    this.state = 'title';
    this.ui.showHud(false);
  }

  private detectQuality(): QualityLevel {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 4;
    if (mobile) return 'low';
    if (cores <= 4) return 'medium';
    return 'high';
  }

  private makeContext(): GameContext {
    const self = this;
    return {
      get engine() {
        return self.engine;
      },
      get scene() {
        return self.engine.scene;
      },
      get rig() {
        return self.rig;
      },
      get input() {
        return self.input;
      },
      get food() {
        return self.food;
      },
      get fx() {
        return self.fx;
      },
      get world() {
        return self.world;
      },
      get customers() {
        return self.customers;
      },
      get orders() {
        return self.orders;
      },
      get audio() {
        return self.audio;
      },
      get ui() {
        return self.ui;
      },
      get progress() {
        return self.progress;
      },
      get warmer() {
        return self.warmer;
      },
      now: () => self.dayTime,
      get station() {
        return self.station;
      },
      goStation: (id: StationId) => self.goStation(id),
      busy: false,
      haptic: (ms = 10) => {
        if (navigator.vibrate && self.progress.data.settings.shake) navigator.vibrate(ms);
      },
    } as GameContext;
  }

  // ------------------------------------------------------------------ title
  private titleShot(t: number): Shot {
    const a = Math.sin(t * 0.05) * 0.5;
    return shot([8.4 + a * 2.2, 1.5 + Math.sin(t * 0.07) * 0.12, 13.4 - a * 0.8], [-2.2 + a * 0.6, 2.5, 5.9], 44);
  }

  toTitle() {
    this.state = 'title';
    this.ui.showHud(false);
    this.ui.clearWorld();
    this.audio.setMusicMode('title');
    this.audio.muffle(false);
    this.world.setHour(19.4, 0);
    this.titleT = 0;
    this.rig.go(this.titleShot(0), 1.2);
    this.ui.screens.titleBack = () => this.toTitle();
    this.ui.screens.title({
      hasSave: this.progress.data.day > 1 || this.progress.data.xp > 0,
      day: this.progress.data.day,
      onPlay: () => this.startDay(),
      onNew: () => {
        this.progress.reset();
        this.world.applyCustomization({ ...defaultsFor(this.progress.data.custom) });
        this.decor.apply([]);
        this.startDay();
      },
      onSettings: () => this.openSettings(() => this.toTitle()),
      onCredits: () => this.ui.screens.credits(() => this.toTitle()),
    });
  }

  // ------------------------------------------------------------------ days
  async startDay() {
    this.ui.screens.close();
    this.state = 'intro';
    const d = this.progress.data;
    this.resetDayState();
    this.world.setHour(OPEN_HOUR, 0);
    this.dayHour = OPEN_HOUR;
    this.audio.setMusicMode('day');
    // fly-in: street → through the door → the counter
    this.transitioning = true;
    this.input.enabled = false;
    await this.rig.go(shot([DOOR.x - 0.4, 1.7, 12.5], [DOOR.x, 1.5, 6], 50), 1.1, { ease: Ease.inOutCubic });
    this.world.openDoor(1.6);
    this.audio.play('cameraWhoosh');
    await this.rig.go(shot([DOOR.x, 1.62, 5.2], [DOOR.x - 1.2, 1.3, 0], 52), 1.0, { ease: Ease.inOutQuad });
    await this.rig.go(this.stations.order.shot, 0.9, { ease: Ease.inOutCubic, arc: 0.1 });
    this.transitioning = false;
    this.input.enabled = true;
    this.station = 'order';
    this.stations.order.enter();
    this.ui.setStation('order');
    this.ui.showHud(true);
    this.ui.screens.dayBanner(d.day, `${weekday(d.day)} · Doors open!`);
    this.audio.play('orderUp', { volume: 0.6 });
    this.state = 'day';
    this.refreshHud();
    if (!d.tutorialDone && d.day === 1 && d.settings.hints) this.ui.tutorial.start();
    this.ui.tutorial.onDone = () => {
      d.tutorialDone = true;
      this.progress.save();
    };
  }

  private resetDayState() {
    this.customers.clear();
    this.orders.clear();
    this.warmer.clear();
    this.warmer.setSlots(this.progress.warmerSlots);
    this.stations.grill.reset();
    this.stations.build.reset();
    this.stations.order.resetDay();
    this.ui.clearWorld();
    this.ui.refreshTickets();
    this.dayTime = 0;
    const sched = this.progress.scheduleDay(this.progress.data.day);
    this.schedule = sched.map((s) => ({ ...s, spawned: false }));
    const last = sched.length ? sched[sched.length - 1].at : 60;
    this.dayLength = Math.max(240, last + 150);
    this.dayStats = { served: 0, total: 0, tips: 0, sales: 0, perfect: 0, best: null, xpBefore: this.progress.data.xp, rankBefore: this.progress.rank };
  }

  private update(dt: number, time: number) {
    if (!this.world) return;
    // world ambience
    this.world.update(dt, time);
    this.decor?.update(dt);
    this.fx.update(dt);
    this.customers.update(dt);
    for (const s of Object.values(this.stations)) s.update(dt);
    // title orbit
    if (this.state === 'title') {
      this.titleT += dt;
      if (!this.rig.transitioning) this.rig.go(this.titleShot(this.titleT), 0);
    }
    if (this.state === 'day' || this.state === 'closing') {
      this.dayTime += dt;
      for (const s of this.schedule) {
        if (!s.spawned && this.dayTime >= s.at) {
          s.spawned = true;
          this.spawn(s.def);
        }
      }
      const frac = clamp(this.dayTime / this.dayLength);
      this.dayHour = OPEN_HOUR + frac * (CLOSE_HOUR - OPEN_HOUR);
      this.world.hour = this.dayHour;
      this.ui.setClock(this.progress.data.day, this.dayHour, frac);
      if (this.state === 'day') this.checkDayEnd();
    } else if (this.state !== 'title') this.world.hour = this.world.hour;
    // audio state
    const waiting = this.customers.list.filter((c) => c.state === 'waiting' || c.state === 'atCounter' || c.state === 'queued').length;
    const busy = clamp(waiting / 4 + this.stations.grill.activeCount / 8);
    const doorOpen = this.world.doorAmount;
    this.audio.update(dt, { customers: this.customers.inRestaurant, hour: this.world.hour, doorOpen, busy: this.state === 'day' ? busy : 0, night: this.world.lighting.night });
    this.fx.setViewport(this.engine.height, this.engine.camera.fov);
    // dust motes in sunbeams
    if (this.engine.quality.level !== 'low' && Math.random() < dt * 6 && this.world.lighting.godRays.group.visible) {
      this.fx.emit('dust', new THREE.Vector3(rand(-6, 6.5), rand(0.4, 2.6), rand(0, 5.8)));
    }
  }

  private spawn(def: CustomerDef) {
    const c = this.customers.spawn(def);
    if (def.special === 'critic') this.ui.toast('🎩 The Food Critic has arrived! Make it perfect…', 'bad');
    if (def.special === 'vip') this.ui.toast('👑 A VIP just walked in!', 'good');
    void c;
  }

  private checkDayEnd() {
    const allSpawned = this.schedule.every((s) => s.spawned);
    if (!allSpawned) return;
    const pending = this.customers.list.some((c) => ['outside', 'toQueue', 'queued', 'atCounter', 'ordering', 'toWait', 'waiting', 'toPickup', 'atPickup'].includes(c.state));
    if (pending || this.stations.serve.serving) return;
    this.endDay();
  }

  private async endDay() {
    this.state = 'closing';
    this.ui.tutorial.stop();
    this.ui.screens.bigBanner('Closing time!', 'Great work today, chef!');
    this.audio.play('levelUp', { volume: 0.6 });
    await this.engine.tweens.wait(2.6);
    this.state = 'summary';
    const d = this.progress.data;
    const earned = this.dayStats.tips + this.dayStats.sales;
    d.stats.bestDay = Math.max(d.stats.bestDay, earned);
    const summary: DaySummary = {
      day: d.day,
      served: this.dayStats.served,
      avg: this.dayStats.served ? this.dayStats.total / this.dayStats.served : 0,
      tips: this.dayStats.tips,
      sales: this.dayStats.sales,
      perfect: this.dayStats.perfect,
      best: this.dayStats.best ? { name: this.dayStats.best.name, score: this.dayStats.best.score, portrait: this.icons.portrait(this.dayStats.best.def) } : undefined,
      xpBefore: this.dayStats.xpBefore,
      xpAfter: d.xp,
      rankBefore: this.dayStats.rankBefore,
      rankAfter: this.progress.rank,
      reputation: this.progress.reputation,
    };
    d.day++;
    this.progress.save();
    this.audio.setMusicMode('summary');
    this.ui.showHud(false);
    this.rig.go(shot([4.8, 2.3, 5.2], [-1, 1.0, 0.5], 52), 1.6);
    this.world.setHour(20.8, 0);
    const showSummary = () =>
      this.ui.screens.summary(summary, {
        onShop: () => this.openShop(showSummary),
        onNext: () => this.startDay(),
      });
    // rank-up showcase first
    for (let r = summary.rankBefore + 1; r <= summary.rankAfter; r++) {
      const u = this.progress.unlocksAt(r);
      await this.ui.screens.unlock(r, u);
      this.stations.build.refreshLocks();
    }
    showSummary();
  }

  private onServed(r: ServeResult) {
    const d = this.progress.data;
    const sale = Math.round((1.5 + 0.15 * (r.order.layers.length + 2)) * 100) / 100;
    d.money = Math.round((d.money + r.tip + sale) * 100) / 100;
    d.xp += r.points;
    d.stats.served++;
    d.stats.tips += r.tip;
    d.stats.totalEarned += r.tip + sale;
    if (r.rating.total >= 97) d.stats.perfect++;
    this.progress.addRating(r.rating.total);
    this.dayStats.served++;
    this.dayStats.total += r.rating.total;
    this.dayStats.tips += r.tip;
    this.dayStats.sales += sale;
    if (r.rating.total >= 97) this.dayStats.perfect++;
    if (!this.dayStats.best || r.rating.total > this.dayStats.best.score) this.dayStats.best = { name: r.customer.def.name, score: r.rating.total, def: r.customer.def };
    this.stations.order.addCoins(Math.max(1, Math.round(r.tip * 2)));
    this.audio.play('register', { delay: 0.1 });
    this.stations.order.openDrawer();
    this.ui.setMoney(d.money, true);
    const before = this.dayStats.rankBefore;
    const now = this.progress.rank;
    if (now > before && !this.pendingRankUp.includes(now)) {
      this.pendingRankUp.push(now);
      this.ui.toast(`⭐ Rank up! You're now a ${RANK_TITLES[now]} — new unlocks tonight!`, 'good');
      this.audio.play('levelUp', { volume: 0.7 });
    }
    this.refreshHud();
    this.progress.save();
  }

  async startBot(skill = 1) {
    const { Bot } = await import('../debug/Bot');
    return new Bot(this, skill);
  }

  refreshHud() {
    const d = this.progress.data;
    this.ui.setMoney(d.money);
    const rp = this.progress.rankProgress();
    this.ui.setRank(rp.rank, this.progress.rankTitle, rp.frac, this.progress.reputation);
  }

  // ------------------------------------------------------------------ stations
  goStation(id: StationId) {
    if (this.state !== 'day' && this.state !== 'closing') return;
    if (id === this.station || this.transitioning || this.stations.serve.serving) return;
    const prev = this.stations[this.station];
    const next = this.stations[id];
    this.input.cancel();
    prev.exit();
    this.station = id;
    this.ui.setStation(id);
    this.audio.play('cameraWhoosh');
    this.transitioning = true;
    this.input.enabled = false;
    this.ui.hoverLabel(null);
    const turning = (prev.id === 'order' || prev.id === 'serve') !== (id === 'order' || id === 'serve');
    this.rig
      .go(next.shot, turning ? 0.62 : 0.45, { ease: Ease.inOutCubic, arc: turning ? 0.25 : 0.05 })
      .then(() => {
        this.transitioning = false;
        this.input.enabled = true;
        next.enter();
      });
  }

  // ------------------------------------------------------------------ UIHost
  onTakeOrder() {
    this.stations.order.takeOrder();
  }
  onStation(id: StationId) {
    this.audio.play('click');
    this.goStation(id);
  }
  onSelectTicket(o: Order) {
    this.audio.play('click');
    if (o.status === 'ready') {
      this.goStation('serve');
      return;
    }
    if (this.stations.build.inProgress && this.orders.activeBuildId !== o.id) {
      this.ui.toast('Finish or trash the current burger first!', 'bad');
      this.audio.play('error');
      return;
    }
    this.orders.selectForBuild(o.id);
    this.ui.refreshBuildTicket();
    if (this.station !== 'build') this.goStation('build');
  }
  onServe(orderId: number) {
    this.stations.serve.serve(orderId);
  }
  onTrashBurger() {
    this.stations.build.trashBurger();
  }
  onPause() {
    this.togglePause(true);
  }
  onToggleMute() {
    return this.audio.toggleMute();
  }
  canServe(orderId: number) {
    const r = this.orders.ready.find((x) => x.order.id === orderId);
    return !!r && this.stations.serve.canServe(r);
  }
  customerMood(o: Order) {
    return this.orders.customerOf(o)?.mood ?? 1;
  }
  customerState(o: Order) {
    return this.orders.customerOf(o)?.state ?? 'gone';
  }
  customerList(): Customer[] {
    return this.customers.list;
  }
  buildStack() {
    return this.stations?.build.stack ?? null;
  }
  guide() {
    return this.progress.level('topping_guide') > 0 || this.ui.tutorialActive || this.progress.data.day <= 2;
  }
  hints() {
    return this.progress.data.settings.hints;
  }

  // ------------------------------------------------------------------ pause / settings / shop
  togglePause(on?: boolean) {
    const want = on ?? !this.paused;
    if (this.state !== 'day' && this.state !== 'closing') return;
    if (want === this.paused) return;
    this.paused = want;
    this.engine.paused = want;
    this.audio.muffle(want);
    if (want) {
      this.input.cancel();
      this.ui.screens.pause({
        onResume: () => this.togglePause(false),
        onSettings: () => this.openSettings(() => this.reopenPause()),
        onHelp: () => this.ui.screens.help(() => this.reopenPause()),
        onQuit: () => {
          this.paused = false;
          this.engine.paused = false;
          this.progress.save();
          this.customers.clear();
          this.orders.clear();
          this.toTitle();
        },
      });
    } else this.ui.screens.close();
  }

  private reopenPause() {
    this.paused = false;
    this.togglePause(true);
  }

  openSettings(back: () => void) {
    this.ui.screens.settings(
      this.progress.data.settings,
      (s) => {
        this.progress.data.settings = s;
        this.applySettings();
        this.progress.save();
      },
      back,
      () => {
        if (confirm('Erase all progress?')) {
          this.progress.reset();
          location.reload();
        }
      },
    );
  }

  private appliedQuality = '';
  applySettings() {
    const s = this.progress.data.settings;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.rig.shakeScale = s.shake ? 1 : 0;
    this.rig.motionScale = s.motion ? 1 : 0.2;
    this.rig.parallax = s.motion ? 1 : 0;
    this.rig.sway = s.motion ? 1 : 0;
    const q = s.quality === 'auto' ? this.engine.quality.level : s.quality;
    this.engine.autoQuality = s.quality === 'auto';
    if (this.appliedQuality && q !== this.appliedQuality) this.engine.applyQuality(q as QualityLevel);
    this.appliedQuality = q;
    if (this.fx) this.fx.density = this.engine.quality.particles;
  }

  openShop(back: () => void) {
    const p = this.progress;
    this.ui.screens.shop({
      onBuyUpgrade: (id: UpgradeId) => {
        const u = UPGRADES.find((x) => x.id === id)!;
        const lvl = p.level(id);
        if (lvl >= u.costs.length) return false;
        const cost = u.costs[lvl];
        if (p.data.money < cost || p.rank < u.ranks[lvl]) return false;
        p.data.money -= cost;
        p.data.upgrades[id] = lvl + 1;
        p.save();
        if (id === 'grill_size') this.stations.grill.buildSlotMarkers();
        return true;
      },
      onBuyDecor: (id: DecorId) => {
        const dd = DECOR.find((x) => x.id === id)!;
        if (p.data.money < dd.cost || p.rank < dd.rank || p.data.decor.includes(id)) return false;
        p.data.money -= dd.cost;
        p.data.decor.push(id);
        p.save();
        this.decor.apply(p.data.decor);
        return true;
      },
      onCustom: (key: keyof Customization, value: number, cost: number) => {
        if (p.data.money < cost) return false;
        p.data.money -= cost;
        if (cost > 0) p.data.owned.push(`${key}:${value}`);
        (p.data.custom as any)[key] = value;
        p.save();
        this.world.applyCustomization({ [key]: value } as Partial<Customization>);
        return true;
      },
      onClose: back,
    });
  }

  // ------------------------------------------------------------------ misc
  private footstep(c: Customer) {
    const d = c.pos.distanceTo(this.engine.camera.position);
    if (d > 9) return;
    const vol = clamp(1.2 - d / 8) * 0.5;
    const pan = clamp((c.pos.x - this.engine.camera.position.x) / 6, -0.8, 0.8);
    this.audio.play('step', { volume: vol, rate: 0.85 + Math.random() * 0.3, pan });
  }

  private setupTutorialTargets() {
    const t = this.ui.tutorial.targets;
    t.place = () => new THREE.Vector3(-3.87, 1.02, -5.46);
    t.flip = () => null;
    t.done = () => this.warmer.root.position.clone().setY(1.05);
    t.build = () => null;
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (this.state === 'day' || this.state === 'closing') this.togglePause();
        return;
      }
      if (k === 'm') {
        this.ui.setMuted(this.audio.toggleMute());
        return;
      }
      if (this.paused || this.state !== 'day') return;
      const map: Record<string, StationId> = { '1': 'order', '2': 'grill', '3': 'build', '4': 'serve' };
      if (map[k]) this.onStation(map[k]);
      if (k === ' ') {
        e.preventDefault();
        if (this.station === 'order') this.onTakeOrder();
        else if (this.station === 'serve') {
          const r = this.orders.ready.find((x) => this.stations.serve.canServe(x));
          if (r) this.onServe(r.order.id);
        }
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'day') this.togglePause(true);
    });
  }

}

function defaultsFor(c: Partial<Customization>): Partial<Customization> {
  return {
    wallColor: c.wallColor ?? 0xf3e3c4,
    floorA: c.floorA ?? 0xf2ede4,
    floorB: c.floorB ?? 0x202027,
    boothColor: c.boothColor ?? 0xc4262e,
    counterColor: c.counterColor ?? 0xf1e6cf,
    accentColor: c.accentColor ?? 0x2bb3a5,
  };
}

void ROOM;
void ({} as EmoteKind);
