package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.registry.ModEntities;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * A chunk of terrain flung by an impact (or dragged into a singularity). Renders as its block, spins,
 * and on landing either re-settles as a block or shatters. A global cap keeps entity counts bounded.
 */
public class FlyingDebrisEntity extends Entity implements EffectEntity {
	private static final EntityDataAccessor<BlockState> DATA_BLOCK = SynchedEntityData.defineId(FlyingDebrisEntity.class, EntityDataSerializers.BLOCK_STATE);
	private static final EntityDataAccessor<Float> DATA_SCALE = SynchedEntityData.defineId(FlyingDebrisEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> DATA_ATTRACTOR = SynchedEntityData.defineId(FlyingDebrisEntity.class, EntityDataSerializers.INT);
	private static final AtomicInteger ALIVE = new AtomicInteger();

	private boolean counted;
	private boolean placeOnLand = true;
	private int life;

	/** Live instances are never saved, so a starting server always begins from zero. */
	public static void resetLiveCount() {
		ALIVE.set(0);
	}

	public FlyingDebrisEntity(EntityType<? extends FlyingDebrisEntity> type, Level level) {
		super(type, level);
	}

	public static int alive() {
		return ALIVE.get();
	}

	/** Spawns debris if the global cap allows it. Returns null when capped. */
	public static @Nullable FlyingDebrisEntity spawn(ServerLevel level, Vec3 pos, BlockState state, Vec3 velocity, float scale) {
		if (state.isAir() || ALIVE.get() >= GodforgeConfig.get().performance.maxDebrisEntities) {
			return null;
		}
		FlyingDebrisEntity debris = new FlyingDebrisEntity(ModEntities.FLYING_DEBRIS, level);
		debris.setPos(pos);
		debris.entityData.set(DATA_BLOCK, state.hasBlockEntity() ? Blocks.COBBLESTONE.defaultBlockState() : state);
		debris.entityData.set(DATA_SCALE, scale);
		debris.setDeltaMovement(velocity);
		debris.placeOnLand = GodforgeConfig.get().general.debrisPlacesBlocks && !state.is(BlockTags.LEAVES) && state.getFluidState().isEmpty();
		if (level.addFreshEntity(debris)) {
			debris.counted = true;
			ALIVE.incrementAndGet();
			return debris;
		}
		return null;
	}

	/** Makes the debris fly into an entity (black hole) instead of falling. */
	public void attractTo(Entity target) {
		this.entityData.set(DATA_ATTRACTOR, target.getId());
		this.placeOnLand = false;
		this.noPhysics = true;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_BLOCK, Blocks.STONE.defaultBlockState());
		builder.define(DATA_SCALE, 1.0F);
		builder.define(DATA_ATTRACTOR, -1);
	}

	public BlockState blockState() {
		return this.entityData.get(DATA_BLOCK);
	}

	public float scale() {
		return this.entityData.get(DATA_SCALE);
	}

	public int life() {
		return this.life;
	}

	@Override
	public void tick() {
		super.tick();
		this.life++;
		if (this.level() instanceof ServerLevel server && !server.isPositionEntityTicking(BlockPos.containing(this.position().add(this.getDeltaMovement())))) {
			// about to leave the ticking world, where it would sit frozen and still count against the debris cap
			this.discard();
			return;
		}
		int attractor = this.entityData.get(DATA_ATTRACTOR);
		if (attractor >= 0) {
			Entity target = this.level().getEntity(attractor);
			if (target == null || !target.isAlive()) {
				this.entityData.set(DATA_ATTRACTOR, -1);
				this.noPhysics = false;
			} else {
				Vec3 to = target.position().subtract(this.position());
				double dist = to.length();
				if (dist < 1.2 + (target instanceof SingularityEntity s ? s.horizonRadius() : 0.0)) {
					if (!this.level().isClientSide() && target instanceof SingularityEntity singularity) {
						singularity.absorb(0.6F);
					}
					this.discard();
					return;
				}
				Vec3 dir = to.normalize();
				// spiral inward: tangential component fades as the debris gets closer
				Vec3 tangent = new Vec3(-dir.z, 0, dir.x).scale(0.35 * Math.min(1.0, dist / 12.0));
				Vec3 velocity = this.getDeltaMovement().scale(0.9).add(dir.scale(0.12 + 2.0 / Math.max(2.0, dist))).add(tangent.scale(0.1));
				this.setDeltaMovement(velocity);
				this.setPos(this.position().add(velocity));
				return;
			}
		}
		if (!this.isNoGravity()) {
			this.setDeltaMovement(this.getDeltaMovement().add(0, -0.06, 0));
		}
		this.move(MoverType.SELF, this.getDeltaMovement());
		this.setDeltaMovement(this.getDeltaMovement().scale(0.985));
		if (this.level() instanceof ServerLevel server) {
			if (this.life > 6 && (this.onGround() || this.horizontalCollision)) {
				this.land(server);
			} else if (this.life > 240 || this.getY() < this.level().getMinY() - 16) {
				this.discard();
			}
		}
	}

	private void land(ServerLevel level) {
		BlockState state = this.blockState();
		BlockPos pos = this.blockPosition();
		boolean placed = false;
		BlockState here = Loaded.state(level, pos);
		BlockState below = Loaded.state(level, pos.below());
		if (this.placeOnLand && here != null && below != null && here.canBeReplaced() && !below.isAir() && BlockOps.isWithinBorder(level, pos)) {
			placed = level.setBlock(pos, state, BlockOps.FAST_PLACE);
		}
		if (!placed) {
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, state), this.getX(), this.getY() + 0.5, this.getZ(), 12, 0.3, 0.3, 0.3, 0.15);
		}
		this.discard();
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		// runs for every removal, including chunk unloads that bypass remove()
		if (this.counted) {
			this.counted = false;
			ALIVE.decrementAndGet();
		}
		super.onRemoval(reason);
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 192.0 * 192.0;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
