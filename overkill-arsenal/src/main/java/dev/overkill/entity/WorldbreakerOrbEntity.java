package dev.overkill.entity;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModEntities;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.Devastation;
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
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.HashSet;
import java.util.Set;

/**
 * The Worldbreaker's orb. Ignores gravity and collision and tears straight through everything at
 * 100 to 400 blocks per second, erasing a tunnel lined with molten rock. Once it has burrowed deep
 * enough (or runs out of range) it detonates, carving a funnel crater from where it entered the
 * ground down to the blast. Everything about it scales with how long the cannon was charged.
 */
public class WorldbreakerOrbEntity extends Projectile {
	private static final EntityDataAccessor<Float> DATA_POWER = SynchedEntityData.defineId(WorldbreakerOrbEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Boolean> DATA_DRILLING = SynchedEntityData.defineId(WorldbreakerOrbEntity.class, EntityDataSerializers.BOOLEAN);
	private static final int MAX_LIFE = 200;
	/** Longest stretch of tunnel the final crater follows back up. */
	private static final double MAX_FUNNEL = 200.0;

	private final Set<Integer> struck = new HashSet<>();
	private @Nullable Vec3 entry;
	private double penetration;
	private double travelled;
	private double airRun = 99.0;
	private boolean detonated;

	public WorldbreakerOrbEntity(EntityType<? extends WorldbreakerOrbEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	public WorldbreakerOrbEntity(ServerLevel level, LivingEntity owner, float power, Vec3 position, Vec3 direction) {
		this(ModEntities.WORLDBREAKER_ORB, level);
		this.setOwner(owner);
		this.entityData.set(DATA_POWER, Mth.clamp(power, 0.0F, 1.0F));
		this.setPos(position);
		Vec3 velocity = direction.normalize().scale(this.speed());
		this.setDeltaMovement(velocity);
		this.setYRot((float) (Mth.atan2(velocity.x, velocity.z) * Mth.RAD_TO_DEG));
		this.setXRot((float) (Mth.atan2(velocity.y, velocity.horizontalDistance()) * Mth.RAD_TO_DEG));
	}

	// ------------------------------------------------------------------------------------------
	// Stats. Power runs from 0 (1 second charge) to 1 (20 second charge). Sizes grow with its
	// square root, so the first seconds of charging already pay off.
	// ------------------------------------------------------------------------------------------

	public float power() {
		return Mth.clamp(this.entityData.get(DATA_POWER), 0.0F, 1.0F);
	}

	private double size(double min, double max) {
		return Mth.lerp(Math.sqrt(this.power()), min, max);
	}

	/** Blocks per tick: 5 (100 blocks/s) to 20 (400 blocks/s). */
	private double speed() {
		return 5.0 + 15.0 * this.power();
	}

	private double tunnelRadius() {
		return this.size(1.8, 7.0);
	}

	private double burrowDepth() {
		return this.size(10.0, 160.0);
	}

	private double range() {
		return Mth.lerp(this.power(), 140.0, 640.0);
	}

	private float hitDamage() {
		return (float) this.size(20.0, 300.0);
	}

	private double craterRadius() {
		return this.size(5.0, 34.0);
	}

	private double endRadius() {
		return this.size(3.5, 24.0);
	}

	private double blastRadius() {
		return this.size(4.5, 30.0);
	}

	private float blastDamage() {
		return (float) this.size(30.0, 600.0);
	}

	private int debris() {
		return (int) this.size(12.0, 140.0);
	}

	private float visualSize() {
		return (float) this.size(1.3, 5.0);
	}

	/** Effect size sent to clients: 1 (1 second charge) to 5 (full charge). */
	public static float fxScale(float power) {
		return 1.0F + 4.0F * Mth.clamp(power, 0.0F, 1.0F);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_POWER, 0.0F);
		builder.define(DATA_DRILLING, false);
	}

	@Override
	protected double getDefaultGravity() {
		return 0.0;
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
	public boolean canUsePortal(boolean allowPassengers) {
		return false;
	}

	@Override
	public boolean isPushedByFluid() {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 384.0 * 384.0;
	}

	@Override
	public void tick() {
		super.tick();
		Vec3 velocity = this.getDeltaMovement();
		Vec3 from = this.position();
		Vec3 to = from.add(velocity);
		if (this.level().isClientSide()) {
			this.setPos(to);
			this.clientEffects(from, to);
			return;
		}
		if (!(this.level() instanceof ServerLevel level) || this.detonated) {
			return;
		}
		// Stop at the edge of the simulated world rather than freezing (or loading chunks) out there.
		if (this.travelled > this.range() || this.tickCount > MAX_LIFE || to.y < level.getMinY() + 2
			|| !level.isPositionEntityTicking(BlockPos.containing(to))) {
			this.detonate(level);
			return;
		}

		double radius = this.tunnelRadius();
		double length = velocity.length();
		int steps = Math.max(1, Mth.ceil(length / (radius * 0.5)));
		boolean solid = false;
		Vec3 reached = from;
		for (int i = 1; i <= steps; i++) {
			Vec3 point = from.add(velocity.scale((double) i / steps));
			Drill result = this.drill(level, point, radius);
			if (result == Drill.STOPPED) {
				this.strikeEntities(level, from, point, radius);
				this.setPos(point);
				this.detonate(level);
				return;
			}
			if (result == Drill.SOLID) {
				if (!solid && this.airRun > 4.0) {
					// Entering the ground again after open air: a new tunnel (and a new crater mouth) starts here.
					this.entry = reached;
				}
				solid = true;
				this.airRun = 0.0;
				this.penetration += length / steps;
			} else {
				this.airRun += length / steps;
			}
			reached = point;
		}
		this.strikeEntities(level, from, to, radius);
		this.setPos(to);
		this.travelled += length;
		this.entityData.set(DATA_DRILLING, solid);
		this.serverEffects(level, solid);

		if (this.penetration >= this.burrowDepth()) {
			this.detonate(level);
		}
	}

	private enum Drill {
		AIR, SOLID, STOPPED
	}

	private Drill drill(ServerLevel level, Vec3 center, double radius) {
		boolean terrain = ModGameRules.terrain(level);
		BlockPos centerPos = BlockPos.containing(center);
		if (!terrain) {
			BlockState state = level.getBlockState(centerPos);
			return !state.getCollisionShape(level, centerPos).isEmpty() ? Drill.STOPPED : Drill.AIR;
		}
		RandomSource random = this.random;
		Entity owner = this.getOwner();
		// Never dig out the ground the shooter is standing on (the orb spawns right in front of them).
		AABB safeZone = owner != null && owner.isAlive() ? owner.getBoundingBox().inflate(2.5) : null;
		boolean solid = false;
		double shell = radius + 1.3;
		int r = Mth.ceil(shell);
		double inner = radius * radius;
		double outer = shell * shell;
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		for (int dx = -r; dx <= r; dx++) {
			for (int dz = -r; dz <= r; dz++) {
				cursor.set(centerPos.getX() + dx, centerPos.getY(), centerPos.getZ() + dz);
				if (!level.isLoaded(cursor)) {
					continue;
				}
				for (int dy = -r; dy <= r; dy++) {
					cursor.setY(centerPos.getY() + dy);
					double d2 = cursor.distToCenterSqr(center);
					if (d2 > outer || !level.isInWorldBounds(cursor)) {
						continue;
					}
					BlockState state = level.getBlockState(cursor);
					if (state.isAir() || safeZone != null && safeZone.contains(cursor.getX() + 0.5, cursor.getY() + 0.5, cursor.getZ() + 0.5)) {
						continue;
					}
					if (d2 <= inner) {
						if (Devastation.isUnbreakable(level, cursor, state)) {
							if (d2 < inner * 0.25) {
								return Drill.STOPPED;
							}
							continue;
						}
						solid = true;
						if (state.hasBlockEntity()) {
							level.destroyBlock(cursor.immutable(), true, owner);
						} else {
							level.setBlock(cursor, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
						}
					} else if (random.nextFloat() < 0.4F && state.getFluidState().isEmpty()) {
						Devastation.scorchBlock(level, cursor.immutable(), random, 0.95F);
					}
				}
			}
		}
		return solid ? Drill.SOLID : Drill.AIR;
	}

	/** Hits everything the orb swept past this tick (it moves up to 20 blocks a tick, so checking just its position would miss things). */
	private void strikeEntities(ServerLevel level, Vec3 from, Vec3 to, double radius) {
		Entity owner = this.getOwner();
		Vec3 path = to.subtract(from);
		double len2 = path.lengthSqr();
		Vec3 push = len2 < 1.0E-6 ? new Vec3(0.0, 1.0, 0.0) : path.normalize();
		double reach = radius + 1.5;
		AABB box = new AABB(from, to).inflate(radius + 1.0);
		for (Entity entity : level.getEntities(this, box, e -> e instanceof LivingEntity && Targeting.canHurt(owner, e))) {
			Vec3 center = entity.getBoundingBox().getCenter();
			double t = len2 < 1.0E-6 ? 0.0 : Mth.clamp(center.subtract(from).dot(path) / len2, 0.0, 1.0);
			if (center.distanceTo(from.add(path.scale(t))) > reach || !this.struck.add(entity.getId())) {
				continue;
			}
			LivingEntity living = (LivingEntity) entity;
			living.invulnerableTime = 0;
			living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.WORLDBREAKER, this, owner), this.hitDamage());
			living.igniteForSeconds(8.0F);
			living.addEffect(new MobEffectInstance(ModEffects.SEARING, 140, 1), owner);
			double fling = 1.8 + 2.0 * this.power();
			living.push(push.x * fling, 0.5 + push.y + this.power(), push.z * fling);
			living.hurtMarked = true;
		}
	}

	private void serverEffects(ServerLevel level, boolean drilling) {
		float power = this.power();
		if (this.tickCount % 3 == 0) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 3.0F + power * 3.0F, 0.5F);
		}
		if (this.tickCount % 2 == 0) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.5F + power * 2.0F, 1.6F - power * 0.6F);
		}
		if (drilling) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ANCIENT_DEBRIS_BREAK, SoundSource.BLOCKS, 3.0F + power * 3.0F, 0.5F);
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.GRAVEL_BREAK, SoundSource.BLOCKS, 3.0F + power * 3.0F, 0.6F);
			if (this.tickCount % 2 == 0) {
				level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.GENERIC_EXPLODE, SoundSource.BLOCKS, 1.5F + power * 3.0F, 0.5F);
			}
			Fx.shake(level, this.position(), 40.0 + power * 60.0, 0.6F + power * 1.6F, 6);
		}
	}

	private void clientEffects(Vec3 from, Vec3 to) {
		Level level = this.level();
		RandomSource random = this.random;
		float power = this.power();
		float size = this.visualSize();
		Vec3 path = to.subtract(from);
		double length = path.length();
		level.addParticle(ModParticles.ORB_CORE, true, true, to.x, to.y, to.z, size, 1.0, 0.0);
		if (this.tickCount % 2 == 0) {
			level.addParticle(ModParticles.ORB_CORE, true, true, to.x, to.y, to.z, size * 1.9, 0.35, 0.0);
		}
		// At these speeds the orb is a streak: fill the path it covered this tick with fading glows.
		for (double d = 0.0; d < length; d += 1.2) {
			Vec3 p = from.add(path.scale(d / length));
			level.addParticle(ModParticles.ORB_CORE, true, true, p.x, p.y, p.z, size * 0.7, 0.45, 4.0);
		}
		Vec3 back = length < 1.0E-4 ? Vec3.ZERO : path.scale(-1.0 / length);
		int sparks = 3 + (int) (length * (0.5 + power));
		for (int i = 0; i < sparks; i++) {
			Vec3 p = from.add(path.scale(random.nextDouble()));
			Vec3 v = back.scale(0.1 + random.nextDouble() * 0.2).add(random.nextGaussian() * 0.12, random.nextGaussian() * 0.12, random.nextGaussian() * 0.12);
			level.addParticle(ModParticles.STATIC_SPARK, true, true, p.x, p.y, p.z, v.x, v.y, v.z);
		}
		for (int k = 0; k < 3; k++) {
			double angle = this.tickCount * 0.55 + k * (Math.PI * 2.0 / 3.0);
			Vec3 side = new Vec3(Math.cos(angle), Math.sin(angle) * 0.6, Math.sin(angle)).scale(size * 0.55);
			level.addParticle(ModParticles.ARC, true, true, to.x + side.x, to.y + side.y, to.z + side.z, 0.6 + power, 0.8, 4.0);
		}
		if (this.entityData.get(DATA_DRILLING)) {
			int chunks = 4 + (int) (length * (0.6 + power));
			for (int i = 0; i < chunks; i++) {
				Vec3 at = from.add(path.scale(random.nextDouble()));
				Vec3 v = new Vec3(random.nextGaussian(), random.nextGaussian() * 0.6 + 0.3, random.nextGaussian()).scale(0.25 + power * 0.25);
				level.addParticle(ModParticles.BLAST_DUST, true, true, at.x + random.nextGaussian() * size * 0.5,
					at.y + random.nextGaussian() * size * 0.5, at.z + random.nextGaussian() * size * 0.5, v.x, v.y, v.z);
				level.addParticle(ModParticles.EMBER, true, true, at.x, at.y, at.z, v.x * 2.0, v.y * 2.0, v.z * 2.0);
				if (random.nextInt(4) == 0) {
					level.addParticle(ModParticles.MAGMA, true, true, at.x, at.y, at.z, random.nextGaussian() * 0.3, 0.3 + random.nextDouble() * 0.3, random.nextGaussian() * 0.3);
				}
			}
			level.addParticle(ModParticles.HEAVY_SMOKE, true, true, from.x, from.y, from.z, 0.0, 0.03, 0.0);
		}
	}

	private void detonate(ServerLevel level) {
		if (this.detonated) {
			return;
		}
		this.detonated = true;
		float power = this.power();
		float fx = fxScale(power);
		Entity owner = this.getOwner();
		Vec3 end = this.position();
		// Only follow the tunnel back up if the orb was still underground when it went off.
		Vec3 entryPoint = this.entry != null && this.airRun < 8.0 ? this.entry : end;
		if (entryPoint.distanceTo(end) > MAX_FUNNEL) {
			entryPoint = end.add(entryPoint.subtract(end).normalize().scale(MAX_FUNNEL));
		}

		Devastation.crater(level, entryPoint, end, this.craterRadius(), this.endRadius(), this.blastRadius(), owner, this.debris(), Devastation.Lining.INFERNO);
		this.blast(level, end, this.blastRadius() * 2.2, this.blastDamage(), owner);
		if (entryPoint.distanceTo(end) > 6.0) {
			this.blast(level, entryPoint, this.craterRadius() * 1.4, this.blastDamage() * 0.6F, owner);
		}

		Fx.send(level, end, 320.0 + 160.0 * power, FxKind.ORB_IMPACT, end, entryPoint, fx, this.random.nextInt());
		float volume = 5.0F + fx * 3.0F;
		for (Vec3 at : new Vec3[]{end, entryPoint}) {
			level.playSound(null, at.x, at.y, at.z, SoundEvents.GENERIC_EXPLODE, SoundSource.BLOCKS, volume, 0.45F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.BLOCKS, volume, 0.5F);
		}
		level.playSound(null, end.x, end.y, end.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.BLOCKS, volume * 0.6F, 0.4F);
		if (power > 0.6F) {
			level.playSound(null, entryPoint.x, entryPoint.y, entryPoint.z, SoundEvents.END_PORTAL_SPAWN, SoundSource.BLOCKS, volume, 0.5F);
		}
		Fx.shake(level, end, 48.0 + 50.0 * fx, 1.5F + 1.4F * fx, 18 + 10 * (int) fx);
		this.discard();
	}

	private void blast(ServerLevel level, Vec3 center, double radius, float maxDamage, @Nullable Entity owner) {
		AABB box = new AABB(center, center).inflate(radius);
		float power = this.power();
		for (Entity entity : level.getEntities(this, box, e -> e instanceof LivingEntity && Targeting.canHurt(owner, e))) {
			Vec3 offset = entity.getBoundingBox().getCenter().subtract(center);
			double distance = offset.length();
			if (distance > radius) {
				continue;
			}
			double falloff = 1.0 - distance / radius;
			LivingEntity living = (LivingEntity) entity;
			living.invulnerableTime = 0;
			living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.WORLDBREAKER, this, owner), (float) (maxDamage * (0.25 + 0.75 * falloff)));
			living.igniteForSeconds(10.0F);
			living.addEffect(new MobEffectInstance(ModEffects.SEARING, 200, 1), owner);
			Vec3 dir = distance < 1.0E-3 ? new Vec3(0, 1, 0) : offset.normalize();
			double strength = (1.5 + 2.5 * falloff) * (0.6 + power * 1.2);
			living.push(dir.x * strength, 0.6 + falloff * (1.2 + power), dir.z * strength);
			living.hurtMarked = true;
		}
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putFloat("Power", this.power());
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.entityData.set(DATA_POWER, input.getFloatOr("Power", 0.0F));
	}
}
