package dev.portalgun.entity;

import dev.portalgun.registry.ModEntities;
import dev.portalgun.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** The glowing green bolt fired by the portal gun. Wherever it lands, a portal opens. */
public class PortalShotEntity extends ThrowableProjectile {
	public static final int MAX_FLIGHT_TICKS = 26;
	private Identifier destination = Identifier.withDefaultNamespace("overworld");

	public PortalShotEntity(EntityType<? extends PortalShotEntity> type, Level level) {
		super(type, level);
	}

	public PortalShotEntity(ServerLevel level, LivingEntity shooter, Identifier destination) {
		super(ModEntities.PORTAL_SHOT, level);
		this.setOwner(shooter);
		this.setPos(shooter.getX(), shooter.getEyeY() - 0.15, shooter.getZ());
		this.destination = destination;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
	}

	@Override
	protected double getDefaultGravity() {
		return 0.0;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level().isClientSide()) {
			Vec3 v = this.getDeltaMovement();
			for (int i = 0; i < 3; i++) {
				double t = i / 3.0;
				this.level().addParticle(ModParticles.PORTAL_SPARK,
					this.getX() - v.x * t + (this.random.nextDouble() - 0.5) * 0.15,
					this.getY() - v.y * t + (this.random.nextDouble() - 0.5) * 0.15,
					this.getZ() - v.z * t + (this.random.nextDouble() - 0.5) * 0.15,
					0, 0, 0);
			}
			return;
		}
		if (this.isAlive() && this.tickCount > MAX_FLIGHT_TICKS) {
			this.openInAir();
		}
	}

	@Override
	protected void onHitBlock(BlockHitResult hit) {
		super.onHitBlock(hit);
		if (this.level().isClientSide() || !this.isAlive()) {
			return;
		}
		ServerLevel level = (ServerLevel) this.level();
		Direction face = hit.getDirection();
		Vec3 p = hit.getLocation();
		Vec3 center;
		if (face == Direction.UP) {
			center = new Vec3(p.x, p.y + 0.03, p.z);
		} else if (face == Direction.DOWN) {
			center = new Vec3(p.x, p.y - 0.03, p.z);
		} else {
			Vec3 n = Vec3.atLowerCornerOf(face.getUnitVec3i());
			Vec3 front = p.add(n.scale(0.04));
			double bottom = findFloor(level, front.add(n.scale(0.5)), front.y - PortalEntity.HEIGHT / 2);
			center = new Vec3(front.x, bottom + PortalEntity.HEIGHT / 2, front.z);
		}
		this.open(level, center, face);
	}

	@Override
	protected void onHitEntity(EntityHitResult hit) {
		if (this.level().isClientSide() || !this.isAlive()) {
			return;
		}
		ServerLevel level = (ServerLevel) this.level();
		Entity target = hit.getEntity();
		Direction facing = Direction.fromYRot(this.getYRot() + 180.0F);
		Vec3 t = target.position();
		this.open(level, new Vec3(t.x, target.getY() + PortalEntity.HEIGHT / 2 - 0.05, t.z), facing);
	}

	@Override
	protected boolean canHitEntity(Entity entity) {
		return !(entity instanceof PortalEntity) && !(entity instanceof PortalShotEntity) && super.canHitEntity(entity);
	}

	private void openInAir() {
		ServerLevel level = (ServerLevel) this.level();
		Vec3 v = this.getDeltaMovement();
		Direction facing = Direction.getApproximateNearest(-v.x, 0, -v.z);
		if (facing.getAxis() == Direction.Axis.Y) {
			facing = Direction.NORTH;
		}
		Vec3 p = this.position();
		double bottom = findFloor(level, p, p.y - PortalEntity.HEIGHT / 2);
		this.open(level, new Vec3(p.x, bottom + PortalEntity.HEIGHT / 2, p.z), facing);
	}

	/** Snaps a standing portal down to the floor when there is ground within a few blocks. */
	private static double findFloor(ServerLevel level, Vec3 probe, double fallback) {
		BlockPos.MutableBlockPos pos = BlockPos.containing(probe).mutable();
		for (int i = 0; i < 4; i++) {
			BlockState below = level.getBlockState(pos.below());
			if (!below.getCollisionShape(level, pos.below()).isEmpty()) {
				double top = pos.getY() - 1 + below.getCollisionShape(level, pos.below()).max(Direction.Axis.Y);
				return top + 0.02;
			}
			pos.move(Direction.DOWN);
		}
		return fallback;
	}

	private void open(ServerLevel level, Vec3 center, Direction facing) {
		PortalEntity portal = PortalEntity.create(level, center, facing, this.destination, this.getOwner());
		level.addFreshEntity(portal);
		this.discard();
	}

	@Override
	protected void onHit(HitResult result) {
		super.onHit(result);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput in) {
		super.readAdditionalSaveData(in);
		this.destination = in.read("destination", Identifier.CODEC).orElse(Identifier.withDefaultNamespace("overworld"));
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput out) {
		super.addAdditionalSaveData(out);
		out.store("destination", Identifier.CODEC, this.destination);
	}
}
