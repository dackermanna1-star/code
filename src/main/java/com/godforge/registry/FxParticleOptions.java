package com.godforge.registry;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Parameters shared by all Godforge particle types.
 *
 * @param color     start colour (RGB)
 * @param fadeColor colour reached at the end of the particle's life (RGB)
 * @param size      quad half-size in blocks
 * @param lifetime  ticks
 * @param gravity   gravity factor (negative floats upwards)
 * @param flags     see the {@code F_*} constants
 */
public record FxParticleOptions(ParticleType<FxParticleOptions> type, int color, int fadeColor, float size, int lifetime, float gravity, int flags)
	implements ParticleOptions {
	/** Rendered with additive blending (glows). Otherwise translucent. */
	public static final int F_ADDITIVE = 1;
	/** Ignores block collisions. */
	public static final int F_NO_PHYSICS = 2;
	/** Shrinks to nothing over its life. */
	public static final int F_SHRINK = 4;
	/** Grows over its life (rings, smoke). */
	public static final int F_GROW = 8;
	/** Cycles through the rainbow. */
	public static final int F_RAINBOW = 16;
	/** Spins while alive. */
	public static final int F_SPIN = 32;
	/** Keeps velocity (no air drag). */
	public static final int F_NO_DRAG = 64;
	/** Lies flat (horizontal) instead of facing the camera. */
	public static final int F_FLAT = 128;
	/** Moves towards (x+dx, y+dy, z+dz) instead of using dx/dy/dz as velocity. */
	public static final int F_ATTRACT = 256;

	public static MapCodec<FxParticleOptions> codec(ParticleType<FxParticleOptions> type) {
		return RecordCodecBuilder.mapCodec(
			instance -> instance.group(
					Codec.INT.optionalFieldOf("color", 0xFFFFFF).forGetter(FxParticleOptions::color),
					Codec.INT.optionalFieldOf("fade_color", 0xFFFFFF).forGetter(FxParticleOptions::fadeColor),
					Codec.FLOAT.optionalFieldOf("size", 0.25F).forGetter(FxParticleOptions::size),
					Codec.INT.optionalFieldOf("lifetime", 20).forGetter(FxParticleOptions::lifetime),
					Codec.FLOAT.optionalFieldOf("gravity", 0.0F).forGetter(FxParticleOptions::gravity),
					Codec.INT.optionalFieldOf("flags", F_ADDITIVE).forGetter(FxParticleOptions::flags)
				)
				.apply(instance, (color, fade, size, life, gravity, flags) -> new FxParticleOptions(type, color, fade, size, life, gravity, flags))
		);
	}

	public static StreamCodec<RegistryFriendlyByteBuf, FxParticleOptions> streamCodec(ParticleType<FxParticleOptions> type) {
		return StreamCodec.composite(
			ByteBufCodecs.INT, FxParticleOptions::color,
			ByteBufCodecs.INT, FxParticleOptions::fadeColor,
			ByteBufCodecs.FLOAT, FxParticleOptions::size,
			ByteBufCodecs.VAR_INT, FxParticleOptions::lifetime,
			ByteBufCodecs.FLOAT, FxParticleOptions::gravity,
			ByteBufCodecs.VAR_INT, FxParticleOptions::flags,
			(color, fade, size, life, gravity, flags) -> new FxParticleOptions(type, color, fade, size, life, gravity, flags)
		);
	}

	@Override
	public ParticleType<FxParticleOptions> getType() {
		return this.type;
	}

	public static FxParticleOptions glow(int color, float size, int lifetime) {
		return new FxParticleOptions(ModParticles.GLOW, color, color, size, lifetime, 0.0F, F_ADDITIVE | F_SHRINK);
	}

	public static FxParticleOptions of(ParticleType<FxParticleOptions> type, int color, int fade, float size, int lifetime, float gravity, int flags) {
		return new FxParticleOptions(type, color, fade, size, lifetime, gravity, flags);
	}
}
