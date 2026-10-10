package dev.overkill.entity;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEntities;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.Targeting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A tear in space left by the Riftfang Scythe.
 * <ul>
 *   <li>SLASH: hangs in the air where a hit landed; anything that touches it is swallowed.</li>
 *   <li>WAVE: a thrown slash that travels forward, swallowing everything it passes through.</li>
 *   <li>EXIT: the opening high in the sky that swallowed victims tumble out of.</li>
 *   <li>MAW: Void Harvest's horizontal rift that holds its victim, then launches it into the sky.</li>
 * </ul>
 * Rifts have no model: the client draws them entirely from particles.
 */
public class RiftEntity extends Entity {
	public static final byte SLASH = 0;
	public static final byte EXIT = 1;
	public static final byte WAVE = 2;
	public static final byte MAW = 3;

	private static final EntityDataAccessor<Byte> DATA_KIND = SynchedEntityData.defineId(RiftEntity.class, EntityDataSerializers.BYTE);
	private static final EntityDataAccessor<Float> DATA_SIZE = SynchedEntityData.defineId(RiftEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> DATA_ROLL = SynchedEntityData.defineId(RiftEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> DATA_LIFE = SynchedEntityData.defineId(RiftEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> DATA_DELAY = SynchedEntityData.defineId(RiftEntity.class, EntityDataSerializers.INT);

	private static final int MAW_HOLD_TICKS = 18;

	private @Nullable UUID ownerId;
	private @Nullable UUID targetId;
	private boolean targetSwallowed;
	private final Map<Integer, Long> recentlySwallowed = new HashMap<>();

	public RiftEntity(EntityType<? extends RiftEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	// ------------------------------------------------------------------------------------------
	// Spawning
	// ------------------------------------------------------------------------------------------

	private static RiftEntity create(ServerLevel level, @Nullable Entity owner, byte kind, Vec3 pos, float yaw, float roll, float size, int life) {
		RiftEntity rift = new RiftEntity(ModEntities.RIFT, level);
		rift.ownerId = owner != null ? owner.getUUID() : null;
		rift.entityData.set(DATA_KIND, kind);
		rift.entityData.set(DATA_SIZE, size);
		rift.entityData.set(DATA_ROLL, roll);
		rift.entityData.set(DATA_LIFE, life);
		rift.snapTo(pos.x, pos.y, pos.z, yaw, 0.0F);
		return rift;
	}

	/** A tear where a scythe hit landed. Re-uses (refreshes) an existing tear from the same owner nearby. */
	public static void slash(ServerLevel level, Entity owner, Vec3 center, float yaw, float roll, float size, int life) {
		List<RiftEntity> nearby = level.getEntitiesOfClass(RiftEntity.class, new AABB(center, center).inflate(2.5),
			rift -> rift.getKind() == SLASH && owner.getUUID().equals(rift.ownerId));
		if (!nearby.isEmpty()) {
			RiftEntity rift = nearby.getFirst();
			rift.entityData.set(DATA_LIFE, rift.tickCount + life);
			return;
		}
		RiftEntity rift = create(level, owner, SLASH, center, yaw, roll, size, life);
		level.addFreshEntity(rift);
		Fx.send(level, center, 96.0, FxKind.RIFT_OPEN, center, Vec3.directionFromRotation(0.0F, yaw), size, 0);
	}

	/** A rift hurled forward that swallows everything in its path. */
	public static void wave(ServerLevel level, Entity owner, Vec3 start, Vec3 velocity, float yaw, float roll, float size, int life) {
		RiftEntity rift = create(level, owner, WAVE, start, yaw, roll, size, life);
		rift.setDeltaMovement(velocity);
		level.addFreshEntity(rift);
	}

	/** Void Harvest: a maw that opens under {@code target} after {@code delay} ticks. */
	public static void maw(ServerLevel level, Entity owner, LivingEntity target, int delay) {
		float size = Math.max(1.8F, target.getBbWidth() * 2.0F + 0.6F);
		RiftEntity rift = create(level, owner, MAW, target.position().add(0.0, 0.05, 0.0), 0.0F, 0.0F, size, delay + MAW_HOLD_TICKS + 16);
		rift.targetId = target.getUUID();
		rift.entityData.set(DATA_DELAY, delay);
		level.addFreshEntity(rift);
	}

	private static void exit(ServerLevel level, Vec3 pos, float size) {
		RiftEntity rift = create(level, null, EXIT, pos, level.random.nextFloat() * 360.0F, (level.random.nextFloat() - 0.5F) * 0.8F, size, 26);
		level.addFreshEntity(rift);
	}

	// ------------------------------------------------------------------------------------------
	// Data
	// ------------------------------------------------------------------------------------------

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_KIND, SLASH);
		builder.define(DATA_SIZE, 2.0F);
		builder.define(DATA_ROLL, 0.0F);
		builder.define(DATA_LIFE, 60);
		builder.define(DATA_DELAY, 0);
	}

	public byte getKind() {
		return this.entityData.get(DATA_KIND);
	}

	public float getSize() {
		return this.entityData.get(DATA_SIZE);
	}

	public float getRoll() {
		return this.entityData.get(DATA_ROLL);
	}

	public int getLife() {
		return this.entityData.get(DATA_LIFE);
	}

	public int getDelay() {
		return this.entityData.get(DATA_DELAY);
	}

	private @Nullable Entity getOwner(ServerLevel level) {
		return this.ownerId != null ? level.getEntity(this.ownerId) : null;
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
	public boolean canUsePortal(boolean allowPassengers) {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 160.0 * 160.0;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}

	// ------------------------------------------------------------------------------------------
	// Ticking
	// ------------------------------------------------------------------------------------------

	@Override
	public void tick() {
		byte kind = this.getKind();
		if (kind == WAVE) {
			this.setPos(this.position().add(this.getDeltaMovement()));
		}
		if (this.level().isClientSide()) {
			this.clientEffects(kind);
			return;
		}
		ServerLevel level = (ServerLevel) this.level();
		if (this.tickCount > this.getLife()) {
			this.discard();
			return;
		}
		switch (kind) {
			case SLASH -> this.swallowTouching(level, 18.0 + this.random.nextDouble() * 8.0, 4.0F);
			case WAVE -> {
				this.swallowTouching(level, 22.0 + this.random.nextDouble() * 6.0, 6.0F);
				if (this.tickCount % 4 == 0) {
					level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.PORTAL_AMBIENT, SoundSource.PLAYERS, 0.6F, 1.8F);
				}
			}
			case MAW -> this.tickMaw(level);
			default -> {
			}
		}
	}

	private void swallowTouching(ServerLevel level, double height, float damage) {
		Entity owner = this.getOwner(level);
		float size = this.getSize();
		AABB box = new AABB(this.position(), this.position()).inflate(size * 0.55);
		long now = level.getGameTime();
		for (Entity entity : level.getEntities(this, box, e -> this.canSwallow(owner, e, now))) {
			this.swallow(level, owner, entity, height, damage);
		}
	}

	private boolean canSwallow(@Nullable Entity owner, Entity entity, long now) {
		if (entity instanceof RiftEntity || entity.isPassenger() || this.recentlySwallowed.getOrDefault(entity.getId(), 0L) > now) {
			return false;
		}
		if (entity instanceof Projectile projectile) {
			return !(entity instanceof WorldbreakerOrbEntity) && (owner == null || projectile.getOwner() != owner);
		}
		return entity instanceof LivingEntity && Targeting.canAffect(owner, entity);
	}

	private void swallow(ServerLevel level, @Nullable Entity owner, Entity victim, double height, float damage) {
		Vec3 from = victim.position();
		Vec3 exit = findExit(level, victim, from, height);
		double midY = victim.getBbHeight() / 2.0;
		Fx.send(level, from, 128.0, FxKind.RIFT_SWALLOW, from.add(0.0, midY, 0.0), exit.add(0.0, midY, 0.0), victim.getBbWidth(), 0);
		level.playSound(null, from.x, from.y, from.z, SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 1.0F, 0.5F);

		victim.teleportTo(exit.x, exit.y, exit.z);
		victim.setDeltaMovement(victim.getDeltaMovement().multiply(0.2, 0.0, 0.2).add(0.0, -0.4, 0.0));
		victim.hurtMarked = true;
		level.playSound(null, exit.x, exit.y, exit.z, SoundEvents.CHORUS_FRUIT_TELEPORT, SoundSource.PLAYERS, 1.2F, 0.6F);
		if (victim instanceof LivingEntity living && damage > 0.0F) {
			living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.RIFT, this, owner), damage);
		}
		this.recentlySwallowed.put(victim.getId(), level.getGameTime() + 40L);
		exit(level, exit.add(0.0, midY, 0.0), Math.max(1.6F, victim.getBbWidth() * 2.2F));
	}

	/** Highest free spot up to {@code height} blocks above (with some scatter), so victims never land in a wall. */
	private static Vec3 findExit(ServerLevel level, Entity victim, Vec3 from, double height) {
		RandomSource random = level.random;
		double dx = (random.nextDouble() - 0.5) * 6.0;
		double dz = (random.nextDouble() - 0.5) * 6.0;
		double ceiling = level.getMaxY() - victim.getBbHeight() - 1.0;
		for (double h = height; h >= 3.0; h -= 1.5) {
			Vec3 candidate = new Vec3(from.x + dx, Math.min(from.y + h, ceiling), from.z + dz);
			if (level.noCollision(victim, victim.getBoundingBox().move(candidate.subtract(from)))) {
				return candidate;
			}
		}
		return from.add(0.0, 1.0, 0.0);
	}

	private void tickMaw(ServerLevel level) {
		int t = this.tickCount - this.getDelay();
		if (t < 0) {
			return;
		}
		Entity owner = this.getOwner(level);
		Entity target = this.targetId != null ? level.getEntity(this.targetId) : null;
		if (t == 0) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.PORTAL_TRIGGER, SoundSource.PLAYERS, 0.5F, 1.7F);
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.SCULK_SHRIEKER_SHRIEK, SoundSource.PLAYERS, 0.6F, 0.6F);
			Fx.send(level, this.position(), 96.0, FxKind.RIFT_OPEN, this.position(), new Vec3(0.0, 1.0, 0.0), this.getSize(), 1);
		}
		if (target == null || !target.isAlive() || this.targetSwallowed) {
			return;
		}
		if (t < MAW_HOLD_TICKS) {
			Vec3 center = this.position();
			Vec3 pos = target.position();
			target.setDeltaMovement((center.x - pos.x) * 0.35, Math.min(target.getDeltaMovement().y, -0.08), (center.z - pos.z) * 0.35);
			target.hurtMarked = true;
			if (target instanceof LivingEntity living) {
				living.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 10, 5, false, false));
			}
		} else {
			this.targetSwallowed = true;
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.WARDEN_SONIC_CHARGE, SoundSource.PLAYERS, 0.8F, 1.6F);
			this.swallow(level, owner, target, 40.0, 10.0F);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Client visuals
	// ------------------------------------------------------------------------------------------

	private void clientEffects(byte kind) {
		int t = this.tickCount - (kind == MAW ? this.getDelay() : 0);
		if (t < 0) {
			return;
		}
		float open = Mth.clamp(t / 4.0F, 0.0F, 1.0F) * Mth.clamp((this.getLife() - this.tickCount) / 6.0F, 0.0F, 1.0F);
		if (open <= 0.0F) {
			return;
		}
		if (kind == MAW) {
			this.mawParticles(open, t);
		} else {
			this.tearParticles(open, kind);
		}
	}

	private void tearParticles(float open, byte kind) {
		Level level = this.level();
		RandomSource random = this.random;
		float yaw = this.getYRot() * Mth.DEG_TO_RAD;
		Vec3 forward = new Vec3(-Mth.sin(yaw), 0.0, Mth.cos(yaw));
		Vec3 right = new Vec3(-Mth.cos(yaw), 0.0, -Mth.sin(yaw));
		float roll = this.getRoll();
		Vec3 along = right.scale(Mth.cos(roll)).add(0.0, Mth.sin(roll), 0.0);
		Vec3 normal = forward.cross(along).normalize();
		float size = this.getSize();
		double half = size * 0.5 * open;
		Vec3 center = this.position();
		int count = 8 + (int) (size * 5.0F);
		for (int i = 0; i < count; i++) {
			double s = random.nextDouble() * 2.0 - 1.0;
			double width = (1.0 - s * s) * size * 0.13 * open;
			Vec3 base = center.add(along.scale(s * half));
			double side = random.nextBoolean() ? 1.0 : -1.0;
			Vec3 edge = base.add(normal.scale(width * side));
			level.addParticle(ModParticles.RIFT_GLOW, true, true, edge.x, edge.y, edge.z, 0.55, 0.9, 5.0);
			Vec3 core = base.add(normal.scale(width * side * random.nextDouble() * 0.7));
			level.addParticle(ModParticles.VOID_MOTE, true, true, core.x, core.y, core.z,
				(base.x - core.x) * 0.2 + forward.x * 0.01, (base.y - core.y) * 0.2, (base.z - core.z) * 0.2 + forward.z * 0.01);
		}
		for (int i = 0; i < 3; i++) {
			Vec3 base = center.add(along.scale((random.nextDouble() * 2.0 - 1.0) * half));
			Vec3 from = base.add(random.nextGaussian() * 1.2, random.nextGaussian() * 1.2, random.nextGaussian() * 1.2);
			Vec3 v = base.subtract(from).scale(0.09);
			level.addParticle(ModParticles.VOID_MOTE, true, true, from.x, from.y, from.z, v.x, v.y, v.z);
		}
		if (random.nextInt(3) == 0) {
			level.addParticle(ParticleTypes.REVERSE_PORTAL, center.x, center.y, center.z, random.nextGaussian() * 0.05, random.nextGaussian() * 0.05, random.nextGaussian() * 0.05);
		}
		if (kind == WAVE) {
			Vec3 back = this.getDeltaMovement().scale(-0.5);
			for (int i = 0; i < 6; i++) {
				Vec3 p = center.add(along.scale((random.nextDouble() * 2.0 - 1.0) * half)).add(back.scale(random.nextDouble()));
				level.addParticle(ModParticles.RIFT_GLOW, true, true, p.x, p.y, p.z, 0.35, 0.5, 8.0);
			}
		}
	}

	private void mawParticles(float open, int t) {
		Level level = this.level();
		RandomSource random = this.random;
		Vec3 center = this.position();
		double radius = this.getSize() * 0.5 * open;
		int ring = 14;
		for (int k = 0; k < ring; k++) {
			double angle = t * 0.25 + k * (Math.PI * 2.0 / ring);
			double x = center.x + Math.cos(angle) * radius;
			double z = center.z + Math.sin(angle) * radius;
			level.addParticle(ModParticles.RIFT_GLOW, true, true, x, center.y + 0.05, z, 0.5, 0.9, 4.0);
		}
		for (int i = 0; i < 6; i++) {
			double r = Math.sqrt(random.nextDouble()) * radius * 0.85;
			double angle = random.nextDouble() * Math.PI * 2.0;
			level.addParticle(ModParticles.VOID_MOTE, true, true, center.x + Math.cos(angle) * r, center.y + 0.05, center.z + Math.sin(angle) * r,
				-Math.cos(angle) * 0.02, -0.03, -Math.sin(angle) * 0.02);
		}
		if (random.nextInt(2) == 0) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			level.addParticle(ParticleTypes.REVERSE_PORTAL, center.x + Math.cos(angle) * radius, center.y + 0.1, center.z + Math.sin(angle) * radius,
				0.0, 0.08, 0.0);
		}
	}
}
