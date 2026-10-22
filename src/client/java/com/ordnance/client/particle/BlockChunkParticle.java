package com.ordnance.client.particle;

import java.util.List;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.client.texture.SpriteAtlasTexture;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.jspecify.annotations.Nullable;

/**
 * A chip of an actual block (its particle texture and tint) thrown by an explosion, with tumbling, bouncing
 * physics. Lighter than a {@code DebrisEntity}, used for the bulk of the visual debris.
 */
public class BlockChunkParticle extends BillboardParticle {
	private final float sampleU;
	private final float sampleV;
	private final float spinRate;
	private final BillboardParticle.RenderType renderType;
	private boolean resting;

	private BlockChunkParticle(ClientWorld world, double x, double y, double z, Vec3d velocity, BlockState state, float size, int life) {
		super(world, x, y, z, MinecraftClient.getInstance().getBlockRenderManager().getModels().getModelParticleSprite(state));
		this.velocityX = velocity.x;
		this.velocityY = velocity.y;
		this.velocityZ = velocity.z;
		this.gravityStrength = 1.2F;
		this.scale = size;
		this.maxAge = life;
		this.collidesWithWorld = true;
		this.red = 0.75F;
		this.green = 0.75F;
		this.blue = 0.75F;
		if (!state.isOf(Blocks.GRASS_BLOCK)) {
			int tint = MinecraftClient.getInstance().getBlockColors().getColor(state, world, BlockPos.ofFloored(x, y, z), 0);
			if (tint != -1) {
				this.red *= (tint >> 16 & 0xFF) / 255.0F;
				this.green *= (tint >> 8 & 0xFF) / 255.0F;
				this.blue *= (tint & 0xFF) / 255.0F;
			}
		}

		this.sampleU = this.random.nextFloat() * 3.0F;
		this.sampleV = this.random.nextFloat() * 3.0F;
		this.spinRate = (this.random.nextFloat() - 0.5F) * 0.8F;
		this.zRotation = this.random.nextFloat() * MathHelper.TAU;
		this.lastZRotation = this.zRotation;
		this.renderType = this.sprite.getAtlasId().equals(SpriteAtlasTexture.BLOCK_ATLAS_TEXTURE)
			? BillboardParticle.RenderType.BLOCK_ATLAS_TRANSLUCENT
			: BillboardParticle.RenderType.ITEM_ATLAS_TRANSLUCENT;
	}

	@Nullable
	public static BlockChunkParticle spawn(ClientWorld world, Vec3d pos, Vec3d velocity, BlockState state, float size, int life) {
		if (state.isAir() || !state.hasBlockBreakParticles() || !ParticleBudget.tryAcquire()) {
			return null;
		}

		BlockChunkParticle particle = new BlockChunkParticle(world, pos.x, pos.y, pos.z, velocity, state, size, life);
		MinecraftClient.getInstance().particleManager.addParticle(particle);
		return particle;
	}

	@Override
	public void tick() {
		this.lastX = this.x;
		this.lastY = this.y;
		this.lastZ = this.z;
		this.lastZRotation = this.zRotation;
		if (this.age++ >= this.maxAge) {
			this.markDead();
			return;
		}

		if (this.resting) {
			return;
		}

		this.velocityY -= 0.04 * this.gravityStrength;
		Vec3d wanted = new Vec3d(this.velocityX, this.velocityY, this.velocityZ);
		Vec3d adjusted = Entity.adjustMovementForCollisions(null, wanted, this.getBoundingBox(), this.world, List.of());
		this.setBoundingBox(this.getBoundingBox().offset(adjusted));
		this.repositionFromBoundingBox();
		if (Math.abs(adjusted.x - wanted.x) > 1.0E-6) this.velocityX *= -0.3;
		if (Math.abs(adjusted.z - wanted.z) > 1.0E-6) this.velocityZ *= -0.3;
		if (Math.abs(adjusted.y - wanted.y) > 1.0E-6) {
			if (Math.abs(this.velocityY) > 0.12) {
				this.velocityY *= -0.3;
				this.velocityX *= 0.6;
				this.velocityZ *= 0.6;
			} else if (wanted.y < 0.0) {
				this.resting = true;
				this.velocityX = this.velocityY = this.velocityZ = 0.0;
			}
		}

		this.velocityX *= 0.98;
		this.velocityY *= 0.98;
		this.velocityZ *= 0.98;
		this.zRotation += this.spinRate;
	}

	@Override
	public void markDead() {
		if (!this.dead) {
			ParticleBudget.release();
		}

		super.markDead();
	}

	@Override
	public BillboardParticle.RenderType getRenderType() {
		return this.renderType;
	}

	@Override
	protected float getMinU() {
		return this.sprite.getFrameU((this.sampleU + 1.0F) / 4.0F);
	}

	@Override
	protected float getMaxU() {
		return this.sprite.getFrameU(this.sampleU / 4.0F);
	}

	@Override
	protected float getMinV() {
		return this.sprite.getFrameV(this.sampleV / 4.0F);
	}

	@Override
	protected float getMaxV() {
		return this.sprite.getFrameV((this.sampleV + 1.0F) / 4.0F);
	}

	@Override
	public int getBrightness(float tint) {
		BlockPos pos = BlockPos.ofFloored(this.x, this.y, this.z);
		return this.world.isChunkLoaded(pos) ? WorldRenderer.getLightmapCoordinates(this.world, pos) : 0;
	}
}
