package com.ordnance.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.FlyingItemEntity;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.entity.projectile.ProjectileUtil;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Base for Ordnance projectiles: carries the item it was made from (for rendering and to know its warhead) and
 * provides swept collision with per-axis bounce response.
 */
public abstract class OrdnanceProjectileEntity extends ProjectileEntity implements FlyingItemEntity {
	private static final TrackedData<ItemStack> ITEM = DataTracker.registerData(OrdnanceProjectileEntity.class, TrackedDataHandlerRegistry.ITEM_STACK);
	protected double distanceTravelled;
	/** Client-side spin angle for renderers. */
	public float spin;
	public float lastSpin;

	protected OrdnanceProjectileEntity(EntityType<? extends OrdnanceProjectileEntity> type, World world) {
		super(type, world);
	}

	protected abstract Item getDefaultItem();

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(ITEM, new ItemStack(this.getDefaultItem()));
	}

	public void setItem(ItemStack stack) {
		this.dataTracker.set(ITEM, stack.isEmpty() ? new ItemStack(this.getDefaultItem()) : stack.copyWithCount(1));
	}

	@Override
	public ItemStack getStack() {
		return this.dataTracker.get(ITEM);
	}

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.put("Item", ItemStack.CODEC, this.getStack());
		view.putDouble("Travelled", this.distanceTravelled);
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.setItem(view.read("Item", ItemStack.CODEC).orElseGet(() -> new ItemStack(this.getDefaultItem())));
		this.distanceTravelled = view.getDouble("Travelled", 0.0);
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 128.0 * 128.0 * getRenderDistanceMultiplier() * getRenderDistanceMultiplier();
	}

	@Override
	public boolean canUsePortals(boolean allowVehicles) {
		return false;
	}

	public double getDistanceTravelled() {
		return this.distanceTravelled;
	}

	/** Moves by the current velocity with block collision and reports which axes were blocked. */
	protected Collision moveWithCollisions() {
		Vec3d motion = this.getVelocity();
		Vec3d start = this.getEntityPos();
		this.move(MovementType.SELF, motion);
		Vec3d moved = this.getEntityPos().subtract(start);
		this.distanceTravelled += moved.length();
		return new Collision(
			motion,
			!MathHelper.approximatelyEquals(motion.x, moved.x),
			!MathHelper.approximatelyEquals(motion.y, moved.y),
			!MathHelper.approximatelyEquals(motion.z, moved.z)
		);
	}

	/** Reflects the blocked velocity components; tangential motion is damped while touching a surface. */
	protected void bounce(Collision collision, double restitution, double friction) {
		Vec3d v = collision.motion();
		double x = v.x;
		double y = v.y;
		double z = v.z;
		if (collision.x()) {
			x = -x * restitution;
		}

		if (collision.z()) {
			z = -z * restitution;
		}

		if (collision.y()) {
			y = -y * restitution;
			x *= friction;
			z *= friction;
			if (Math.abs(y) < 0.06) {
				y = 0.0;
			}
		}

		this.setVelocity(x, y, z);
	}

	@Nullable
	protected EntityHitResult findEntityHit(Vec3d start, Vec3d end) {
		return ProjectileUtil.getEntityCollision(
			this.getEntityWorld(), this, start, end, this.getBoundingBox().stretch(end.subtract(start)).expand(1.0), this::canHit
		);
	}

	protected void updateRotationFromVelocity() {
		Vec3d v = this.getVelocity();
		if (v.lengthSquared() > 1.0E-6) {
			this.setYaw((float)(MathHelper.atan2(v.x, v.z) * 180.0F / (float)Math.PI));
			this.setPitch((float)(MathHelper.atan2(v.y, v.horizontalLength()) * 180.0F / (float)Math.PI));
		}
	}

	protected void updateSpin(float rate) {
		this.lastSpin = this.spin;
		this.spin += rate;
	}

	public record Collision(Vec3d motion, boolean x, boolean y, boolean z) {
		public boolean any() {
			return this.x || this.y || this.z;
		}

		public double impactSpeed() {
			double s = 0.0;
			if (this.x) s = Math.max(s, Math.abs(this.motion.x));
			if (this.y) s = Math.max(s, Math.abs(this.motion.y));
			if (this.z) s = Math.max(s, Math.abs(this.motion.z));
			return s;
		}
	}
}
