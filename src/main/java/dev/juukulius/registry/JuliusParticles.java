package dev.juukulius.registry;

import dev.juukulius.JuliusMod;
import dev.juukulius.particle.JuliusParticleOptions;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * Custom particle types. All take {@link JuliusParticleOptions} (colour, scale, lifetime). Most are spawned
 * client-side from effect packets so the client's particle settings can thin them out.
 */
public final class JuliusParticles {
	/** Soft additive sparkle, tinted. */
	public static final ParticleType<JuliusParticleOptions> GLOW_SPARK = register("glow_spark");
	/** Sparkle whose hue cycles through the rainbow during its life. */
	public static final ParticleType<JuliusParticleOptions> RAINBOW_SPARK = register("rainbow_spark");
	/** Rising fire ember. */
	public static final ParticleType<JuliusParticleOptions> EMBER = register("ember");
	/** Animated flame puff. */
	public static final ParticleType<JuliusParticleOptions> FLAME = register("flame");
	/** Falling water droplet. */
	public static final ParticleType<JuliusParticleOptions> DROPLET = register("droplet");
	/** Velocity-aligned wind streak. */
	public static final ParticleType<JuliusParticleOptions> WIND_STREAK = register("wind_streak");
	/** Tumbling leaf carried by Aro. */
	public static final ParticleType<JuliusParticleOptions> LEAF = register("leaf");
	/** Expanding dust cloud. */
	public static final ParticleType<JuliusParticleOptions> DUST_PUFF = register("dust_puff");
	/** Slow-rising mote of yang light. */
	public static final ParticleType<JuliusParticleOptions> LIGHT_MOTE = register("light_mote");
	/** Dark yin wisp (darkens what is behind it). */
	public static final ParticleType<JuliusParticleOptions> SHADOW_WISP = register("shadow_wisp");
	/** Bright short flash at points of impact. */
	public static final ParticleType<JuliusParticleOptions> IMPACT_FLASH = register("impact_flash");
	/** Flat ring expanding along the ground. */
	public static final ParticleType<JuliusParticleOptions> RING = register("ring");
	/** Thin velocity-aligned spark line. */
	public static final ParticleType<JuliusParticleOptions> SLASH_LINE = register("slash_line");

	private JuliusParticles() {
	}

	private static ParticleType<JuliusParticleOptions> register(String name) {
		return Registry.register(
			BuiltInRegistries.PARTICLE_TYPE,
			JuliusMod.id(name),
			FabricParticleTypes.complex(false, JuliusParticleOptions::codec, JuliusParticleOptions::streamCodec)
		);
	}

	public static JuliusParticleOptions of(ParticleType<JuliusParticleOptions> type, int color, float scale) {
		return new JuliusParticleOptions(type, color, scale, 0);
	}

	public static JuliusParticleOptions of(ParticleType<JuliusParticleOptions> type, int color, float scale, int lifetime) {
		return new JuliusParticleOptions(type, color, scale, lifetime);
	}

	public static void init() {
	}
}
