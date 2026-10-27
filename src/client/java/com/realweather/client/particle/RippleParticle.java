package com.realweather.client.particle;

import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.state.QuadParticleRenderState;
import net.minecraft.util.Mth;
import org.joml.Quaternionf;

/** An expanding, fading ring lying flat on a water surface. */
public final class RippleParticle extends WeatherParticle {
	private static final Quaternionf FLAT = new Quaternionf().rotationX(-Mth.HALF_PI);
	private final float maxSize;

	public RippleParticle(ClientLevel level, double x, double y, double z, float maxSize) {
		super(level, x, y, z, ParticleSprites.get("ripple", 0), SingleQuadParticle.Layer.TRANSLUCENT);
		this.maxSize = maxSize;
		this.lifetime = 14 + this.random.nextInt(10);
		this.baseAlpha = 0.55F;
		this.fadeIn = 0.05F;
		this.fadeOut = 0.7F;
		this.setColor(0.9F, 0.94F, 1.0F);
		if (this.random.nextBoolean()) {
			this.setSprite(ParticleSprites.get("ripple", 1));
		}
	}

	@Override
	public float getQuadSize(float partialTick) {
		float life = Mth.clamp((this.age + partialTick) / this.lifetime, 0.0F, 1.0F);
		// Fast initial expansion that slows down, like a real capillary ring.
		return this.maxSize * (0.12F + 0.88F * (1.0F - (1.0F - life) * (1.0F - life)));
	}

	@Override
	public void extract(QuadParticleRenderState state, Camera camera, float partialTick) {
		this.alpha = this.lifeAlpha(partialTick);
		if (this.alpha > 0.003F) {
			this.extractRotatedQuad(state, camera, FLAT, partialTick);
		}
	}
}
