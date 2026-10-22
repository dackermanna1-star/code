package com.ordnance.client.particle;

import com.ordnance.registry.ModParticles;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.particle.SpriteProvider;
import net.minecraft.particle.SimpleParticleType;

/**
 * Sprite sets of the Ordnance particle types, captured when their factories are created so effects can build
 * {@link OrdnanceParticle}s directly with per-effect parameters. Each type also gets a reasonable default factory
 * for commands and server-spawned particles.
 */
public final class ParticleSprites {
	public static SpriteProvider FIREBALL;
	public static SpriteProvider FLAME;
	public static SpriteProvider SMOKE;
	public static SpriteProvider SPARK;
	public static SpriteProvider EMBER;
	public static SpriteProvider FLASH;
	public static SpriteProvider SHOCKWAVE;
	public static SpriteProvider DUST;
	public static SpriteProvider DEBRIS;
	public static SpriteProvider MUZZLE_FLASH;
	public static SpriteProvider GLOW;

	private ParticleSprites() {
	}

	public static boolean ready() {
		return FIREBALL != null && SMOKE != null && GLOW != null;
	}

	public static void register() {
		register(ModParticles.FIREBALL, p -> FIREBALL = p, p -> OrdnanceParticle.builder(p).animated().life(10, 16).size(0.8F, 1.8F)
			.colors(0xFFFFF0C0, 0xFFFF8C30, 0x60402010).emissive(1.0F, 0.4F));
		register(ModParticles.FLAME, p -> FLAME = p, p -> OrdnanceParticle.builder(p).animated().life(8, 14).size(0.2F, 0.5F)
			.colors(0xFFFFE6A0, 0xFFFF9040, 0x00802010).emissive(1.0F, 1.0F).glow().buoyancy(0.002F));
		register(ModParticles.SMOKE, p -> SMOKE = p, p -> OrdnanceParticle.builder(p).life(60, 100).size(0.6F, 2.2F).sizeCurve(0.6F)
			.colors(0xFF3A3632, 0xFF77716B).alpha(0.7F).buoyancy(0.0015F).drag(0.96F));
		register(ModParticles.SPARK, p -> SPARK = p, p -> OrdnanceParticle.builder(p).life(10, 20).size(0.06F, 0.02F)
			.colors(0xFFFFFFE0, 0xFFFFA040).emissive(1.0F, 1.0F).glow().gravity(0.04F).bounce(0.4F));
		register(ModParticles.EMBER, p -> EMBER = p, p -> OrdnanceParticle.builder(p).life(30, 60).size(0.05F, 0.03F)
			.colors(0xFFFFC060, 0xFFFF5010).emissive(1.0F, 1.0F).glow().buoyancy(0.002F).drag(0.97F));
		register(ModParticles.FLASH, p -> FLASH = p, p -> OrdnanceParticle.builder(p).life(3, 4).size(3.0F, 4.0F)
			.color(0xFFFFF4D8).emissive(1.0F, 1.0F).glow().fade(0.0F, 0.0F));
		register(ModParticles.SHOCKWAVE, p -> SHOCKWAVE = p, p -> OrdnanceParticle.builder(p).life(8, 8).size(0.5F, 6.0F).sizeCurve(0.6F)
			.color(0xFFFFFFFF).alpha(0.4F).fade(0.0F, 0.2F).horizontal());
		register(ModParticles.DUST, p -> DUST = p, p -> OrdnanceParticle.builder(p).life(30, 50).size(0.5F, 1.6F)
			.colors(0xFF8C7A64, 0xFFA89A88).alpha(0.6F).drag(0.92F));
		register(ModParticles.DEBRIS, p -> DEBRIS = p, p -> OrdnanceParticle.builder(p).life(30, 50).size(0.12F, 0.12F)
			.color(0xFF5A5450).gravity(0.05F).bounce(0.35F).spin(0.3F));
		register(ModParticles.MUZZLE_FLASH, p -> MUZZLE_FLASH = p, p -> OrdnanceParticle.builder(p).life(2, 2).size(0.6F, 0.9F)
			.color(0xFFFFE8B0).emissive(1.0F, 1.0F).glow().fade(0.0F, 0.0F));
		register(ModParticles.GLOW, p -> GLOW = p, p -> OrdnanceParticle.builder(p).life(6, 10).size(0.4F, 0.1F)
			.color(0xFFFFB060).emissive(1.0F, 1.0F).glow());
	}

	/** Registers a factory that captures the sprite set and spawns the given default configuration. */
	private static void register(SimpleParticleType type, Consumer<SpriteProvider> capture, java.util.function.Function<SpriteProvider, OrdnanceParticle.Builder> defaults) {
		ParticleFactoryRegistry.getInstance().register(type, provider -> {
			capture.accept(provider);
			return (parameters, world, x, y, z, vx, vy, vz, random) -> {
				if (!ParticleBudget.tryAcquireDefault()) {
					return null;
				}

				return defaults.apply(provider).velocity(vx, vy, vz).build(world, x, y, z);
			};
		});
	}
}
