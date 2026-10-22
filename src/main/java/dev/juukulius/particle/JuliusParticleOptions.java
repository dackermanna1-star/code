package dev.juukulius.particle;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.util.ExtraCodecs;

/**
 * Options shared by every Julius particle: tint colour (RGB), size multiplier and lifetime in ticks (0 = default).
 */
public final class JuliusParticleOptions implements ParticleOptions {
	private final ParticleType<JuliusParticleOptions> type;
	private final int color;
	private final float scale;
	private final int lifetime;

	public JuliusParticleOptions(ParticleType<JuliusParticleOptions> type, int color, float scale, int lifetime) {
		this.type = type;
		this.color = color & 0xFFFFFF;
		this.scale = scale;
		this.lifetime = lifetime;
	}

	public static MapCodec<JuliusParticleOptions> codec(ParticleType<JuliusParticleOptions> type) {
		return RecordCodecBuilder.mapCodec(instance -> instance.group(
				ExtraCodecs.RGB_COLOR_CODEC.optionalFieldOf("color", 0xFFFFFF).forGetter(JuliusParticleOptions::color),
				Codec.FLOAT.optionalFieldOf("scale", 1.0F).forGetter(JuliusParticleOptions::scale),
				Codec.INT.optionalFieldOf("lifetime", 0).forGetter(JuliusParticleOptions::lifetime)
			)
			.apply(instance, (color, scale, lifetime) -> new JuliusParticleOptions(type, color, scale, lifetime)));
	}

	public static StreamCodec<ByteBuf, JuliusParticleOptions> streamCodec(ParticleType<JuliusParticleOptions> type) {
		return StreamCodec.composite(
			ByteBufCodecs.INT, JuliusParticleOptions::color,
			ByteBufCodecs.FLOAT, JuliusParticleOptions::scale,
			ByteBufCodecs.VAR_INT, JuliusParticleOptions::lifetime,
			(color, scale, lifetime) -> new JuliusParticleOptions(type, color, scale, lifetime)
		);
	}

	@Override
	public ParticleType<JuliusParticleOptions> getType() {
		return this.type;
	}

	public int color() {
		return this.color;
	}

	public float scale() {
		return this.scale;
	}

	public int lifetime() {
		return this.lifetime;
	}

	public float red() {
		return ((this.color >> 16) & 0xFF) / 255.0F;
	}

	public float green() {
		return ((this.color >> 8) & 0xFF) / 255.0F;
	}

	public float blue() {
		return (this.color & 0xFF) / 255.0F;
	}
}
