package com.godforge.entity;

import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Base for Godforge projectiles: deterministic straight-line motion on both sides, swept collision on the
 * server, generic synced size/charge slots for renderers, and no persistence (effects never outlive a session).
 */
public abstract class GfProjectile extends Projectile implements EffectEntity {
	protected static final EntityDataAccessor<Float> DATA_SIZE = SynchedEntityData.defineId(GfProjectile.class, EntityDataSerializers.FLOAT);
	protected static final EntityDataAccessor<Float> DATA_CHARGE = SynchedEntityData.defineId(GfProjectile.class, EntityDataSerializers.FLOAT);
	protected static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(GfProjectile.class, EntityDataSerializers.INT);

	protected int age;
	protected int maxAge = 200;
	protected double gravity;
	/** Allow terrain changes (captured from the weapon settings when fired). */
	protected boolean terrain = true;

	protected GfProjectile(EntityType<? extends GfProjectile> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_SIZE, 1.0F);
		builder.define(DATA_CHARGE, 1.0F);
		builder.define(DATA_VARIANT, 0);
	}

	public float size() {
		return this.entityData.get(DATA_SIZE);
	}

	public void setSize(float size) {
		this.entityData.set(DATA_SIZE, size);
	}

	public float charge() {
		return this.entityData.get(DATA_CHARGE);
	}

	public void setCharge(float charge) {
		this.entityData.set(DATA_CHARGE, charge);
	}

	public int variant() {
		return this.entityData.get(DATA_VARIANT);
	}

	public void setVariant(int variant) {
		this.entityData.set(DATA_VARIANT, variant);
	}

	public void setTerrain(boolean terrain) {
		this.terrain = terrain;
	}

	public int age() {
		return this.age;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.heldTick()) {
			return;
		}
		Vec3 start = this.position();
		Vec3 motion = this.getDeltaMovement();
		if (this.gravity != 0.0) {
			motion = motion.add(0, -this.gravity, 0);
			this.setDeltaMovement(motion);
		}
		Vec3 end = start.add(motion);
		if (this.level() instanceof ServerLevel server) {
			if (this.age++ > this.maxAge) {
				this.onExpire(server);
				if (!this.isRemoved()) {
					this.discard();
				}
				return;
			}
			end = this.serverMove(server, start, end);
			if (!this.isRemoved() && !server.isPositionEntityTicking(BlockPos.containing(end))) {
				// entities freeze outside ticking chunks; vanish instead of hanging there forever
				this.discard();
				return;
			}
		} else {
			this.age++;
			this.clientTick(start, end);
		}
		if (!this.isRemoved()) {
			this.setPos(end);
			this.updateRotationFromMotion();
		}
	}

	protected void updateRotationFromMotion() {
		Vec3 m = this.getDeltaMovement();
		if (m.lengthSqr() > 1.0E-6) {
			double h = m.horizontalDistance();
			this.setYRot((float) (Math.atan2(m.x, m.z) * 180.0 / Math.PI));
			this.setXRot((float) (Math.atan2(m.y, h) * 180.0 / Math.PI));
			this.yRotO = this.getYRot();
			this.xRotO = this.getXRot();
		}
	}

	/**
	 * Default server movement: stops at the first block or entity hit and calls the hit hooks.
	 * Phasing projectiles override this.
	 */
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		Vec3 reach = Loaded.clampRay(level, start, end);
		BlockHitResult blockHit = level.clip(new ClipContext(start, reach, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this));
		Vec3 limit = blockHit.getType() == HitResult.Type.MISS ? reach : blockHit.getLocation();
		AABB sweep = this.getBoundingBox().expandTowards(limit.subtract(start)).inflate(1.0 + this.hitInflate());
		EntityHitResult entityHit = ProjectileUtil.getEntityHitResult(level, this, start, limit, sweep, this::canHitEntity, (float) this.hitInflate());
		if (entityHit != null) {
			this.onHitEntity(entityHit);
			return entityHit.getLocation();
		}
		if (blockHit.getType() != HitResult.Type.MISS) {
			this.onHitBlock(blockHit);
			return limit;
		}
		if (reach != end) {
			// flew out of the loaded world: nothing out there can be affected, so just vanish
			this.discard();
			return reach;
		}
		return end;
	}

	/** Return true while the projectile is being held (charging) instead of flying. */
	protected boolean heldTick() {
		return false;
	}

	protected double hitInflate() {
		return 0.3;
	}

	@Override
	protected boolean canHitEntity(Entity entity) {
		return !(entity instanceof com.godforge.util.EffectEntity) && super.canHitEntity(entity);
	}

	protected void onExpire(ServerLevel level) {
	}

	protected void clientTick(Vec3 start, Vec3 end) {
	}

	public @Nullable Entity ownerEntity() {
		return this.getOwner();
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		double d = 256.0 + this.size() * 32.0;
		return distance < d * d;
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
	public boolean isOnFire() {
		return false;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
	}
}
