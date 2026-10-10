package dev.overkill.entity;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEntities;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.Devastation;
import dev.overkill.util.SafeLanding;
import dev.overkill.util.Targeting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.HangingEntity;
import net.minecraft.world.entity.item.FallingBlockEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.UUID;

/**
 * A Gravemaker singularity.
 * <p>
 * Black hole: for 4 seconds it drags in mobs, items and chunks of ripped-up terrain in a spiral and
 * crushes anything at its core; then it implodes, and detonates outward, flinging all the debris.
 * <p>
 * White hole: a 2 second outward blast that throws everything away (the shooter too, with fall
 * damage forgiven), perfect for escaping or rocket-jumping.
 */
public class SingularityEntity extends Entity {
	private static final EntityDataAccessor<Boolean> DATA_WHITE = SynchedEntityData.defineId(SingularityEntity.class, EntityDataSerializers.BOOLEAN);

	public static final int PULL_TICKS = 80;
	public static final int COLLAPSE_TICKS = 12;
	public static final int WHITE_TICKS = 40;
	private static final double PULL_RADIUS = 18.0;
	private static final double PUSH_RADIUS = 14.0;
	private static final double RIP_RADIUS = 7.0;
	private static final double BLAST_RADIUS = 10.0;
	private static final int MAX_DEBRIS = 90;

	private @Nullable UUID ownerId;
	private int debrisRipped;

	public SingularityEntity(EntityType<? extends SingularityEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	public static void spawn(ServerLevel level, @Nullable Entity owner, Vec3 at, boolean white) {
		SingularityEntity hole = new SingularityEntity(ModEntities.SINGULARITY, level);
		hole.ownerId = owner != null ? owner.getUUID() : null;
		hole.entityData.set(DATA_WHITE, white);
		hole.setPos(at.x, at.y - 0.5, at.z);
		level.addFreshEntity(hole);
		if (white) {
			Fx.send(level, FxKind.WHITE_HOLE_BURST, at, 1.0F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.BREEZE_WIND_CHARGE_BURST, SoundSource.PLAYERS, 3.0F, 0.6F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 2.0F, 2.0F);
			Fx.shake(level, at, 32.0, 2.5F, 12);
		} else {
			Fx.send(level, FxKind.SINGULARITY_BIRTH, at, 1.0F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.WARDEN_SONIC_CHARGE, SoundSource.PLAYERS, 2.5F, 0.5F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.PORTAL_TRIGGER, SoundSource.PLAYERS, 1.2F, 0.5F);
			Fx.shake(level, at, 40.0, 1.5F, 20);
		}
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_WHITE, false);
	}

	public boolean isWhiteHole() {
		return this.entityData.get(DATA_WHITE);
	}

	public Vec3 center() {
		return this.getBoundingBox().getCenter();
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
		return distance < 200.0 * 200.0;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}

	@Override
	public void tick() {
		boolean white = this.isWhiteHole();
		if (this.level().isClientSide()) {
			if (white) {
				this.whiteHoleParticles();
			} else {
				this.blackHoleParticles();
			}
			return;
		}
		ServerLevel level = (ServerLevel) this.level();
		if (white) {
			this.tickWhiteHole(level);
		} else {
			this.tickBlackHole(level);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Black hole
	// ------------------------------------------------------------------------------------------

	private void tickBlackHole(ServerLevel level) {
		int age = this.tickCount;
		Entity owner = this.getOwner(level);
		Vec3 center = this.center();
		boolean collapsing = age >= PULL_TICKS;

		if (age == PULL_TICKS) {
			Fx.send(level, FxKind.SINGULARITY_COLLAPSE, center, -1.0F);
			level.playSound(null, center.x, center.y, center.z, SoundEvents.END_PORTAL_SPAWN, SoundSource.PLAYERS, 1.5F, 0.6F);
			level.playSound(null, center.x, center.y, center.z, SoundEvents.WARDEN_SONIC_CHARGE, SoundSource.PLAYERS, 3.0F, 1.2F);
		}
		if (age >= PULL_TICKS + COLLAPSE_TICKS) {
			this.detonate(level, owner, center);
			return;
		}
		if (age % 20 == 0 && !collapsing) {
			level.playSound(null, center.x, center.y, center.z, SoundEvents.PORTAL_AMBIENT, SoundSource.PLAYERS, 2.5F, 0.4F);
			level.playSound(null, center.x, center.y, center.z, SoundEvents.WARDEN_HEARTBEAT, SoundSource.PLAYERS, 2.0F, 0.5F);
		}
		if (age % 5 == 0) {
			Fx.shake(level, center, 24.0, collapsing ? 2.5F : 0.8F, 6);
		}

		double radius = collapsing ? PULL_RADIUS * 0.6 : PULL_RADIUS;
		double power = collapsing ? 3.0 : 1.0;
		for (Entity entity : level.getEntities(this, new AABB(center, center).inflate(radius), e -> this.canPull(owner, e))) {
			Vec3 toCenter = center.subtract(entity.getBoundingBox().getCenter());
			double distance = toCenter.length();
			if (distance > radius || distance < 1.0E-3) {
				continue;
			}
			Vec3 dir = toCenter.scale(1.0 / distance);
			double strength = Math.min(0.85, (0.05 + 2.4 / (distance * distance + 2.0)) * power);
			Vec3 swirl = dir.cross(new Vec3(0.0, 1.0, 0.0));
			swirl = swirl.lengthSqr() < 1.0E-4 ? Vec3.ZERO : swirl.normalize().scale(strength * 0.45);
			Vec3 motion = entity.getDeltaMovement().scale(0.88).add(dir.scale(strength)).add(swirl).add(0.0, 0.03, 0.0);
			if (motion.lengthSqr() > 4.0) {
				motion = motion.normalize().scale(2.0);
			}
			entity.setDeltaMovement(motion);
			entity.hurtMarked = true;
			if (distance < 2.0 && entity instanceof LivingEntity living && Targeting.canHurt(owner, living)) {
				living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SINGULARITY, this, owner), collapsing ? 4.0F : 2.0F);
			}
		}

		if (!collapsing && age < PULL_TICKS - 6) {
			this.ripTerrain(level);
		}
	}

	private boolean canPull(@Nullable Entity owner, Entity entity) {
		if (entity == owner || entity instanceof SingularityEntity || entity instanceof RiftEntity || entity instanceof HangingEntity
			|| entity instanceof WorldbreakerOrbEntity || entity.isPassenger() || entity.isSpectator()) {
			return false;
		}
		return entity instanceof LivingEntity ? Targeting.canAffect(owner, entity) : !(entity instanceof Player);
	}

	/** Tears loose blocks out of the ground near the hole and lets the pull drag them in. */
	private void ripTerrain(ServerLevel level) {
		if (!ModGameRules.terrain(level) || this.debrisRipped >= MAX_DEBRIS) {
			return;
		}
		RandomSource random = this.random;
		Vec3 center = this.center();
		for (int attempt = 0; attempt < 6 && this.debrisRipped < MAX_DEBRIS; attempt++) {
			Vec3 offset = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).normalize().scale(Math.cbrt(random.nextDouble()) * RIP_RADIUS);
			BlockPos pos = BlockPos.containing(center.add(offset));
			BlockState state = level.getBlockState(pos);
			if (state.isAir() || !state.getFluidState().isEmpty() || state.hasBlockEntity() || Devastation.isUnbreakable(level, pos, state)
				|| state.getDestroySpeed(level, pos) > 50.0F || state.getCollisionShape(level, pos).isEmpty()) {
				continue;
			}
			FallingBlockEntity debris = FallingBlockEntity.fall(level, pos, state);
			debris.setNoGravity(true);
			debris.dropItem = false;
			debris.setDeltaMovement(0.0, 0.25, 0.0);
			this.debrisRipped++;
		}
	}

	private void detonate(ServerLevel level, @Nullable Entity owner, Vec3 center) {
		RandomSource random = this.random;
		for (Entity entity : level.getEntities(this, new AABB(center, center).inflate(BLAST_RADIUS + 4.0), e -> e != owner && !(e instanceof SingularityEntity))) {
			Vec3 offset = entity.getBoundingBox().getCenter().subtract(center);
			double distance = offset.length();
			if (distance > BLAST_RADIUS + 4.0) {
				continue;
			}
			Vec3 dir = distance < 1.0E-3 ? new Vec3(random.nextGaussian(), 0.5, random.nextGaussian()).normalize() : offset.scale(1.0 / distance);
			double falloff = Math.max(0.0, 1.0 - distance / (BLAST_RADIUS + 4.0));
			if (entity instanceof FallingBlockEntity debris) {
				debris.setNoGravity(false);
				debris.dropItem = false;
				debris.setHurtsEntities(3.0F, 40);
				double speed = 1.2 + random.nextDouble() * 1.3;
				debris.setDeltaMovement(dir.x * speed, 0.6 + random.nextDouble() * 0.8, dir.z * speed);
				debris.hurtMarked = true;
				continue;
			}
			if (entity instanceof LivingEntity living) {
				if (!Targeting.canHurt(owner, living)) {
					continue;
				}
				living.invulnerableTime = 0;
				living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SINGULARITY, this, owner), (float) (14.0 + 46.0 * falloff));
			} else if (entity instanceof Player) {
				continue;
			}
			double strength = 0.6 + 2.6 * falloff;
			entity.push(dir.x * strength, 0.5 + falloff * 0.9, dir.z * strength);
			entity.hurtMarked = true;
		}

		Devastation.crater(level, center, center, 0.0, 0.0, 4.5, owner, 24, Devastation.Lining.VOID);
		Fx.send(level, center, 200.0, FxKind.SINGULARITY_COLLAPSE, center, Vec3.ZERO, (float) BLAST_RADIUS, random.nextInt());
		level.playSound(null, center.x, center.y, center.z, SoundEvents.GENERIC_EXPLODE, SoundSource.PLAYERS, 6.0F, 0.55F);
		level.playSound(null, center.x, center.y, center.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 4.0F, 0.6F);
		level.playSound(null, center.x, center.y, center.z, SoundEvents.END_GATEWAY_SPAWN, SoundSource.PLAYERS, 3.0F, 0.6F);
		Fx.shake(level, center, 72.0, 5.0F, 30);
		this.discard();
	}

	// ------------------------------------------------------------------------------------------
	// White hole
	// ------------------------------------------------------------------------------------------

	private void tickWhiteHole(ServerLevel level) {
		int age = this.tickCount;
		if (age > WHITE_TICKS) {
			this.discard();
			return;
		}
		Entity owner = this.getOwner(level);
		Vec3 center = this.center();
		double fade = 1.0 - age / (double) WHITE_TICKS;
		double burst = age <= 2 ? 2.5 : 1.0;
		for (Entity entity : level.getEntities(this, new AABB(center, center).inflate(PUSH_RADIUS), e -> this.canPush(owner, e))) {
			Vec3 offset = entity.getBoundingBox().getCenter().subtract(center);
			double distance = offset.length();
			if (distance > PUSH_RADIUS) {
				continue;
			}
			Vec3 dir = distance < 1.0E-3 ? new Vec3(0.0, 1.0, 0.0) : offset.scale(1.0 / distance);
			double strength = Math.min(2.2, (0.25 + 3.0 / (distance * distance + 2.0)) * fade * burst);
			entity.setDeltaMovement(entity.getDeltaMovement().add(dir.x * strength, dir.y * strength + 0.12 * fade, dir.z * strength));
			entity.hurtMarked = true;
			if (entity == owner) {
				SafeLanding.protect(entity, 160);
			}
			if (age == 1 && distance < 4.0 && entity instanceof LivingEntity living && Targeting.canHurt(owner, living)) {
				living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SINGULARITY, this, owner), 6.0F);
			}
		}
	}

	private boolean canPush(@Nullable Entity owner, Entity entity) {
		if (entity instanceof SingularityEntity || entity instanceof RiftEntity || entity instanceof HangingEntity || entity.isPassenger() || entity.isSpectator()) {
			return false;
		}
		return entity == owner || !(entity instanceof LivingEntity) || Targeting.canAffect(owner, entity);
	}

	// ------------------------------------------------------------------------------------------
	// Client visuals
	// ------------------------------------------------------------------------------------------

	private void blackHoleParticles() {
		Level level = this.level();
		RandomSource random = this.random;
		Vec3 c = this.center();
		int age = this.tickCount;
		boolean collapsing = age >= PULL_TICKS;
		float grow = Mth.clamp(age / 10.0F, 0.0F, 1.0F);
		float coreSize = collapsing ? Mth.lerp((age - PULL_TICKS) / (float) COLLAPSE_TICKS, 1.0F, 0.15F) : grow;

		if (age % 2 == 0) {
			level.addParticle(ModParticles.SINGULARITY, true, true, c.x, c.y, c.z, 2.6 * coreSize, 1.0, 3.0);
		}
		// Accretion disk: hot matter spiralling in on a tilted ring.
		int disk = collapsing ? 6 : 14;
		double tilt = 0.35;
		for (int i = 0; i < disk; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			double r = (1.4 + random.nextDouble() * 1.8) * Math.max(coreSize, 0.3);
			double x = Math.cos(angle) * r;
			double z = Math.sin(angle) * r;
			double y = x * tilt;
			Vec3 tangent = new Vec3(-Math.sin(angle), -Math.sin(angle) * tilt, Math.cos(angle)).scale(0.22);
			Vec3 inward = new Vec3(-x, -y, -z).scale(0.04);
			level.addParticle(random.nextInt(3) == 0 ? ModParticles.EMBER : ModParticles.RIFT_SPARK, true, true,
				c.x + x, c.y + y, c.z + z, tangent.x + inward.x, tangent.y + inward.y, tangent.z + inward.z);
		}
		// Matter streaming in from far away.
		int stream = collapsing ? 14 : 6;
		for (int i = 0; i < stream; i++) {
			Vec3 offset = new Vec3(random.nextGaussian(), random.nextGaussian() * 0.6, random.nextGaussian()).normalize()
				.scale(collapsing ? 4.0 + random.nextDouble() * 6.0 : 6.0 + random.nextDouble() * 10.0);
			Vec3 v = offset.scale(-0.07);
			level.addParticle(ModParticles.VOID_MOTE, true, true, c.x + offset.x, c.y + offset.y, c.z + offset.z, v.x, v.y, v.z);
		}
		if (age % 3 == 0) {
			level.addParticle(ModParticles.SHOCKWAVE, true, true, c.x, c.y - 0.6, c.z, 5.0 * coreSize, 0.25, 12.0);
		}
	}

	private void whiteHoleParticles() {
		Level level = this.level();
		RandomSource random = this.random;
		Vec3 c = this.center();
		float fade = 1.0F - this.tickCount / (float) WHITE_TICKS;
		if (fade <= 0.0F) {
			return;
		}
		level.addParticle(ModParticles.ORB_CORE, true, true, c.x, c.y, c.z, 3.0 * fade, 1.0, 3.0);
		for (int i = 0; i < 10; i++) {
			Vec3 dir = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).normalize();
			Vec3 v = dir.scale(0.4 + random.nextDouble() * 0.5);
			level.addParticle(ModParticles.WHITE_FLARE, true, true, c.x + dir.x, c.y + dir.y, c.z + dir.z, v.x, v.y, v.z);
		}
		if (this.tickCount % 4 == 0) {
			level.addParticle(ModParticles.SHOCKWAVE, true, true, c.x, c.y - 0.5, c.z, 7.0 * fade, 0.5, 10.0);
		}
	}
}
