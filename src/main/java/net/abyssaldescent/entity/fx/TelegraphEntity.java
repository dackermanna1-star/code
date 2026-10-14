package net.abyssaldescent.entity.fx;

import net.abyssaldescent.registry.ModEntities;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * A ground decal that warns of an incoming attack. The outline shows where it will land; the inner fill grows until
 * the moment of impact, so timing is readable at a glance. Purely visual and never saved.
 */
public class TelegraphEntity extends Entity {
	public enum Shape {
		CIRCLE,
		LINE,
		CONE,
		/** A hazard zone that lingers (no fill animation, pulses instead). */
		ZONE
	}

	private static final EntityDataAccessor<Integer> SHAPE = SynchedEntityData.defineId(TelegraphEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> RADIUS = SynchedEntityData.defineId(TelegraphEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> WIDTH = SynchedEntityData.defineId(TelegraphEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> DURATION = SynchedEntityData.defineId(TelegraphEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> COLOR = SynchedEntityData.defineId(TelegraphEntity.class, EntityDataSerializers.INT);

	/** Server-only: damage per half second dealt to non-monsters inside a hazard zone. */
	private float hazardDamage;
	@org.jetbrains.annotations.Nullable
	private Entity hazardOwner;

	public TelegraphEntity(EntityType<? extends TelegraphEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	/** Circle centred on {@code center}. */
	public static TelegraphEntity circle(ServerLevel level, Vec3 center, float radius, int duration, int color) {
		return spawn(level, center, 0.0F, Shape.CIRCLE, radius, 0.0F, duration, color);
	}

	/** Rectangle starting at {@code origin}, extending {@code length} along {@code yaw}. */
	public static TelegraphEntity line(ServerLevel level, Vec3 origin, float yaw, float length, float width, int duration, int color) {
		return spawn(level, origin, yaw, Shape.LINE, length, width, duration, color);
	}

	/** Sector of {@code angle} degrees in front of {@code origin}. */
	public static TelegraphEntity cone(ServerLevel level, Vec3 origin, float yaw, float radius, float angle, int duration, int color) {
		return spawn(level, origin, yaw, Shape.CONE, radius, angle, duration, color);
	}

	public static TelegraphEntity zone(ServerLevel level, Vec3 center, float radius, int duration, int color) {
		return spawn(level, center, 0.0F, Shape.ZONE, radius, 0.0F, duration, color);
	}

	private static TelegraphEntity spawn(ServerLevel level, Vec3 pos, float yaw, Shape shape, float radius, float width, int duration, int color) {
		TelegraphEntity entity = new TelegraphEntity(ModEntities.TELEGRAPH, level);
		entity.setPos(pos.x, pos.y, pos.z);
		entity.setYRot(yaw);
		entity.entityData.set(SHAPE, shape.ordinal());
		entity.entityData.set(RADIUS, radius);
		entity.entityData.set(WIDTH, width);
		entity.entityData.set(DURATION, Math.max(1, duration));
		entity.entityData.set(COLOR, color);
		level.addFreshEntity(entity);
		return entity;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(SHAPE, 0);
		builder.define(RADIUS, 1.0F);
		builder.define(WIDTH, 1.0F);
		builder.define(DURATION, 20);
		builder.define(COLOR, 0xFFFF4040);
	}

	/** Turns a zone into a damaging hazard (soul fire on the ground). */
	public TelegraphEntity setHazard(Entity owner, float damagePerPulse) {
		this.hazardOwner = owner;
		this.hazardDamage = damagePerPulse;
		return this;
	}

	@Override
	public void tick() {
		super.tick();
		if (level().isClientSide()) {
			if (shape() == Shape.ZONE && random.nextInt(2) == 0) {
				double angle = random.nextDouble() * Math.PI * 2;
				double r = Math.sqrt(random.nextDouble()) * radius();
				level().addParticle(net.minecraft.core.particles.ParticleTypes.SOUL_FIRE_FLAME, getX() + Math.cos(angle) * r, getY() + 0.1,
					getZ() + Math.sin(angle) * r, 0.0, 0.03, 0.0);
			}
			return;
		}
		if (hazardDamage > 0 && tickCount % 10 == 0 && level() instanceof ServerLevel level) {
			var source = level.damageSources().source(net.abyssaldescent.registry.ModDamageTypes.SOUL_ERUPTION, this, hazardOwner);
			for (net.minecraft.world.entity.LivingEntity victim : level.getEntitiesOfClass(net.minecraft.world.entity.LivingEntity.class,
				getBoundingBox().inflate(radius(), 1.0, radius()), e -> !(e instanceof net.minecraft.world.entity.monster.Monster))) {
				if (victim.position().subtract(position()).horizontalDistance() <= radius() && victim.getY() - getY() < 1.5) {
					victim.hurtServer(level, source, hazardDamage);
				}
			}
		}
		if (tickCount > duration() + 3) {
			discard();
		}
	}

	public Shape shape() {
		return Shape.values()[Math.max(0, Math.min(Shape.values().length - 1, entityData.get(SHAPE)))];
	}

	public float radius() {
		return entityData.get(RADIUS);
	}

	public float width() {
		return entityData.get(WIDTH);
	}

	public int duration() {
		return entityData.get(DURATION);
	}

	public int color() {
		return entityData.get(COLOR);
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
	public PushReaction getPistonPushReaction() {
		return PushReaction.IGNORE;
	}

	@Override
	public boolean shouldBeSaved() {
		return false;
	}

	@Override
	public boolean isNoGravity() {
		return true;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
