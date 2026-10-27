package com.realweather.client.particle;

import com.realweather.client.render.RealWeatherRenderTypes;
import net.minecraft.client.multiplayer.ClientLevel;

/**
 * Large, very soft puff used for rain spray above the ground, wind-blown spindrift in blizzards and dust in
 * desert winds. Rendered without the vanilla alpha cut-off so it can be almost transparent.
 */
public final class MistParticle extends WeatherParticle {
	private final float growth;
	private final float windResponse;
	private float windX;
	private float windZ;

	public MistParticle(ClientLevel level, double x, double y, double z, float size, float alpha, float r, float g, float b, float windX, float windZ,
			int lifetime, float windResponse) {
		super(level, x, y, z, ParticleSprites.get("mist", 0), RealWeatherRenderTypes.SOFT_PARTICLES);
		this.setSprite(ParticleSprites.get("mist", this.random.nextInt(3)));
		this.quadSize = size;
		this.growth = 1.0F + this.random.nextFloat() * 0.6F;
		this.baseAlpha = alpha;
		this.fadeIn = 0.3F;
		this.fadeOut = 0.45F;
		this.lifetime = lifetime;
		this.windX = windX;
		this.windZ = windZ;
		this.windResponse = windResponse;
		this.xd = windX / 20.0F * windResponse;
		this.zd = windZ / 20.0F * windResponse;
		this.yd = 0.002F + this.random.nextFloat() * 0.004F;
		this.setColor(r, g, b);
		this.roll = this.random.nextFloat() * 6.2831855F;
		this.oRoll = this.roll;
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
		this.xd += (this.windX / 20.0F * this.windResponse - this.xd) * 0.05F;
		this.zd += (this.windZ / 20.0F * this.windResponse - this.zd) * 0.05F;
		this.x += this.xd;
		this.y += this.yd;
		this.z += this.zd;
		this.roll += 0.003F;
		this.setPos(this.x, this.y, this.z);
	}

	@Override
	public float getQuadSize(float partialTick) {
		float life = (this.age + partialTick) / this.lifetime;
		return this.quadSize * (1.0F + (this.growth - 1.0F) * life);
	}
}
