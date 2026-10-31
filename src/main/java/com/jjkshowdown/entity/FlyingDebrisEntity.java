package com.jjkshowdown.entity;

import com.jjkshowdown.registry.ModEntities;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
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
import org.jetbrains.annotations.Nullable;

/**
 * Purely visual chunk of terrain thrown by techniques. Never places a block (no duplication), shatters on landing.
 */
public class FlyingDebrisEntity extends Entity {
	private static final EntityDataAccessor<BlockState> STATE = SynchedEntityData.defineId(FlyingDebrisEntity.class, EntityDataSerializers.BLOCK_STATE);
	private static final EntityDataAccessor<Integer> ATTRACTOR = SynchedEntityData.defineId(FlyingDebrisEntity.class, EntityDataSerializers.INT);
	private static final int MAX_ALIVE = 400;
	private static int alive;

	private int life = 50;
	private Vec3 attractorPos;
	public float spinX, spinY, spinZ;

	public FlyingDebrisEntity(EntityType<? extends FlyingDebrisEntity> type, Level level) {
		super(type, level);
		spinX = (random.nextFloat() - 0.5f) * 40;
		spinY = (random.nextFloat() - 0.5f) * 40;
		spinZ = (random.nextFloat() - 0.5f) * 40;
	}

	@Nullable
	public static FlyingDebrisEntity spawn(ServerLevel level, Vec3 pos, BlockState state, Vec3 velocity) {
		if (alive >= MAX_ALIVE) return null;
		FlyingDebrisEntity d = new FlyingDebrisEntity(ModEntities.DEBRIS, level);
		d.setPos(pos.x, pos.y, pos.z);
		d.entityData.set(STATE, state);
		d.setDeltaMovement(velocity);
		d.life = 40 + level.getRandom().nextInt(40);
		if (level.addFreshEntity(d)) {
			alive++;
			return d;
		}
		return null;
	}

	public void setAttractor(int entityId, Vec3 pos) {
		entityData.set(ATTRACTOR, entityId);
		attractorPos = pos;
		life = 100;
	}

	public BlockState blockState() {
		return entityData.get(STATE);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(STATE, Blocks.STONE.defaultBlockState());
		builder.define(ATTRACTOR, -1);
	}

	@Override
	public void tick() {
		super.tick();
		Vec3 v = getDeltaMovement();
		int attractor = entityData.get(ATTRACTOR);
		Entity a = attractor >= 0 ? level().getEntity(attractor) : null;
		if (a != null && a.isAlive()) {
			Vec3 c = a.position();
			Vec3 d = c.subtract(position());
			double dist = d.length();
			Vec3 tangent = d.cross(new Vec3(0, 1, 0)).normalize().scale(0.12);
			v = v.scale(0.82).add(d.normalize().scale(Math.min(0.35, 0.06 + dist * 0.04))).add(tangent);
			setDeltaMovement(v);
			setPos(getX() + v.x, getY() + v.y, getZ() + v.z);
		} else {
			if (attractor >= 0 && !level().isClientSide()) {
				// singularity collapsed: flung outward
				entityData.set(ATTRACTOR, -1);
				v = new Vec3(random.nextGaussian() * 0.5, 0.3 + random.nextDouble() * 0.4, random.nextGaussian() * 0.5);
				life = Math.min(life, tickCount + 30);
			}
			v = v.add(0, -0.045, 0).scale(0.985);
			setDeltaMovement(v);
			move(MoverType.SELF, v);
			if (onGround() && tickCount > 3 && !level().isClientSide()) {
				shatter();
				return;
			}
		}
		if (!level().isClientSide() && tickCount > life) shatter();
	}

	private void shatter() {
		if (level() instanceof ServerLevel sl) {
			sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, blockState()), getX(), getY() + 0.4, getZ(), 12, 0.3, 0.3, 0.3, 0.1);
		}
		discard();
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		super.onRemoval(reason);
		if (!level().isClientSide()) alive = Math.max(0, alive - 1);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean shouldBeSaved() {
		return false;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
