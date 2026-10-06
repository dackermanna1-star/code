package com.gojosatoru.particle;

import com.gojosatoru.GojoRegistry;
import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * A soft additive glow particle.
 *
 * @param shape    {@link #DOT}, {@link #SPARK} or {@link #RING}
 * @param color    RGB color
 * @param alpha    peak opacity
 * @param scale    quad size in blocks
 * @param lifetime ticks to live
 * @param drag     velocity multiplier applied each tick (1 = keeps its speed)
 */
public record GlowParticleOptions(int shape, int color, float alpha, float scale, int lifetime, float drag) implements ParticleOptions {
    public static final int DOT = 0;
    public static final int SPARK = 1;
    public static final int RING = 2;

    public static final MapCodec<GlowParticleOptions> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
            Codec.INT.fieldOf("shape").forGetter(GlowParticleOptions::shape),
            Codec.INT.fieldOf("color").forGetter(GlowParticleOptions::color),
            Codec.FLOAT.fieldOf("alpha").forGetter(GlowParticleOptions::alpha),
            Codec.FLOAT.fieldOf("scale").forGetter(GlowParticleOptions::scale),
            Codec.INT.fieldOf("lifetime").forGetter(GlowParticleOptions::lifetime),
            Codec.FLOAT.fieldOf("drag").forGetter(GlowParticleOptions::drag)
    ).apply(i, GlowParticleOptions::new));

    public static final StreamCodec<RegistryFriendlyByteBuf, GlowParticleOptions> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, GlowParticleOptions::shape,
            ByteBufCodecs.INT, GlowParticleOptions::color,
            ByteBufCodecs.FLOAT, GlowParticleOptions::alpha,
            ByteBufCodecs.FLOAT, GlowParticleOptions::scale,
            ByteBufCodecs.VAR_INT, GlowParticleOptions::lifetime,
            ByteBufCodecs.FLOAT, GlowParticleOptions::drag,
            GlowParticleOptions::new);

    public static GlowParticleOptions dot(int color, float scale, int lifetime) {
        return new GlowParticleOptions(DOT, color, 1.0F, scale, lifetime, 1.0F);
    }

    public static GlowParticleOptions spark(int color, float scale, int lifetime) {
        return new GlowParticleOptions(SPARK, color, 1.0F, scale, lifetime, 0.9F);
    }

    @Override
    public ParticleType<GlowParticleOptions> getType() {
        return GojoRegistry.GLOW;
    }
}
