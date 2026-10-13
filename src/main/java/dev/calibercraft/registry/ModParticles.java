package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * Client-spawned effect particles. Velocity parameters carry extra data where noted
 * (e.g. the surface normal of a bullet hole).
 */
public final class ModParticles {
	public static final SimpleParticleType MUZZLE_SMOKE = register("muzzle_smoke");
	public static final SimpleParticleType SPARK = register("spark");
	public static final SimpleParticleType IMPACT_FLASH = register("impact_flash");
	/** Velocity = surface normal. */
	public static final SimpleParticleType BULLET_HOLE = register("bullet_hole");
	/** Velocity = ejection velocity. */
	public static final SimpleParticleType CASING_BRASS = register("casing_brass");
	/** Velocity = ejection velocity. */
	public static final SimpleParticleType CASING_SHELL = register("casing_shell");
	public static final SimpleParticleType MUZZLE_FLASH = register("muzzle_flash");

	private ModParticles() {
	}

	private static SimpleParticleType register(String name) {
		return Registry.register(BuiltInRegistries.PARTICLE_TYPE, CaliberCraft.id(name), FabricParticleTypes.simple(true));
	}

	public static void init() {
	}
}
