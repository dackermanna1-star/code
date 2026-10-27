package com.realweather.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.util.Mth;

/**
 * Base class for RealWeather particles. They skip vanilla's per-particle collision (expensive with thousands of
 * flakes) and instead do cheap, explicit ground checks where needed.
 */
public abstract class WeatherParticle extends SingleQuadParticle {
	private final SingleQuadParticle.Layer layer;
	protected float baseAlpha = 1.0F;
	protected float fadeIn = 0.1F;
	protected float fadeOut = 0.25F;

	protected WeatherParticle(ClientLevel level, double x, double y, double z, TextureAtlasSprite sprite, SingleQuadParticle.Layer layer) {
		super(level, x, y, z, sprite);
		this.layer = layer;
		this.hasPhysics = false;
		this.gravity = 0.0F;
		this.friction = 1.0F;
		this.xd = 0.0;
		this.yd = 0.0;
		this.zd = 0.0;
	}

	@Override
	protected SingleQuadParticle.Layer getLayer() {
		return this.layer;
	}

	/** Alpha envelope over the particle's life. */
	protected float lifeAlpha(float partialTick) {
		float life = Mth.clamp((this.age + partialTick) / Math.max(1, this.lifetime), 0.0F, 1.0F);
		float in = this.fadeIn <= 0.0F ? 1.0F : Mth.clamp(life / this.fadeIn, 0.0F, 1.0F);
		float out = this.fadeOut <= 0.0F ? 1.0F : Mth.clamp((1.0F - life) / this.fadeOut, 0.0F, 1.0F);
		return this.baseAlpha * in * out;
	}

	@Override
	public void extract(net.minecraft.client.renderer.state.QuadParticleRenderState state, net.minecraft.client.Camera camera, float partialTick) {
		this.alpha = this.lifeAlpha(partialTick);
		if (this.alpha <= 0.003F) {
			return;
		}
		super.extract(state, camera, partialTick);
	}
}
