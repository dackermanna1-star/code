package com.realweather.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;

/** A small crown splash where a raindrop hits a surface; plays through a short sprite sequence. */
public final class RainSplashParticle extends WeatherParticle {
	private static final int FRAMES = 5;

	public RainSplashParticle(ClientLevel level, double x, double y, double z, float size, float brightness) {
		super(level, x, y, z, ParticleSprites.get("splash", 0), SingleQuadParticle.Layer.TRANSLUCENT);
		this.lifetime = 5 + this.random.nextInt(3);
		this.quadSize = size;
		this.baseAlpha = 0.75F;
		this.fadeIn = 0.0F;
		this.fadeOut = 0.35F;
		this.setColor(0.86F * brightness, 0.9F * brightness, 0.97F * brightness);
	}

	@Override
	public void tick() {
		super.tick();
		if (!this.removed) {
			int frame = Math.min(FRAMES - 1, this.age * FRAMES / Math.max(1, this.lifetime));
			this.setSprite(ParticleSprites.get("splash", frame));
		}
	}

	@Override
	public SingleQuadParticle.FacingCameraMode getFacingCameraMode() {
		return SingleQuadParticle.FacingCameraMode.LOOKAT_Y;
	}
}
