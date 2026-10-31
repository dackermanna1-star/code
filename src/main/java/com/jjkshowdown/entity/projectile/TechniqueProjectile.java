package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/**
 * Base class for moving technique projectiles. Movement is simulated identically on both sides (smooth visuals);
 * collisions, damage and destruction are server-only. Not saved to disk: techniques are momentary.
 */
public abstract class TechniqueProjectile extends Projectile {
	protected static final EntityDataAccessor<Float> SCALE = SynchedEntityData.defineId(TechniqueProjectile.class, EntityDataSerializers.FLOAT);
	protected static final EntityDataAccessor<Float> CHARGE = SynchedEntityData.defineId(TechniqueProjectile.class, EntityDataSerializers.FLOAT);
	protected static final EntityDataAccessor<Float> ROLL = SynchedEntityData.defineId(TechniqueProjectile.class, EntityDataSerializers.FLOAT);

	protected float damage = 4f;
	protected int maxLife = 60;
	protected int pierce = 0;
	protected final Set<Integer> hitEntities = new HashSet<>();
	protected boolean dead;

	protected TechniqueProjectile(EntityType<? extends TechniqueProjectile> type, Level level) {
		super(type, level);
		this.setNoGravity(true);
		this.noPhysics = true;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(SCALE, 1.0f);
		builder.define(CHARGE, 0.0f);
		builder.define(ROLL, 0.0f);
	}

	public float scale() {
		return this.entityData.get(SCALE);
	}

	public void setScale(float s) {
		this.entityData.set(SCALE, s);
	}

	public float charge() {
		return this.entityData.get(CHARGE);
	}

	public void setCharge(float c) {
		this.entityData.set(CHARGE, c);
	}

	public float roll() {
		return this.entityData.get(ROLL);
	}

	public void setRoll(float r) {
		this.entityData.set(ROLL, r);
	}

	public void setDamage(float damage) {
		this.damage = damage;
	}

	public void setMaxLife(int maxLife) {
		this.maxLife = maxLife;
	}

	@Nullable
	public LivingEntity ownerLiving() {
		return getOwner() instanceof LivingEntity le ? le : null;
	}

	/** Launch along a direction with a speed in blocks per tick. */
	public void launch(Vec3 from, Vec3 dir, double speed) {
		this.setPos(from.x, from.y, from.z);
		Vec3 v = dir.normalize().scale(speed);
		this.setDeltaMovement(v);
		ProjectileUtil.rotateTowardsMovement(this, 1.0f);
		this.yRotO = this.getYRot();
		this.xRotO = this.getXRot();
	}

	// ------------------------------------------------------------------------------------------------ behaviour hooks

	protected boolean collidesWithBlocks() {
		return true;
	}

	/** Extra hit margin around targets. */
	protected double hitInflate() {
		return 0.3 * scale();
	}

	protected boolean bypassesInfinity() {
		return false;
	}

	protected double gravity() {
		return 0;
	}

	protected void onTechniqueHitEntity(ServerLevel level, LivingEntity target) {
	}

	/** Return true to stop the projectile. */
	protected boolean onTechniqueHitBlock(ServerLevel level, BlockHitResult hit) {
		return true;
	}

	protected void onExpire(ServerLevel level) {
	}

	/** Called every tick on the server after movement (area effects). */
	protected void serverTick(ServerLevel level, Vec3 from, Vec3 to) {
	}

	/** Called every tick on the client (trails). */
	protected void clientTick() {
	}

	/** Hook when Infinity stops this projectile. */
	protected void onInfinityStopped(ServerLevel level, LivingEntity gojo) {
		Fx.particles(level, ModParticles.BLUE_SPARK, position(), 12, 0.3, 0.05);
		Fx.sound(level, position(), ModSounds.INFINITY_BLOCK, 1.0f, 0.9f + random.nextFloat() * 0.2f);
		discard();
	}

	// ------------------------------------------------------------------------------------------------ tick

	@Override
	public void tick() {
		super.tick();
		Vec3 pos = position();
		Vec3 vel = getDeltaMovement();
		if (gravity() > 0) vel = vel.add(0, -gravity(), 0);
		Vec3 next = pos.add(vel);

		if (level() instanceof ServerLevel level) {
			if (tickCount > maxLife) {
				onExpire(level);
				if (!isRemoved()) discard();
				return;
			}
			// Infinity: everything slows to a halt before it reaches Gojo
			if (!bypassesInfinity()) {
				for (Entity e : level.getEntities(this, getBoundingBox().expandTowards(vel).inflate(3.0 + scale()),
						en -> en != getOwner() && Sorcerers.hasInfinity(en))) {
					LivingEntity gojo = (LivingEntity) e;
					if (Targeting.distanceToSegment(gojo.getBoundingBox().getCenter(), pos, next) < 2.2 + scale() * 0.5) {
						onInfinityStopped(level, gojo);
						return;
					}
				}
			}
			// blocks
			if (collidesWithBlocks()) {
				BlockHitResult bhr = level.clip(new ClipContext(pos, next, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this));
				if (bhr.getType() != HitResult.Type.MISS) {
					// entities between us and the block still get hit first
					hitEntitiesAlong(level, pos, bhr.getLocation());
					if (isRemoved()) return;
					setPos(bhr.getLocation().x, bhr.getLocation().y, bhr.getLocation().z);
					if (onTechniqueHitBlock(level, bhr)) {
						dead = true;
						if (!isRemoved()) discard();
						return;
					}
				}
			}
			hitEntitiesAlong(level, pos, next);
			if (isRemoved()) return;
			serverTick(level, pos, next);
			if (isRemoved()) return;
		} else {
			clientTick();
		}
		setDeltaMovement(vel);
		setPos(next.x, next.y, next.z);
		ProjectileUtil.rotateTowardsMovement(this, 0.5f);
	}

	private void hitEntitiesAlong(ServerLevel level, Vec3 from, Vec3 to) {
		AABB sweep = getBoundingBox().expandTowards(to.subtract(from)).inflate(hitInflate() + 0.5);
		LivingEntity owner = ownerLiving();
		for (Entity e : level.getEntities(this, sweep, owner != null ? Targeting.hostileTo(owner) : en -> en instanceof LivingEntity)) {
			if (hitEntities.contains(e.getId())) continue;
			AABB box = e.getBoundingBox().inflate(hitInflate() + getBbWidth() * 0.5);
			Optional<Vec3> clip = box.clip(from, to);
			if (clip.isEmpty() && !box.contains(from)) continue;
			hitEntities.add(e.getId());
			onTechniqueHitEntity(level, (LivingEntity) e);
			if (isRemoved()) return;
			if (hitEntities.size() > pierce) {
				dead = true;
				discard();
				return;
			}
		}
	}

	// ------------------------------------------------------------------------------------------------ misc

	@Override
	public boolean shouldBeSaved() {
		return false;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean canBeHitByProjectile() {
		return false;
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double d) {
		return d < 160 * 160;
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
