package com.ordnance.explosion;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import java.util.function.Consumer;

/**
 * Every kind of detonation the mod knows about. The enum ordinal is sent to clients, which pick the matching
 * visual/sound treatment; the server reads the tunable {@link OrdnanceConfig.Warhead} for gameplay values.
 *
 * <p>To add a munition, add a constant here (its warhead appears in the config automatically) and point an
 * {@link com.ordnance.weapon.AmmoType} or projectile at it.
 */
public enum ExplosionProfile {
	FRAG_GRENADE("frag_grenade", FxStyle.FRAG, w -> {
		w.power = 2.4F; w.damage = 20.0F; w.radius = 5.5F; w.knockback = 1.3F;
		w.fragments = 60; w.fragmentDamage = 6.5F; w.fragmentRange = 14.0F;
		w.scorchRadius = 2.5F; w.debris = 8; w.visualScale = 1.0F;
	}),
	INCENDIARY_GRENADE("incendiary_grenade", FxStyle.INCENDIARY, w -> {
		w.power = 1.0F; w.damage = 8.0F; w.radius = 4.0F; w.knockback = 0.6F;
		w.fireChance = 0.85F; w.fireRadius = 4.5F; w.igniteSeconds = 8.0F; w.incendiary = true;
		w.scorchRadius = 4.0F; w.debris = 3; w.visualScale = 1.1F;
	}),
	SMOKE_GRENADE("smoke_grenade", FxStyle.SMOKE, w -> {
		w.radius = 0.0F; w.smokeTicks = 400; w.visualScale = 0.4F;
	}),
	HE_40MM("he_40mm", FxStyle.FRAG, w -> {
		w.power = 2.6F; w.damage = 18.0F; w.radius = 5.0F; w.knockback = 1.2F;
		w.fragments = 36; w.fragmentDamage = 6.0F; w.fragmentRange = 11.0F;
		w.scorchRadius = 2.5F; w.debris = 9; w.visualScale = 1.05F;
	}),
	INCENDIARY_40MM("incendiary_40mm", FxStyle.INCENDIARY, w -> {
		w.power = 1.0F; w.damage = 7.0F; w.radius = 3.5F; w.knockback = 0.5F;
		w.fireChance = 0.8F; w.fireRadius = 3.8F; w.igniteSeconds = 7.0F; w.incendiary = true;
		w.scorchRadius = 3.5F; w.debris = 2; w.visualScale = 1.0F;
	}),
	SMOKE_40MM("smoke_40mm", FxStyle.SMOKE, w -> {
		w.radius = 0.0F; w.smokeTicks = 300; w.visualScale = 0.35F;
	}),
	RPG_HEAT("rpg_heat", FxStyle.HEAT, w -> {
		w.power = 3.6F; w.damage = 30.0F; w.radius = 6.0F; w.knockback = 2.0F;
		w.fragments = 24; w.fragmentDamage = 6.0F; w.fragmentRange = 12.0F;
		w.fireChance = 0.08F; w.fireRadius = 3.0F; w.penetration = 5.0F;
		w.scorchRadius = 3.5F; w.craterRadius = 2.5F; w.craterDepth = 1.5F; w.debris = 22; w.visualScale = 1.6F;
	}),
	RPG_THERMOBARIC("rpg_thermobaric", FxStyle.THERMOBARIC, w -> {
		w.power = 4.4F; w.damage = 36.0F; w.radius = 9.0F; w.knockback = 3.0F;
		w.fireChance = 0.5F; w.fireRadius = 6.5F; w.igniteSeconds = 6.0F;
		w.scorchRadius = 7.0F; w.craterRadius = 2.0F; w.craterDepth = 1.0F; w.debris = 26; w.visualScale = 2.6F;
	}),
	HYPERSONIC_MISSILE("hypersonic_missile", FxStyle.MISSILE, w -> {
		w.power = 11.0F; w.damage = 110.0F; w.radius = 26.0F; w.knockback = 6.0F;
		w.fragments = 90; w.fragmentDamage = 10.0F; w.fragmentRange = 40.0F;
		w.fireChance = 0.3F; w.fireRadius = 14.0F; w.igniteSeconds = 10.0F;
		w.scorchRadius = 18.0F; w.craterRadius = 11.0F; w.craterDepth = 7.0F; w.debris = 72; w.visualScale = 6.0F;
	}),
	/** Vanilla explosions (TNT, creepers, ...). Not configurable; scale is derived from the explosion power. */
	VANILLA("vanilla", FxStyle.VANILLA, null);

	private final String key;
	private final FxStyle style;
	private final Consumer<OrdnanceConfig.Warhead> defaults;

	ExplosionProfile(String key, FxStyle style, Consumer<OrdnanceConfig.Warhead> defaults) {
		this.key = key;
		this.style = style;
		this.defaults = defaults;
	}

	public String key() {
		return this.key;
	}

	public FxStyle style() {
		return this.style;
	}

	public boolean isConfigurable() {
		return this.defaults != null;
	}

	public OrdnanceConfig.Warhead defaults() {
		OrdnanceConfig.Warhead warhead = new OrdnanceConfig.Warhead();
		if (this.defaults != null) {
			this.defaults.accept(warhead);
		}

		return warhead;
	}

	/** The live (configured) warhead; falls back to defaults if the config entry was removed. */
	public OrdnanceConfig.Warhead warhead() {
		OrdnanceConfig.Warhead warhead = ConfigManager.get().warheads.get(this.key);
		return warhead != null ? warhead : this.defaults();
	}

	public static ExplosionProfile byId(int id) {
		ExplosionProfile[] values = values();
		return id >= 0 && id < values.length ? values[id] : VANILLA;
	}

	/** Visual families; the client builds the effect sequence from these. */
	public enum FxStyle {
		FRAG,
		INCENDIARY,
		SMOKE,
		HEAT,
		THERMOBARIC,
		MISSILE,
		VANILLA;

		public boolean isSmoke() {
			return this == SMOKE;
		}
	}
}
