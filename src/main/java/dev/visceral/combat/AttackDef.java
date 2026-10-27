package dev.visceral.combat;

import dev.visceral.state.WoundType;

/**
 * One authored attack. Timings are in ticks at scale 1 and are stretched per weapon by the
 * wielder's attack speed (see {@link Attacks#timeScale}). Geometry is in the attacker's local
 * frame: yaw angles are degrees from the look direction (positive = attacker's right), {@code tilt}
 * rotates the swing plane from horizontal (0) to vertical (90, top to bottom).
 *
 * <p>The client plays the animation clip with the same name; the server performs the hit sweep
 * during the active window.
 */
public final class AttackDef {
	public enum Kind {
		STRIKE,
		KICK,
		STOMP,
		FINISHER_GROUND,
		FINISHER_STAND
	}

	public int id = -1;
	public final String name;
	public final WeaponClass weapon;
	public final Kind kind;
	public int windup, active, recovery;
	/** Recovery ticks that must elapse before a follow-up attack may start. */
	public int minRecovery = 2;
	public float damage = 1f;
	public float force = 1f;
	public float reach = 2.9f;
	public float minReach = 0.35f;
	public float yawStart, yawEnd;
	public float tilt;
	public boolean thrust;
	/** Thrust/swing origin relative to the eye (blocks, negative = lower). */
	public float heightOffset = -0.3f;
	/** Lateral origin offset (blocks, positive = attacker's right). */
	public float sideOffset;
	/** How much the swing follows the look pitch (0..1). */
	public float pitchFollow = 0.6f;
	/** Extra pitch applied to the swing (degrees, positive = downward). */
	public float pitchOffset;
	/** Upward component of the transferred impulse. */
	public float lift;
	/** Forward velocity given to the attacker when the active window opens. */
	public float lunge;
	public WoundType wound;
	public boolean heavy;
	public boolean interrupts = true;

	public AttackDef(String name, WeaponClass weapon, Kind kind) {
		this.name = name;
		this.weapon = weapon;
		this.kind = kind;
		this.wound = weapon.woundType;
	}

	public AttackDef timing(int windup, int active, int recovery) {
		this.windup = windup;
		this.active = active;
		this.recovery = recovery;
		return this;
	}

	public AttackDef arc(float yawStart, float yawEnd, float tilt) {
		this.yawStart = yawStart;
		this.yawEnd = yawEnd;
		this.tilt = tilt;
		return this;
	}

	public AttackDef thrust(float reach) {
		this.thrust = true;
		this.reach = reach;
		return this;
	}

	public AttackDef power(float damage, float force) {
		this.damage = damage;
		this.force = force;
		return this;
	}

	public AttackDef reach(float reach) {
		this.reach = reach;
		return this;
	}

	public AttackDef origin(float height, float side) {
		this.heightOffset = height;
		this.sideOffset = side;
		return this;
	}

	public AttackDef pitch(float follow, float offset) {
		this.pitchFollow = follow;
		this.pitchOffset = offset;
		return this;
	}

	public AttackDef lunge(float lunge) {
		this.lunge = lunge;
		return this;
	}

	public AttackDef lift(float lift) {
		this.lift = lift;
		return this;
	}

	public AttackDef wound(WoundType wound) {
		this.wound = wound;
		return this;
	}

	public AttackDef heavy() {
		this.heavy = true;
		this.minRecovery = 4;
		return this;
	}

	public AttackDef minRecovery(int ticks) {
		this.minRecovery = ticks;
		return this;
	}

	public boolean isFinisher() {
		return kind == Kind.FINISHER_GROUND || kind == Kind.FINISHER_STAND;
	}

	public boolean targetsGround() {
		return kind == Kind.FINISHER_GROUND || kind == Kind.STOMP;
	}

	public boolean usesWeaponDamage() {
		return kind != Kind.KICK && kind != Kind.STOMP;
	}

	/** Scaled timings for a given time scale. */
	public int windup(float scale) {
		return Math.max(1, Math.round(windup * scale));
	}

	public int active(float scale) {
		return Math.max(1, Math.round(active * scale));
	}

	public int total(float scale) {
		return windup(scale) + active(scale) + Math.max(1, Math.round(recovery * scale));
	}

	/** First tick (from start) at which a follow-up attack may begin. */
	public int cancelPoint(float scale) {
		return windup(scale) + active(scale) + Math.max(0, Math.round(minRecovery * scale));
	}

	@Override
	public String toString() {
		return name;
	}
}
