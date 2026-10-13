package dev.calibercraft.core;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Every tunable weapon statistic. Units are noted per constant. Values are always clamped to
 * [{@link #min}, {@link #max}] after modifiers are applied, so a datapack or attachment can never
 * produce a nonsensical weapon (negative fire rate, zero magazine, ...).
 */
public enum Stat {
	/** Damage per projectile (half-hearts). */
	DAMAGE(4.0, 0.0, 200.0, false),
	/** Projectiles per shot (shotgun pellets). */
	PELLETS(1, 1, 32, true),
	/** Rounds per minute (cyclic rate, also caps semi-auto). */
	RPM(600, 30, 2000, false),
	/** Magazine / tube / cylinder capacity (excludes a chambered round). */
	MAGAZINE(10, 1, 500, true),
	/** Distance in blocks before damage falloff starts. */
	EFFECTIVE_RANGE(32, 1, 512, false),
	/** Distance in blocks after which the projectile is discarded. */
	MAX_RANGE(128, 4, 1024, false),
	/** Damage multiplier reached at {@link #MAX_RANGE}. */
	MIN_DAMAGE_MULT(0.5, 0.05, 1.0, false),
	/** Muzzle velocity in blocks per tick. */
	VELOCITY(40, 2, 200, false),
	/** Projectile drop in blocks per tick squared. */
	GRAVITY(0.005, 0.0, 0.2, false),
	/** Material penetration power (block hardness units). */
	PENETRATION(0.5, 0.0, 10.0, false),
	/** Fraction of target armour ignored (0..1). */
	ARMOR_PENETRATION(0.1, 0.0, 1.0, false),
	/** Damage multiplier for head hits. */
	HEADSHOT_MULT(1.5, 1.0, 5.0, false),
	/** Upward camera kick per shot, degrees. */
	RECOIL_VERTICAL(1.5, 0.0, 30.0, false),
	/** Maximum sideways kick per shot, degrees. */
	RECOIL_HORIZONTAL(0.5, 0.0, 20.0, false),
	/** Fraction of vertical kick that recovers after firing stops (0..1). */
	RECOIL_RECOVERY(0.7, 0.0, 1.0, false),
	/** Hip-fire cone half-angle, degrees. */
	SPREAD_HIP(2.5, 0.0, 30.0, false),
	/** Aimed cone half-angle, degrees. */
	SPREAD_ADS(0.4, 0.0, 30.0, false),
	/** Spread multiplier while moving. */
	SPREAD_MOVE(1.5, 1.0, 5.0, false),
	/** Extra spread added per consecutive shot, degrees. */
	SPREAD_BLOOM(0.2, 0.0, 5.0, false),
	/** Cap for accumulated bloom, degrees. */
	SPREAD_BLOOM_MAX(2.0, 0.0, 15.0, false),
	/** Ticks to reach full aim. */
	ADS_TIME(6, 1, 40, false),
	/** Ticks after drawing before the weapon can fire. */
	EQUIP_TIME(10, 1, 60, false),
	/** Movement speed multiplier while held. */
	MOVE_SPEED(1.0, 0.3, 1.5, false),
	/** Additional movement multiplier while aiming. */
	ADS_MOVE_SPEED(0.75, 0.2, 1.2, false),
	/** Reload speed multiplier (higher is faster). */
	RELOAD_SPEED(1.0, 0.25, 4.0, false),
	/** Field-of-view divisor while fully aimed (1 = no zoom). */
	ZOOM(1.1, 1.0, 12.0, false),
	/** Report loudness multiplier (affects audible range). */
	LOUDNESS(1.0, 0.05, 3.0, false),
	/** Muzzle flash size multiplier. */
	FLASH(1.0, 0.0, 3.0, false),
	/** Aim sway amplitude multiplier. */
	SWAY(0.5, 0.0, 5.0, false),
	/** Heat added per shot (1.0 = overheated). */
	HEAT_PER_SHOT(0.0, 0.0, 1.0, false),
	/** Heat removed per tick. */
	HEAT_COOLING(0.02, 0.0, 1.0, false),
	/** Knockback applied to targets hit. */
	KNOCKBACK(0.0, 0.0, 3.0, false),
	/** Damage of a melee bash. */
	MELEE_DAMAGE(3.0, 0.0, 40.0, false);

	private static final Map<String, Stat> BY_KEY = new HashMap<>();

	static {
		for (Stat s : values()) {
			BY_KEY.put(s.key, s);
		}
	}

	public final String key;
	public final double defaultValue;
	public final double min;
	public final double max;
	public final boolean integer;

	Stat(double defaultValue, double min, double max, boolean integer) {
		this.key = name().toLowerCase(Locale.ROOT);
		this.defaultValue = defaultValue;
		this.min = min;
		this.max = max;
		this.integer = integer;
	}

	public static Stat byKey(String key) {
		return BY_KEY.get(key);
	}

	public double clamp(double v) {
		if (Double.isNaN(v)) {
			return defaultValue;
		}
		double c = Math.max(min, Math.min(max, v));
		return integer ? Math.round(c) : c;
	}

	/** Whether a larger value of this stat is better for the player (used for UI colouring). */
	public boolean higherIsBetter() {
		return switch (this) {
			case RECOIL_VERTICAL, RECOIL_HORIZONTAL, SPREAD_HIP, SPREAD_ADS, SPREAD_MOVE, SPREAD_BLOOM, SPREAD_BLOOM_MAX,
				ADS_TIME, EQUIP_TIME, GRAVITY, LOUDNESS, FLASH, SWAY, HEAT_PER_SHOT -> false;
			default -> true;
		};
	}
}
