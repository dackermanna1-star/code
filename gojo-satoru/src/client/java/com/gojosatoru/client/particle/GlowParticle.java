package com.gojosatoru.client.particle;

import com.gojosatoru.GojoMod;
import com.gojosatoru.particle.GlowParticleOptions;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import java.util.List;
import net.fabricmc.fabric.api.client.particle.v1.FabricSpriteProvider;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/** Soft, additively blended glow. Overlapping particles add up into bright cores, like real light. */
public class GlowParticle extends SingleQuadParticle {
    private static final RenderPipeline PIPELINE = RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
            .withLocation(GojoMod.id("pipeline/glow_particle"))
            .withFragmentShader(GojoMod.id("core/glow_particle"))
            .withBlend(BlendFunction.LIGHTNING)
            .withDepthWrite(false)
            .build();
    public static final Layer ADDITIVE = new Layer(true, TextureAtlas.LOCATION_PARTICLES, PIPELINE);

    private final int shape;
    private final float baseSize;
    private final float baseAlpha;
    private final float fadeInTicks;

    protected GlowParticle(ClientLevel level, double x, double y, double z, double xd, double yd, double zd,
                           GlowParticleOptions options, TextureAtlasSprite sprite) {
        super(level, x, y, z, sprite);
        this.xd = xd;
        this.yd = yd;
        this.zd = zd;
        this.shape = options.shape();
        this.lifetime = Math.max(1, options.lifetime());
        this.friction = options.drag();
        this.gravity = 0.0F;
        this.hasPhysics = false;
        this.baseSize = options.scale() * 0.5F;
        this.baseAlpha = options.alpha();
        this.fadeInTicks = Math.max(1.0F, this.lifetime * 0.12F);
        int color = options.color();
        this.setColor(((color >> 16) & 0xFF) / 255.0F, ((color >> 8) & 0xFF) / 255.0F, (color & 0xFF) / 255.0F);
        if (this.shape == GlowParticleOptions.SPARK) {
            this.roll = this.random.nextFloat() * Mth.TWO_PI;
            this.oRoll = this.roll;
        }
        this.updateLook();
    }

    private void updateLook() {
        float t = Math.min(1.0F, (float) this.age / this.lifetime);
        float fadeIn = Math.min(1.0F, (this.age + 1) / this.fadeInTicks);
        float fadeOut = t > 0.5F ? 1.0F - (t - 0.5F) / 0.5F : 1.0F;
        this.alpha = this.baseAlpha * fadeIn * Math.max(0.0F, fadeOut);
        this.quadSize = this.shape == GlowParticleOptions.RING
                ? this.baseSize * (0.3F + 1.5F * t)
                : this.baseSize * (1.0F - 0.4F * t);
    }

    @Override
    public void tick() {
        super.tick();
        this.updateLook();
    }

    @Override
    protected Layer getLayer() {
        return ADDITIVE;
    }

    @Override
    public int getLightColor(float partialTick) {
        return LightTexture.FULL_BRIGHT;
    }

    public static final class Provider implements ParticleProvider<GlowParticleOptions> {
        private final FabricSpriteProvider sprites;

        public Provider(FabricSpriteProvider sprites) {
            this.sprites = sprites;
        }

        @Override
        public Particle createParticle(GlowParticleOptions options, ClientLevel level, double x, double y, double z,
                                       double xd, double yd, double zd, RandomSource random) {
            List<TextureAtlasSprite> list = this.sprites.getSprites();
            TextureAtlasSprite sprite = list.get(Mth.clamp(options.shape(), 0, list.size() - 1));
            return new GlowParticle(level, x, y, z, xd, yd, zd, options, sprite);
        }
    }
}
