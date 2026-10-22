package com.ordnance.config;

import com.ordnance.explosion.ExplosionProfile;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Plain data model serialized to {@code config/ordnance.json}. Field names are the JSON keys.
 *
 * <p>Gameplay values (damage, radius, destruction, ammo) are read by the logical server; visual values
 * are read by each client, so every player can tune effects for their own hardware.
 */
public final class OrdnanceConfig {
	public General general = new General();
	public Explosions explosions = new Explosions();
	public Fire fire = new Fire();
	public Visuals visuals = new Visuals();
	public Weapons weapons = new Weapons();
	/** Warhead parameters keyed by {@link ExplosionProfile#key()}. */
	public Map<String, Warhead> warheads = new LinkedHashMap<>();

	public static final class General {
		/** Server: vanilla explosions (TNT, creepers, beds, crystals...) also scorch terrain and throw debris. */
		public boolean enhanceVanillaExplosions = true;
		/** Client: replace vanilla explosion particles and sounds with the Ordnance effects. */
		public boolean overhaulVanillaExplosionVisuals = true;
	}

	public static final class Explosions {
		public boolean terrainDamage = true;
		public float blockDamageMultiplier = 1.0F;
		public float entityDamageMultiplier = 1.0F;
		public float blastRadiusMultiplier = 1.0F;
		public float knockbackMultiplier = 1.0F;
		public boolean craters = true;
		public boolean scorchMarks = true;
		public boolean createFires = true;
		public boolean fragmentation = true;
		/** Fragments shatter glass, panes and ice they hit. */
		public boolean fragmentsBreakGlass = true;
		public boolean flyingDebris = true;
		public float debrisMultiplier = 1.0F;
		public int maxDebrisPerExplosion = 48;
		/** Upper bound of debris entities alive per world; protects servers from runaway chain reactions. */
		public int maxActiveDebris = 320;
		/** Chance that a landing debris chunk settles as a rubble block instead of shattering. */
		public float rubbleChance = 0.3F;
		/** Destroyed blocks drop items (with vanilla explosion decay). */
		public boolean dropBlocks = true;
		/** Blast wave propagation speed in blocks per tick; damage and knockback arrive when the wave does. */
		public float blastWaveSpeed = 3.5F;
		public int maxBlocksPerExplosion = 9000;
		/** Players can't break blocks inside spawn protection or outside the world border with explosives. */
		public boolean respectBlockProtection = true;
	}

	public static final class Fire {
		public boolean enhancedFire = true;
		/** Multiplies how often fire blocks tick (spread and burn faster). */
		public float spreadSpeedMultiplier = 1.0F;
		/** Burned logs leave charred logs, burnt-out fires leave ash and scorched ground. */
		public boolean charredRemains = true;
		public float charChance = 0.55F;
		public float ashChance = 0.35F;
		/** Large fires throw embers that can ignite flammable blocks downwind. */
		public boolean emberJumps = true;
		public float emberJumpChance = 0.03F;
		public int emberJumpRange = 6;
		/** Lifetime of burning fuel (napalm) puddles, in ticks. */
		public int burningFuelTicks = 240;
	}

	public static final class Visuals {
		public float particleMultiplier = 1.0F;
		/** Hard cap on Ordnance particles alive at once (vanilla shares a 16384 budget). */
		public int maxActiveParticles = 7000;
		/** Distance (blocks) after which effects switch to fewer, larger particles. */
		public float lodDistance = 72.0F;
		public float screenShake = 1.0F;
		public boolean screenFlash = true;
		public boolean skyFlash = true;
		public boolean smokeObstruction = true;
		public boolean heatDistortion = true;
		public float heatDistortionStrength = 1.0F;
		/** Sound reaches distant listeners at the speed of sound (~343 m/s) instead of instantly. */
		public boolean realisticSoundDelay = true;
		public float lingeringSmokeMultiplier = 1.0F;
		public boolean fireEmbers = true;
		public boolean muzzleFlash = true;
		public float recoil = 1.0F;
		public boolean weaponHud = true;
	}

	public static final class Weapons {
		public Grenades grenades = new Grenades();
		public Rpg rpg7 = new Rpg();
		public GrenadeLauncher grenadeLauncher = new GrenadeLauncher();
		public Flamethrower flamethrower = new Flamethrower();
		public MissileStrike missileStrike = new MissileStrike();
	}

	public static final class Grenades {
		public int fuseTicks = 80;
		/** Holding the use key after pulling the pin burns the fuse ("cooking"); hold too long and it goes off in hand. */
		public boolean cooking = true;
		public float throwSpeed = 1.35F;
		public float bounciness = 0.38F;
		public int smokeDurationTicks = 400;
	}

	public static final class Rpg {
		public int reloadTicks = 50;
		public int cooldownTicks = 16;
		public float launchSpeed = 1.6F;
		public float maxSpeed = 4.2F;
		public float motorAcceleration = 0.32F;
		/** Distance before the warhead arms; impacts closer than this are duds. */
		public float armingDistance = 2.0F;
		public int selfDestructTicks = 110;
		public boolean backblast = true;
		public float backblastDamage = 8.0F;
		public float backblastRange = 4.5F;
	}

	public static final class GrenadeLauncher {
		public int magazineSize = 6;
		public int reloadTicksPerRound = 14;
		public int cooldownTicks = 11;
		public float muzzleVelocity = 1.55F;
		public int timedFuseTicks = 50;
		public float armingDistance = 3.0F;
	}

	public static final class Flamethrower {
		public int maxFuel = 400;
		public int fuelPerCanister = 200;
		public int refuelTicks = 24;
		public float damagePerHit = 2.5F;
		public int igniteSeconds = 6;
		public float range = 1.0F;
		public boolean igniteBlocks = true;
		/** Chance per fuel glob landing on a surface to leave a burning fuel puddle. */
		public float puddleChance = 0.22F;
	}

	public static final class MissileStrike {
		public int maxRange = 192;
		public int lockTicks = 40;
		public int countdownTicks = 80;
		public float missileSpeed = 7.0F;
		public int designatorCooldownTicks = 600;
		public boolean warnNearbyPlayers = true;
	}

	/** Explosive payload definition. Each explosion profile has one of these in {@link #warheads}. */
	public static final class Warhead {
		/** Block-destruction strength (vanilla TNT = 4). */
		public float power;
		/** Peak blast damage at the centre. */
		public float damage;
		/** Blast damage radius in blocks. */
		public float radius;
		/** Blast pressure push strength. */
		public float knockback;
		public int fragments;
		public float fragmentDamage;
		public float fragmentRange;
		/** Chance per candidate spot to start a fire. */
		public float fireChance;
		public float fireRadius;
		/** Sets entities caught in the fireball on fire for this many seconds. */
		public float igniteSeconds;
		/** Scatters burning fuel that sticks to any surface. */
		public boolean incendiary;
		public float scorchRadius;
		public float craterRadius;
		public float craterDepth;
		public int debris;
		/** Shaped-charge jet depth in blocks along the impact direction. */
		public float penetration;
		/** Smoke volume for smoke munitions, in ticks; 0 for none. */
		public int smokeTicks;
		/** Fireball / shockwave size of the visual effect. */
		public float visualScale;

		public Warhead copy() {
			Warhead w = new Warhead();
			w.power = power;
			w.damage = damage;
			w.radius = radius;
			w.knockback = knockback;
			w.fragments = fragments;
			w.fragmentDamage = fragmentDamage;
			w.fragmentRange = fragmentRange;
			w.fireChance = fireChance;
			w.fireRadius = fireRadius;
			w.igniteSeconds = igniteSeconds;
			w.incendiary = incendiary;
			w.scorchRadius = scorchRadius;
			w.craterRadius = craterRadius;
			w.craterDepth = craterDepth;
			w.debris = debris;
			w.penetration = penetration;
			w.smokeTicks = smokeTicks;
			w.visualScale = visualScale;
			return w;
		}
	}
}
