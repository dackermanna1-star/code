package dev.juukulius.entity;

import dev.juukulius.combat.CombatUtil;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Base for Julius's art projectiles: straight (or steered) flight without gravity, a hard lifetime, owner-aware
 * targeting through {@link CombatUtil#canHarm}, and never saved to disk.
 */
public abstract class JuliusProjectile extends Projectile {
	protected int lifetime = 40;

	protected JuliusProjectile(EntityType<? extends JuliusProjectile> type, Level level) {
		super(type, level);
		this.setNoGravity(true);
		this.noPhysics = true;
	}

	protected void launch(Entity owner, Vec3 position, Vec3 direction, double speed) {
		this.setOwner(owner);
		this.setPos(position);
		Vec3 velocity = direction.normalize().scale(speed);
		this.setDeltaMovement(velocity);
		this.faceVelocity(velocity);
	}

	protected void faceVelocity(Vec3 velocity) {
		double horizontal = velocity.horizontalDistance();
		this.setYRot((float) (Math.atan2(velocity.x, velocity.z) * (180.0 / Math.PI)));
		this.setXRot((float) (Math.atan2(velocity.y, horizontal) * (180.0 / Math.PI)));
		this.yRotO = this.getYRot();
		this.xRotO = this.getXRot();
	}

	@Override
	public void tick() {
		super.tick();
		Vec3 motion = this.getDeltaMovement();
		Vec3 from = this.position();
		Vec3 to = from.add(motion);
		if (this.level() instanceof ServerLevel serverLevel) {
			if (this.tickCount > this.lifetime) {
				this.onExpire(serverLevel);
				this.discard();
				return;
			}

			this.steer(serverLevel);
			motion = this.getDeltaMovement();
			to = from.add(motion);
			BlockHitResult blockHit = this.level().clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this));
			Vec3 end = blockHit.getType() != HitResult.Type.MISS ? blockHit.getLocation() : to;
			if (this.sweepEntities(serverLevel, from, end) || this.isRemoved()) {
				return;
			}

			if (blockHit.getType() != HitResult.Type.MISS) {
				this.setPos(end);
				this.onBlockImpact(serverLevel, blockHit);
				return;
			}
		} else {
			this.spawnTrail(from, motion);
		}

		this.setPos(to);
		this.faceVelocity(motion);
	}

	/** Checks entities along the swept segment. Return true to stop processing this tick (e.g. exploded). */
	protected abstract boolean sweepEntities(ServerLevel level, Vec3 from, Vec3 to);

	/**
	 * Targets this tick's path passes through, nearest first. Unlike {@code ProjectileUtil}, a target whose (inflated)
	 * box already contains the segment start counts as hit, so a step that ends exactly on a hitbox edge cannot let the
	 * projectile slip through.
	 */
	protected List<EntityHitResult> sweepHits(ServerLevel level, Vec3 from, Vec3 to, double margin) {
		AABB area = this.getBoundingBox().expandTowards(to.subtract(from)).inflate(1.0 + margin);
		List<EntityHitResult> hits = new ArrayList<>();
		for (Entity candidate : level.getEntities(this, area, this::canHitEntity)) {
			AABB box = candidate.getBoundingBox().inflate(margin);
			if (box.contains(from)) {
				hits.add(new EntityHitResult(candidate, from));
			} else {
				box.clip(from, to).ifPresent(point -> hits.add(new EntityHitResult(candidate, point)));
			}
		}

		hits.sort(Comparator.comparingDouble(hit -> hit.getLocation().distanceToSqr(from)));
		return hits;
	}

	protected abstract void onBlockImpact(ServerLevel level, BlockHitResult hit);

	protected void onExpire(ServerLevel level) {
	}

	protected void steer(ServerLevel level) {
	}

	protected void spawnTrail(Vec3 position, Vec3 motion) {
	}

	protected @Nullable ServerPlayer ownerPlayer() {
		return this.getOwner() instanceof ServerPlayer player ? player : null;
	}

	@Override
	protected boolean canHitEntity(Entity entity) {
		Entity owner = this.getOwner();
		return entity != owner && super.canHitEntity(entity) && (owner == null || CombatUtil.canHarm(owner, entity));
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 128.0 * 128.0;
	}

	@Override
	public boolean hurtServer(ServerLevel level, net.minecraft.world.damagesource.DamageSource source, float amount) {
		return false;
	}
}
