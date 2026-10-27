package com.realweather.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/** A leaf torn off by the wind: tumbles, flutters and is carried along by gusts before settling. */
public final class LeafParticle extends WeatherParticle {
	private final float tumble;
	private final float phase;
	private float windX;
	private float windZ;
	private boolean landed;

	public LeafParticle(ClientLevel level, double x, double y, double z, int color, float windX, float windZ) {
		super(level, x, y, z, ParticleSprites.get("leaf", 0), SingleQuadParticle.Layer.TRANSLUCENT);
		this.setSprite(ParticleSprites.get("leaf", this.random.nextInt(4)));
		this.quadSize = 0.05F + this.random.nextFloat() * 0.05F;
		this.lifetime = 100 + this.random.nextInt(80);
		this.tumble = (this.random.nextFloat() - 0.5F) * 0.5F;
		this.phase = this.random.nextFloat() * Mth.TWO_PI;
		this.windX = windX;
		this.windZ = windZ;
		this.xd = windX / 20.0F * 0.5F;
		this.zd = windZ / 20.0F * 0.5F;
		this.yd = -0.01F;
		this.baseAlpha = 1.0F;
		this.fadeIn = 0.02F;
		this.fadeOut = 0.15F;
		float variation = 0.85F + this.random.nextFloat() * 0.25F;
		this.setColor(Math.min(1.0F, ARGB.redFloat(color) * variation), Math.min(1.0F, ARGB.greenFloat(color) * variation),
			Math.min(1.0F, ARGB.blueFloat(color) * variation));
		this.roll = this.random.nextFloat() * Mth.TWO_PI;
		this.oRoll = this.roll;
	}

	public void setWind(float windX, float windZ) {
		this.windX = windX;
		this.windZ = windZ;
	}

	@Override
	public void tick() {
		this.xo = this.x;
		this.yo = this.y;
		this.zo = this.z;
		this.oRoll = this.roll;
		if (this.age++ >= this.lifetime) {
			this.remove();
			return;
		}
		if (this.landed) {
			return;
		}
		float flutter = Mth.sin(this.age * 0.35F + this.phase);
		this.xd += (this.windX / 20.0F * 0.75F - this.xd) * 0.06F;
		this.zd += (this.windZ / 20.0F * 0.75F - this.zd) * 0.06F;
		this.yd += (-0.035F - flutter * 0.02F - this.yd) * 0.1F;
		this.x += this.xd;
		this.y += this.yd;
		this.z += this.zd;
		this.roll += this.tumble * (0.6F + 0.4F * flutter);
		this.setPos(this.x, this.y, this.z);
		if ((this.age & 3) == 0 && this.y <= SnowflakeParticle.surfaceHeight(this.level, this.x, this.y, this.z) + 0.02) {
			this.landed = true;
			this.age = Math.max(this.age, this.lifetime - 30);
		}
	}
}
