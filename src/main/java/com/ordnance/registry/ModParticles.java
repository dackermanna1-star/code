package com.ordnance.registry;

import com.ordnance.Ordnance;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.particle.SimpleParticleType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/**
 * Particle types. Each one owns a sprite set ({@code assets/ordnance/particles/<name>.json}); the client spawns
 * most instances directly with per-effect colours, sizes and lifetimes, while these types also give sensible
 * defaults when spawned by commands or the server.
 */
public final class ModParticles {
	public static final SimpleParticleType FIREBALL = register("fireball", false);
	public static final SimpleParticleType FLAME = register("flame", false);
	public static final SimpleParticleType SMOKE = register("smoke", false);
	public static final SimpleParticleType SPARK = register("spark", false);
	public static final SimpleParticleType EMBER = register("ember", false);
	public static final SimpleParticleType FLASH = register("flash", true);
	public static final SimpleParticleType SHOCKWAVE = register("shockwave", true);
	public static final SimpleParticleType DUST = register("dust", false);
	public static final SimpleParticleType DEBRIS = register("debris", false);
	public static final SimpleParticleType MUZZLE_FLASH = register("muzzle_flash", true);
	public static final SimpleParticleType GLOW = register("glow", false);

	private ModParticles() {
	}

	private static SimpleParticleType register(String name, boolean alwaysSpawn) {
		return Registry.register(Registries.PARTICLE_TYPE, Ordnance.id(name), FabricParticleTypes.simple(alwaysSpawn));
	}

	public static void init() {
	}
}
