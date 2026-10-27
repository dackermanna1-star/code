package com.realweather.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A single snowflake: falls near terminal velocity, flutters and spins, is carried by the wind (with gusts),
 * settles on the ground and melts away.
 */
public final class SnowflakeParticle extends WeatherParticle {
	private final float fallSpeed;
	private final float flutterAmplitude;
	private final float flutterFrequency;
	private final float flutterPhase;
	private final float spin;
	private float windX;
	private float windZ;
	private int landedTicks = -1;

	public SnowflakeParticle(ClientLevel level, double x, double y, double z, float windX, float windZ, float sizeScale) {
		super(level, x, y, z, ParticleSprites.get("snowflake", 0), SingleQuadParticle.Layer.TRANSLUCENT);
		this.setSprite(ParticleSprites.get("snowflake", this.random.nextInt(6)));
		// Log-uniform sizes: many small flakes, few large aggregates.
		this.quadSize = (float) (0.022 * Math.pow(4.5, this.random.nextFloat())) * sizeScale;
		this.fallSpeed = 0.045F + 0.03F * this.random.nextFloat() + this.quadSize * 0.08F;
		this.flutterAmplitude = 0.012F + this.random.nextFloat() * 0.02F;
		this.flutterFrequency = 0.18F + this.random.nextFloat() * 0.25F;
		this.flutterPhase = this.random.nextFloat() * Mth.TWO_PI;
		this.spin = (this.random.nextFloat() - 0.5F) * 0.12F;
		this.windX = windX;
		this.windZ = windZ;
		this.xd = windX / 20.0F;
		this.zd = windZ / 20.0F;
		this.yd = -this.fallSpeed;
		this.lifetime = 160 + this.random.nextInt(80);
		this.baseAlpha = 0.9F;
		this.fadeIn = 0.04F;
		this.fadeOut = 0.08F;
		this.roll = this.random.nextFloat() * Mth.TWO_PI;
		this.oRoll = this.roll;
		float shade = 0.92F + this.random.nextFloat() * 0.08F;
		this.setColor(shade, shade, Math.min(1.0F, shade + 0.03F));
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
		if (this.landedTicks >= 0) {
			// Resting on the ground: shrink and fade as it melts or merges with the snow cover.
			if (++this.landedTicks > 25) {
				this.remove();
			}
			this.baseAlpha *= 0.94F;
			return;
		}
		float flutter = Mth.sin(this.age * this.flutterFrequency + this.flutterPhase) * this.flutterAmplitude;
		// Light flakes respond quickly to the wind; their drag relaxes the velocity towards the air speed.
		this.xd += (this.windX / 20.0F - this.xd) * 0.12F;
		this.zd += (this.windZ / 20.0F - this.zd) * 0.12F;
		this.yd += (-this.fallSpeed - this.yd) * 0.2F;
		this.x += this.xd + flutter * Mth.cos(this.flutterPhase);
		this.y += this.yd + flutter * 0.3F;
		this.z += this.zd + flutter * Mth.sin(this.flutterPhase);
		this.roll += this.spin;
		this.setPos(this.x, this.y, this.z);

		if ((this.age & 1) == 0) {
			double ground = surfaceHeight(this.level, this.x, this.y, this.z);
			if (this.y <= ground + 0.01) {
				this.y = ground + 0.01;
				this.setPos(this.x, this.y, this.z);
				this.landedTicks = 0;
			}
		}
	}

	/** Top of the first motion-blocking block below, including partial blocks such as snow layers and slabs. */
	static double surfaceHeight(ClientLevel level, double x, double y, double z) {
		int bx = Mth.floor(x);
		int bz = Mth.floor(z);
		int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, bx, bz);
		if (y > top + 1.0) {
			return top;
		}
		BlockPos pos = new BlockPos(bx, top, bz);
		BlockState state = level.getBlockState(pos);
		if (!state.isAir()) {
			VoxelShape shape = state.getShape(level, pos);
			if (!shape.isEmpty()) {
				return top + shape.max(net.minecraft.core.Direction.Axis.Y);
			}
		}
		return top;
	}
}
