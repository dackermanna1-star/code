/**
 * Player modes and transitions:
 *   spectator ⇄ ship (spawn/board) ⇄ on foot (exit when landed)
 * plus ship camera modes (cockpit / chase / orbit) and per-mode controls.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { World } from './world';
import type { Input } from './input';
import { SpectatorController } from './spectator';
import { Ship, type ShipClass, type ShipOptions } from './ship';
import { Walker } from './walker';
import type { Body } from '../astro/body';
import { FramedPosition } from './frame';
import { nearestPort, SHIP_PORTS, type DockTarget } from './docking';

/** Docking computer range (m). */
export const DOCK_RANGE = 5000;

export type PlayerMode = 'spectator' | 'ship' | 'walk';
export type ShipView = 'cockpit' | 'chase' | 'orbit';

const _v = new Vector3(), _q = new Quaternion();

export class Player {
  mode: PlayerMode = 'spectator';
  ship: Ship | null = null;
  shipClass: ShipClass = 'scout';
  readonly walker = new Walker();
  shipView: ShipView = 'chase';
  shipOptions: ShipOptions = { realisticFuel: false, damage: false, ftlLimits: false, flightAssist: true };
  /** chase camera smoothing state */
  private chaseQ = new Quaternion();
  private orbitYaw = 0;
  private orbitPitch = 0.25;
  private orbitDist = 2.2;
  cockpitOffset = new Vector3();
  message = '';
  /** parked vessels (a mothership waiting in orbit while its shuttle flies) */
  readonly fleet: Ship[] = [];
  private stationTargets = new Map<string, DockTarget>();
  private fleetTargets = new Map<Ship, DockTarget>();
  onModeChange: (m: PlayerMode) => void = () => {};

  constructor(readonly world: World, readonly input: Input, readonly spectator: SpectatorController) {}

  /** Spawn (or move) the player's ship at the current viewpoint and board it. */
  spawnShip(cls: ShipClass = this.shipClass) {
    const w = this.world;
    this.shipClass = cls;
    const ship = new Ship(cls, this.shipOptions);
    ship.spawnAt(w.view, w);
    // near the ground: start landed on the surface beneath the camera
    const b = w.view.body;
    if (b && b.hasSurface && w.system) {
      const offB = w.view.offsetBodyFixed(new Vector3());
      const ground = w.surfaceRadius(b, offB);
      if (offB.length() - ground < ship.spec.length * 3) {
        ship.frame.rebase('inertial', b);
        const offW = offB.clone().normalize().multiplyScalar(ground + ship.spec.gearHeight).applyQuaternion(w.system.bodyRotation(b));
        ship.frame.local.copy(offW);
        ship.velocity.copy(ship.surfaceVelocity(b, offW, w));
        // level attitude facing the camera's heading
        const up = offW.clone().normalize();
        const fwd = new Vector3(0, 0, -1).applyQuaternion(w.view.worldOrientation(new Quaternion()));
        fwd.addScaledVector(up, -fwd.dot(up)).normalize();
        const right = fwd.clone().cross(up).normalize();
        ship.orient.setFromRotationMatrix(new Matrix4().makeBasis(right, up, fwd.clone().negate()));
        ship.landed = false;
        ship.velocity.addScaledVector(up, -0.5);
      }
    }
    // high above a body: start in a circular prograde orbit instead of at rest
    if (!ship.landed && ship.frame.body && w.system && ship.frame.kind === 'inertial') {
      const bb = ship.frame.body;
      const off = ship.frame.offsetWorld(new Vector3());
      const alt = off.length() - bb.radius;
      const atmTop = bb.planet?.atmosphereRender ? bb.planet.atmosphereRender.topRadius - bb.radius : 0;
      if (alt > Math.max(atmTop * 1.2, 5000) && !bb.isStarLike) {
        const axis = new Vector3(0, 1, 0).applyQuaternion(w.system.bodyRotation(bb));
        let dir = new Vector3().crossVectors(axis, off);
        if (dir.lengthSq() < 1e-6) dir = new Vector3(1, 0, 0).cross(off);
        dir.normalize();
        ship.velocity.copy(dir.multiplyScalar(Math.sqrt(bb.mu / off.length())));
        // point the nose prograde, belly toward the planet
        const up = off.clone().normalize();
        const fwd = ship.velocity.clone().normalize();
        const right = fwd.clone().cross(up).normalize();
        ship.orient.setFromRotationMatrix(new Matrix4().makeBasis(right, up, fwd.clone().negate()));
        ship.hoverAssist = alt < 20000;
      }
    }
    this.ship = ship;
    this.chaseQ.copy(ship.orient);
    this.setMode('ship');
    this.message = `${ship.spec.name} ready`;
  }

  setMode(m: PlayerMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.spectator.cancelTravel();
    this.onModeChange(m);
  }

  toSpectator() {
    this.setMode('spectator');
    this.message = 'Spectator';
  }

  /** Exit the ship onto the surface (only when landed). */
  exitShip() {
    const ship = this.ship;
    const w = this.world;
    if (!ship || !w.system) return;
    if (!ship.landed || !ship.frame.body) {
      this.message = ship.altitude < 50 ? 'Land first (gear down, engines idle)' : 'You can only exit on the ground';
      return;
    }
    const b = ship.frame.body;
    const off = ship.frame.offsetBodyFixed(new Vector3());
    const up = off.clone().normalize();
    const shipRight = new Vector3(1, 0, 0).applyQuaternion(ship.orient).applyQuaternion(w.system.bodyRotation(b, _q).invert());
    const side = shipRight.addScaledVector(up, -shipRight.dot(up)).normalize();
    const p = off.clone().addScaledVector(side, ship.spec.length * 0.45 + 3);
    const dir = p.clone().normalize();
    const g = w.groundInfo(b, dir);
    p.copy(dir).multiplyScalar(Math.max(g.ground, g.liquid > -Infinity ? g.liquid : g.ground));
    this.walker.placeAt(b, p, off.clone().sub(p).negate());
    this.setMode('walk');
    this.message = `On foot · ${b.displayName} · g = ${(b.mu / p.lengthSq()).toFixed(2)} m/s²`;
  }

  boardShip() {
    const ship = this.ship;
    if (!ship || !ship.frame.body || ship.frame.body !== this.walker.body) return false;
    const off = ship.frame.offsetBodyFixed(new Vector3());
    const d = off.distanceTo(this.walker.pos);
    if (d > ship.spec.length * 0.6 + 8) {
      this.message = `Ship is ${d.toFixed(0)} m away`;
      return false;
    }
    this.setMode('ship');
    this.message = 'Boarded';
    return true;
  }

  /** Everything the active ship could dock with in the current system. */
  dockTargets(): DockTarget[] {
    const sys = this.world.system;
    const out: DockTarget[] = [];
    if (sys) for (const b of sys.bodies) {
      if (!b.station) continue;
      let t = this.stationTargets.get(b.id);
      if (!t) {
        t = { id: b.id, name: b.displayName, ports: b.station.ports, radius: b.station.span * 0.55, station: b };
        this.stationTargets.set(b.id, t);
      }
      out.push(t);
    }
    for (const s of this.fleet) {
      const berth = SHIP_PORTS[s.spec.cls].berth;
      if (!berth || s.shuttleAboard || !s.frame.body || s.frame.body.system !== sys || s.landed) continue;
      let t = this.fleetTargets.get(s);
      if (!t) {
        t = { id: `fleet:${s.spec.cls}`, name: s.spec.name, ports: [berth], radius: s.spec.length * 0.6, ship: s };
        this.fleetTargets.set(s, t);
      }
      out.push(t);
    }
    return out;
  }

  /** ; key: undock, cancel auto-dock, or start auto-docking with the selected port. */
  toggleDock() {
    const ship = this.ship;
    if (!ship) return;
    if (ship.docked) {
      ship.undock(this.world);
      this.message = ship.message;
      return;
    }
    if (ship.autopilot.mode === 'dock') {
      ship.autopilot.mode = 'none';
      this.message = 'Auto-dock off';
      return;
    }
    if (!ship.dock) {
      this.message = `No docking port within ${DOCK_RANGE / 1000} km`;
      return;
    }
    ship.autopilot.mode = 'dock';
    ship.dock.phase = 'approach';
    ship.throttle = 0;
    this.message = `Auto-dock → ${ship.dock.target.name} · ${ship.dock.target.ports[ship.dock.port].name}`;
  }

  /**
   * \ key: launch the shuttle from a mothership's berth (the mothership
   * stays parked in its orbit), or — docked in that berth — stow the shuttle
   * and take command of the mothership again.
   */
  shuttleAction() {
    const ship = this.ship;
    const w = this.world;
    if (!ship) return;
    const mother = ship.docked?.target.ship;
    if (mother) {
      const i = this.fleet.indexOf(mother);
      if (i >= 0) this.fleet.splice(i, 1);
      this.fleetTargets.delete(mother);
      mother.shuttleAboard = true;
      this.ship = mother;
      this.shipClass = mother.spec.cls;
      this.chaseQ.copy(mother.orient);
      this.message = `${ship.spec.name} stowed · aboard ${mother.spec.name}`;
      return;
    }
    const sp = SHIP_PORTS[ship.spec.cls];
    if (!sp.shuttle || !sp.berth) {
      this.message = `${ship.spec.name} carries no shuttle (the cruiser and the heavy explorer do)`;
      return;
    }
    if (!ship.shuttleAboard) {
      this.message = 'The shuttle is away';
      return;
    }
    if (ship.landed || ship.docked || !ship.frame.body || ship.frame.kind === 'universe' || ship.jump.phase !== 'idle' || ship.warp.active) {
      this.message = 'Launch the shuttle in flight, inside a star system';
      return;
    }
    const shuttle = new Ship(sp.shuttle, this.shipOptions);
    shuttle.frame.copy(ship.frame);
    shuttle.velocity.copy(ship.velocity);
    shuttle.orient.copy(ship.orient);
    shuttle.hoverAssist = ship.hoverAssist;
    ship.shuttleAboard = false;
    ship.autopilot.mode = 'none';
    ship.throttle = 0;
    ship.rcs.set(0, 0, 0);
    ship.rotInput.set(0, 0, 0);
    this.fleet.push(ship);
    const target = this.dockTargets().find((t) => t.ship === ship);
    if (target) {
      shuttle.dock = { target, port: 0, geo: null, phase: 'final' };
      shuttle.captureDock(w);
    }
    this.ship = shuttle;
    this.shipClass = shuttle.spec.cls;
    this.chaseQ.copy(shuttle.orient);
    this.message = `${shuttle.spec.name} in the berth · ; to undock`;
  }

  update(dt: number) {
    const input = this.input;
    const w = this.world;
    this.message = '';
    // parked vessels keep orbiting (frozen while in another star system)
    for (const s of this.fleet) {
      if (s.frame.body && s.frame.body.system !== w.system) continue;
      s.throttle = 0;
      s.rcs.set(0, 0, 0);
      s.rotInput.set(0, 0, 0);
      s.update(dt, w);
    }
    if (input.pressed('spawnShip')) {
      if (this.mode === 'spectator') this.spawnShip();
      else if (this.mode === 'ship') this.toSpectator();
    }
    if (input.pressed('interact')) {
      if (this.mode === 'ship') this.exitShip();
      else if (this.mode === 'walk') this.boardShip();
      else if (this.ship && this.mode === 'spectator') {
        this.setMode('ship');
        this.message = 'Returned to ship';
      }
    }
    switch (this.mode) {
      case 'spectator':
        this.spectator.update(dt);
        break;
      case 'ship':
        this.updateShip(dt);
        break;
      case 'walk':
        this.walker.update(dt, w, input);
        this.placeWalkerCamera();
        if (this.walker.swimming && this.walker.liquid) this.message ||= `Swimming in liquid ${this.walker.liquid}`;
        break;
    }
    // ships keep flying (or stay landed) when you are elsewhere
    if (this.ship && this.mode !== 'ship') {
      this.ship.throttle = this.ship.landed ? 0 : this.ship.throttle;
      this.ship.rcs.set(0, 0, 0);
      this.ship.rotInput.set(0, 0, 0);
      this.ship.update(dt, w);
    }
  }

  private updateShip(dt: number) {
    const ship = this.ship!;
    const input = this.input;
    const w = this.world;
    // ---- controls
    const look = input.look();
    if (this.shipView === 'orbit' && (input.dragging || input.pointerLocked)) {
      this.orbitYaw += look.yaw;
      this.orbitPitch = Math.max(-1.4, Math.min(1.4, this.orbitPitch - look.pitch));
      ship.rotInput.set(0, 0, 0);
    } else {
      ship.rotInput.set(look.pitch / Math.max(dt, 1e-3) * 0.05, look.yaw / Math.max(dt, 1e-3) * 0.05, input.axis('rollLeft', 'rollRight'));
      ship.rotInput.clampLength(0, 1.5);
    }
    const hover = ship.hoverAssist && ship.altitude < 20000 && !ship.landed;
    // close to a docking port: W/S fire fore/aft thrusters instead of the main engine
    const fine = !hover && !!ship.dock?.geo && ship.dock.geo.range < 400;
    if (fine) {
      ship.rcs.set(input.axis('right', 'left'), input.axis('up', 'down'), input.axis('forward', 'back'));
      ship.throttle = 0;
    } else if (hover) {
      // hover assist: WASD/R/F command velocity relative to the ground
      ship.rcs.set(input.axis('right', 'left'), input.axis('up', 'down'), input.axis('forward', 'back'));
      ship.throttle = 0;
    } else {
      ship.rcs.set(input.axis('right', 'left'), input.axis('up', 'down'), 0);
      const thr = input.axis('forward', 'back');
      ship.throttle = Math.max(0, Math.min(1, ship.throttle + thr * dt * 0.6));
      if (ship.landed && input.held('up')) ship.rcs.y = 1;
    }
    if (input.pressed('throttleFull')) ship.throttle = 1;
    if (input.pressed('throttleCut')) ship.throttle = 0;
    if (input.held('throttleUp')) ship.throttle = Math.min(1, ship.throttle + dt * 0.5);
    if (input.held('throttleDown')) ship.throttle = Math.max(0, ship.throttle - dt * 0.5);
    if (input.pressed('flightAssist')) { ship.opts.flightAssist = !ship.opts.flightAssist; this.message = `Flight assist ${ship.opts.flightAssist ? 'ON' : 'OFF'}`; }
    if (input.pressed('frameTarget')) { ship.hoverAssist = !ship.hoverAssist; this.message = `Hover assist ${ship.hoverAssist ? 'ON' : 'OFF'}`; }
    if (input.pressed('gear')) { ship.gearDown = !ship.gearDown; this.message = `Landing gear ${ship.gearDown ? 'down' : 'up'}`; }
    if (input.pressed('warp')) ship.toggleWarp(w);
    if (input.pressed('dock')) this.toggleDock();
    if (input.pressed('shuttle')) this.shuttleAction();
    if (ship.autopilot.mode === 'dock' && w.timeScale > 1) {
      w.timeScale = 1;
      this.message = 'Time acceleration is off while docking';
    }
    if (input.pressed('land')) { ship.autopilot.mode = ship.autopilot.mode === 'land' ? 'none' : 'land'; this.message = ship.autopilot.mode === 'land' ? 'Autopilot: landing' : 'Autopilot off'; }
    if (input.pressed('brake') && ship.dock?.geo && ship.dock.geo.range < 2000 && !ship.docked) {
      // match velocity with the docking target
      ship.velocity.lerp(ship.dock.geo.portVel, 0.5);
      this.message = `Matching velocity with ${ship.dock.target.name}`;
    } else if (input.pressed('brake') && ship.frame.body && w.system && !ship.landed) {
      // match velocity with the local surface (or frame body) using available thrust over ~2 s
      const off = ship.frame.offsetWorld(new Vector3());
      const vs = ship.surfaceVelocity(ship.frame.body, off, w);
      ship.velocity.lerp(vs, 0.5);
      this.message = 'Matching surface velocity';
    }
    if (input.pressed('cameraView')) {
      this.shipView = this.shipView === 'chase' ? 'cockpit' : this.shipView === 'cockpit' ? 'orbit' : 'chase';
      this.message = `View: ${this.shipView}`;
    }
    if (input.wheel && this.shipView !== 'cockpit') this.orbitDist = Math.max(1.2, Math.min(40, this.orbitDist * Math.pow(1.15, input.wheel)));
    ship.update(dt, w);
    // docking computer: nearest port in range (locked while auto-docking or
    // docked); after the update, when ship and targets refer to the same instant
    if (!ship.docked && ship.autopilot.mode !== 'dock') {
      const near = ship.frame.body && !ship.landed && ship.jump.phase === 'idle' ? nearestPort(ship, this.dockTargets(), w, DOCK_RANGE) : null;
      if (!near) ship.dock = null;
      else if (!ship.dock || ship.dock.target !== near.target || ship.dock.port !== near.port) ship.dock = { target: near.target, port: near.port, geo: null, phase: 'approach' };
    }
    if (ship.message) this.message = ship.message;
    this.placeShipCamera(dt);
  }

  private placeShipCamera(dt: number) {
    const ship = this.ship!;
    const view = this.world.view;
    const L = ship.spec.length;
    view.copy(ship.frame);
    // world orientation of the ship
    const sq = ship.orient;
    let camQ: Quaternion;
    let off: Vector3;
    if (this.shipView === 'cockpit') {
      off = this.cockpitOffset.clone().applyQuaternion(sq);
      camQ = sq.clone();
    } else if (this.shipView === 'chase') {
      // lagged attitude for a smooth chase camera
      this.chaseQ.slerp(sq, 1 - Math.exp(-dt * 4));
      off = new Vector3(0, L * 0.28, L * this.orbitDist * 0.7).applyQuaternion(this.chaseQ);
      camQ = this.chaseQ.clone().multiply(_q.setFromAxisAngle(new Vector3(1, 0, 0), -0.12));
    } else {
      const d = L * this.orbitDist;
      off = new Vector3(Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch)).multiplyScalar(d).applyQuaternion(sq);
      const m = new Matrix4().lookAt(off, new Vector3(), new Vector3(0, 1, 0).applyQuaternion(sq));
      camQ = new Quaternion().setFromRotationMatrix(m);
    }
    view.translateWorld(off);
    view.setWorldOrientation(camQ);
    void _v;
  }

  private placeWalkerCamera() {
    const wk = this.walker;
    const view = this.world.view;
    if (!wk.body) return;
    if (view.kind !== 'rotating' || view.body !== wk.body) {
      view.kind = 'rotating';
      view.body = wk.body;
    }
    const q = new Quaternion();
    wk.eye(view.local, q);
    view.orient.copy(q);
  }

  /** Body the player is currently on or near (for HUD). */
  get localBody(): Body | null {
    if (this.mode === 'walk') return this.walker.body;
    if (this.mode === 'ship') return this.ship?.frame.body ?? null;
    return this.world.view.body;
  }
}

export { FramedPosition };
