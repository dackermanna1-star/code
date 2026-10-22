package com.ordnance.entity;

import com.ordnance.ClientBridge;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItems;
import com.ordnance.weapon.MissileStrikeManager;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.item.Item;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Terminal-phase hypersonic missile. Flies a straight line from its release point to the designated target at
 * constant speed (so clients can extrapolate it exactly) and detonates on the first block it meets.
 */
public class HypersonicMissileEntity extends OrdnanceProjectileEntity {
	private Vec3d target = Vec3d.ZERO;
	private int strikeId = -1;

	public HypersonicMissileEntity(EntityType<? extends HypersonicMissileEntity> type, World world) {
		super(type, world);
	}

	public HypersonicMissileEntity(World world, Vec3d start, Vec3d target, double speed, @Nullable Entity owner, int strikeId) {
		this(ModEntities.HYPERSONIC_MISSILE, world);
		this.setPosition(start);
		this.target = target;
		this.strikeId = strikeId;
		this.setOwner(owner);
		this.setVelocity(target.subtract(start).normalize().multiply(speed));
		this.updateRotationFromVelocity();
		this.lastYaw = this.getYaw();
		this.lastPitch = this.getPitch();
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.HYPERSONIC_MISSILE;
	}

	@Override
	public boolean hasNoGravity() {
		return true;
	}

	@Override
	public void tick() {
		super.tick();
		World world = this.getEntityWorld();
		Vec3d velocity = this.getVelocity();
		Vec3d start = this.getEntityPos();
		Vec3d end = start.add(velocity);
		if (!world.isClient()) {
			double remaining = this.target.distanceTo(start);
			BlockHitResult hit = world.raycast(new RaycastContext(start, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.ANY, this));
			if (hit.getType() != HitResult.Type.MISS) {
				this.detonate(hit.getPos().subtract(velocity.normalize().multiply(0.3)));
				return;
			}

			if (remaining <= velocity.length() || this.age > 600) {
				this.detonate(this.target);
				return;
			}
		}

		this.setPosition(end);
		this.updateRotationFromVelocity();
		this.updateSpin(9.0F);
		if (world.isClient()) {
			ClientBridge.get().entityTick(this);
		}
	}

	private void detonate(Vec3d pos) {
		ServerWorld world = (ServerWorld)this.getEntityWorld();
		Vec3d dir = this.getVelocity().normalize();
		this.discard();
		MissileStrikeManager.onImpact(world, this.strikeId);
		OrdnanceExplosion.detonate(world, pos, ExplosionProfile.HYPERSONIC_MISSILE, this, this.getOwner(), dir);
	}

	@Override
	public boolean shouldRender(double distance) {
		return true;
	}

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.putDouble("TargetX", this.target.x);
		view.putDouble("TargetY", this.target.y);
		view.putDouble("TargetZ", this.target.z);
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.target = new Vec3d(view.getDouble("TargetX", this.getX()), view.getDouble("TargetY", this.getY()), view.getDouble("TargetZ", this.getZ()));
	}
}
