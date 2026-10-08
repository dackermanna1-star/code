package dev.portalgun.entity;

import dev.portalgun.registry.ModEntities;
import dev.portalgun.registry.ModParticles;
import dev.portalgun.registry.ModSounds;
import dev.portalgun.travel.PortalTravel;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.Direction;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * A swirling green portal. Its position is the center of the disc. The facing is the direction the
 * front of the disc points: horizontal for wall/standing portals, UP for floor portals, DOWN for
 * ceiling portals. Anything that touches the disc is sent to {@link #destination}.
 */
public class PortalEntity extends Entity {
	public static final float WIDTH = 2.0F;
	public static final float HEIGHT = 2.7F;
	public static final float FLOOR_DIAMETER = 2.4F;
	public static final int DEFAULT_LIFE = 20 * 30;
	public static final int CLOSE_TICKS = 14;
	public static final int OPEN_TICKS = 10;

	private static final EntityDataAccessor<Direction> FACING = SynchedEntityData.defineId(PortalEntity.class, EntityDataSerializers.DIRECTION);
	private static final EntityDataAccessor<Boolean> CLOSING = SynchedEntityData.defineId(PortalEntity.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<String> DESTINATION = SynchedEntityData.defineId(PortalEntity.class, EntityDataSerializers.STRING);

	private int life = DEFAULT_LIFE;
	private int closeTimer = -1;
	/** Fixed arrival point on the other side (set for return portals, or after the first traversal). */
	private @Nullable Vec3 arrival;
	private float arrivalYaw;
	/** Where things come out when they travel back through our partner portal. */
	private @Nullable Vec3 returnArrival;
	private float returnYaw;
	private @Nullable UUID partner;
	private boolean returnPortal;
	private @Nullable UUID owner;

	/** Client-side animation clock. */
	public int clientAge;
	public int clientCloseAge = -1;

	public PortalEntity(EntityType<? extends PortalEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	public static PortalEntity create(ServerLevel level, Vec3 center, Direction facing, Identifier destination, @Nullable Entity owner) {
		PortalEntity portal = new PortalEntity(ModEntities.PORTAL, level);
		portal.setFacing(facing);
		portal.setDestination(destination);
		portal.setPos(center);
		portal.setYRot(facing.getAxis().isHorizontal() ? facing.toYRot() : 0.0F);
		if (owner != null) {
			portal.owner = owner.getUUID();
		}
		portal.computeReturnArrival(owner);
		return portal;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(FACING, Direction.NORTH);
		builder.define(CLOSING, false);
		builder.define(DESTINATION, "minecraft:overworld");
	}

	public Direction getFacing() {
		return this.entityData.get(FACING);
	}

	public void setFacing(Direction facing) {
		this.entityData.set(FACING, facing);
		this.setBoundingBox(this.makeBoundingBox());
	}

	public Identifier getDestination() {
		Identifier id = Identifier.tryParse(this.entityData.get(DESTINATION));
		return id != null ? id : Identifier.withDefaultNamespace("overworld");
	}

	public void setDestination(Identifier id) {
		this.entityData.set(DESTINATION, id.toString());
	}

	public boolean isClosing() {
		return this.entityData.get(CLOSING);
	}

	public boolean isFloorOrCeiling() {
		return this.getFacing().getAxis() == Direction.Axis.Y;
	}

	@Override
	public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
		super.onSyncedDataUpdated(accessor);
		if (FACING.equals(accessor)) {
			this.setBoundingBox(this.makeBoundingBox());
		}
	}

	@Override
	protected AABB makeBoundingBox(Vec3 pos) {
		Direction facing = this.entityData == null ? Direction.NORTH : this.getFacing();
		double t = 0.2;
		return switch (facing.getAxis()) {
			case X -> new AABB(pos.x - t, pos.y - HEIGHT / 2, pos.z - WIDTH / 2, pos.x + t, pos.y + HEIGHT / 2, pos.z + WIDTH / 2);
			case Z -> new AABB(pos.x - WIDTH / 2, pos.y - HEIGHT / 2, pos.z - t, pos.x + WIDTH / 2, pos.y + HEIGHT / 2, pos.z + t);
			case Y -> new AABB(pos.x - FLOOR_DIAMETER / 2, pos.y - t, pos.z - FLOOR_DIAMETER / 2,
				pos.x + FLOOR_DIAMETER / 2, pos.y + t, pos.z + FLOOR_DIAMETER / 2);
		};
	}

	/** Point (in front of this portal) where something travelling back through our partner should appear. */
	private void computeReturnArrival(@Nullable Entity shooter) {
		Direction f = this.getFacing();
		Vec3 c = this.position();
		if (f.getAxis().isHorizontal()) {
			Vec3 n = Vec3.atLowerCornerOf(f.getUnitVec3i());
			this.returnArrival = new Vec3(c.x + n.x * 1.3, c.y - HEIGHT / 2 + 0.05, c.z + n.z * 1.3);
			this.returnYaw = f.toYRot();
		} else {
			// floor/ceiling portal: come out next to it, on the side the shooter stood on
			Vec3 away = new Vec3(0, 0, 1);
			if (shooter != null) {
				Vec3 d = shooter.position().subtract(c);
				Vec3 h = new Vec3(d.x, 0, d.z);
				if (h.lengthSqr() > 1.0E-4) {
					away = h.normalize();
				}
			}
			double y = f == Direction.UP ? c.y + 0.05 : c.y - 2.0;
			this.returnArrival = new Vec3(c.x + away.x * 1.9, y, c.z + away.z * 1.9);
			this.returnYaw = (float) (Mth.atan2(away.z, away.x) * (180F / Math.PI)) - 90.0F;
		}
	}

	public @Nullable Vec3 getReturnArrival() {
		return this.returnArrival;
	}

	public float getReturnYaw() {
		return this.returnYaw;
	}

	public @Nullable Vec3 getArrival() {
		return this.arrival;
	}

	public float getArrivalYaw() {
		return this.arrivalYaw;
	}

	public void setArrival(Vec3 arrival, float yaw) {
		this.arrival = arrival;
		this.arrivalYaw = yaw;
	}

	public @Nullable UUID getPartner() {
		return this.partner;
	}

	public void setPartner(@Nullable UUID partner) {
		this.partner = partner;
	}

	public boolean isReturnPortal() {
		return this.returnPortal;
	}

	public void setReturnPortal(boolean returnPortal) {
		this.returnPortal = returnPortal;
	}

	public void setLife(int life) {
		this.life = life;
	}

	/** Keep the portal open a little longer (someone just used it). */
	public void keepOpen(int minTicks) {
		if (!this.isClosing() && this.life < minTicks) {
			this.life = minTicks;
		}
	}

	public void close() {
		if (!this.isClosing() && !this.level().isClientSide()) {
			this.entityData.set(CLOSING, true);
			this.closeTimer = CLOSE_TICKS;
			this.level().playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PORTAL_CLOSE, SoundSource.NEUTRAL, 1.0F, 1.0F);
		}
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level().isClientSide()) {
			this.clientAge++;
			if (this.isClosing()) {
				if (this.clientCloseAge < 0) {
					this.clientCloseAge = 0;
				}
				this.clientCloseAge++;
			}
			this.spawnClientParticles();
			return;
		}
		ServerLevel level = (ServerLevel) this.level();
		if (this.isClosing()) {
			if (--this.closeTimer <= 0) {
				this.discard();
			}
			return;
		}
		if (--this.life <= 0) {
			this.close();
			return;
		}
		if (this.tickCount == 1) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PORTAL_OPEN, SoundSource.NEUTRAL, 1.2F, 0.9F + this.random.nextFloat() * 0.2F);
		} else if (this.tickCount % 70 == 0) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PORTAL_IDLE, SoundSource.NEUTRAL, 0.5F, 0.9F + this.random.nextFloat() * 0.2F);
		}
		if (this.tickCount < 4) {
			return;
		}
		List<Entity> touching = level.getEntities(this, this.getBoundingBox().inflate(0.15), this::canTravel);
		for (Entity entity : touching) {
			if (this.touchesDisc(entity)) {
				PortalTravel.travel(this, entity);
			}
		}
	}

	private boolean canTravel(Entity entity) {
		if (!entity.isAlive() || entity instanceof PortalEntity || entity.isPassenger() || entity.isOnPortalCooldown()) {
			return false;
		}
		if (entity instanceof Projectile && !(entity instanceof PortalShotEntity)) {
			return true;
		}
		return !(entity instanceof PortalShotEntity) && entity.canUsePortal(false);
	}

	/** Checks the entity actually overlaps the (elliptical) disc rather than just the box corners. */
	private boolean touchesDisc(Entity entity) {
		Vec3 c = this.position();
		AABB box = entity.getBoundingBox();
		Vec3 e = box.getCenter();
		Direction f = this.getFacing();
		if (f.getAxis() == Direction.Axis.Y) {
			double dx = e.x - c.x;
			double dz = e.z - c.z;
			double r = FLOOR_DIAMETER / 2 + Math.min(box.getXsize(), 0.6) / 2 - 0.2;
			if (dx * dx + dz * dz > r * r) {
				return false;
			}
			return f == Direction.UP ? box.minY <= c.y + 0.25 && box.maxY > c.y - 0.1 : box.maxY >= c.y - 0.25 && box.minY < c.y + 0.1;
		}
		double along;
		double depth;
		if (f.getAxis() == Direction.Axis.X) {
			along = e.z - c.z;
			depth = Math.abs(e.x - c.x) - box.getXsize() / 2;
		} else {
			along = e.x - c.x;
			depth = Math.abs(e.z - c.z) - box.getZsize() / 2;
		}
		if (depth > 0.15) {
			return false;
		}
		// the entity's vertical span must overlap the ellipse at that horizontal offset
		double a = WIDTH / 2;
		double b = HEIGHT / 2;
		double u = Math.min(1.0, Math.abs(along) / a);
		double half = b * Math.sqrt(Math.max(0.0, 1 - u * u));
		return box.minY < c.y + half - 0.1 && box.maxY > c.y - half + 0.1;
	}

	private void spawnClientParticles() {
		if (this.random.nextInt(2) != 0) {
			return;
		}
		Direction f = this.getFacing();
		double ang = this.random.nextDouble() * Math.PI * 2;
		double rr = 0.85 + this.random.nextDouble() * 0.2;
		double u = Math.cos(ang) * rr;
		double v = Math.sin(ang) * rr;
		Vec3 c = this.position();
		double x;
		double y;
		double z;
		double vx;
		double vy;
		double vz;
		Vec3 n = Vec3.atLowerCornerOf(f.getUnitVec3i());
		double out = 0.02 + this.random.nextDouble() * 0.04;
		if (f.getAxis() == Direction.Axis.Y) {
			x = c.x + u * FLOOR_DIAMETER / 2;
			y = c.y + n.y * 0.05;
			z = c.z + v * FLOOR_DIAMETER / 2;
		} else if (f.getAxis() == Direction.Axis.X) {
			x = c.x + n.x * 0.05;
			y = c.y + v * HEIGHT / 2;
			z = c.z + u * WIDTH / 2;
		} else {
			x = c.x + u * WIDTH / 2;
			y = c.y + v * HEIGHT / 2;
			z = c.z + n.z * 0.05;
		}
		vx = n.x * out + (this.random.nextDouble() - 0.5) * 0.02;
		vy = n.y * out + (this.random.nextDouble() - 0.5) * 0.02;
		vz = n.z * out + (this.random.nextDouble() - 0.5) * 0.02;
		this.level().addParticle(ModParticles.PORTAL_SPARK, x, y, z, vx, vy, vz);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput in) {
		this.setFacing(in.read("facing", Direction.CODEC).orElse(Direction.NORTH));
		this.setDestination(in.read("destination", Identifier.CODEC).orElse(Identifier.withDefaultNamespace("overworld")));
		this.life = in.getIntOr("life", DEFAULT_LIFE);
		this.returnPortal = in.getBooleanOr("return_portal", false);
		this.arrival = in.read("arrival", Vec3.CODEC).orElse(null);
		this.arrivalYaw = in.getFloatOr("arrival_yaw", 0.0F);
		this.returnArrival = in.read("return_arrival", Vec3.CODEC).orElse(null);
		this.returnYaw = in.getFloatOr("return_yaw", 0.0F);
		this.partner = in.read("partner", UUIDUtil.CODEC).orElse(null);
		this.owner = in.read("owner", UUIDUtil.CODEC).orElse(null);
		if (this.returnArrival == null) {
			this.computeReturnArrival(null);
		}
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput out) {
		out.store("facing", Direction.CODEC, this.getFacing());
		out.store("destination", Identifier.CODEC, this.getDestination());
		out.putInt("life", this.life);
		out.putBoolean("return_portal", this.returnPortal);
		if (this.arrival != null) {
			out.store("arrival", Vec3.CODEC, this.arrival);
			out.putFloat("arrival_yaw", this.arrivalYaw);
		}
		if (this.returnArrival != null) {
			out.store("return_arrival", Vec3.CODEC, this.returnArrival);
			out.putFloat("return_yaw", this.returnYaw);
		}
		Optional.ofNullable(this.partner).ifPresent(u -> out.store("partner", UUIDUtil.CODEC, u));
		Optional.ofNullable(this.owner).ifPresent(u -> out.store("owner", UUIDUtil.CODEC, u));
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
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
	public boolean canUsePortal(boolean allowPassengers) {
		return false;
	}

	@Override
	public PushReaction getPistonPushReaction() {
		return PushReaction.IGNORE;
	}

	@Override
	public boolean isIgnoringBlockTriggers() {
		return true;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 128 * 128;
	}

	@Override
	public boolean isNoGravity() {
		return true;
	}
}
