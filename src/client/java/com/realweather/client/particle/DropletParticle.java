package com.realweather.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;

/** Tiny droplets thrown up by heavy rain hitting the ground. */
public final class DropletParticle extends WeatherParticle {
	private final double floor;

	public DropletParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz) {
		super(level, x, y, z, ParticleSprites.get("droplet"), SingleQuadParticle.Layer.TRANSLUCENT);
		this.floor = y;
		this.xd = vx;
		this.yd = vy;
		this.zd = vz;
		this.gravity = 1.1F;
		this.friction = 0.96F;
		this.lifetime = 10 + this.random.nextInt(6);
		this.quadSize = 0.018F + this.random.nextFloat() * 0.02F;
		this.baseAlpha = 0.8F;
		this.fadeIn = 0.0F;
		this.setColor(0.85F, 0.9F, 1.0F);
	}

	@Override
	public void tick() {
		super.tick();
		if (this.y < this.floor && this.yd < 0.0) {
			this.remove();
		}
	}
}
