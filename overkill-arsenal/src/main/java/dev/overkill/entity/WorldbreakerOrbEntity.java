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
 * The Worldbreaker's orb. Flies straight and slow, ignores gravity and collision, and erases a
 * tunnel through everything in its path, lining it with molten rock. Once it has burrowed deep
 * enough (or runs out of range) it detonates, carving a funnel crater back up to where it entered
 * the ground.
 */
public class WorldbreakerOrbEntity extends Projectile {
	private static final EntityDataAccessor<Integer> DATA_STAGE = SynchedEntityData.defineId(WorldbreakerOrbEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Boolean> DATA_DRILLING = SynchedEntityData.defineId(WorldbreakerOrbEntity.class, EntityDataSerializers.BOOLEAN);

	//                                          -    stage 1  stage 2  stage 3
	private static final double[] SPEED = {0.0, 1.30, 1.15, 1.00};
	private static final double[] TUNNEL = {0.0, 1.6, 2.4, 3.4};
	private static final double[] DEPTH = {0.0, 9.0, 20.0, 40.0};
	private static final double[] RANGE = {0.0, 80.0, 120.0, 180.0};
	private static final float[] HIT_DAMAGE = {0.0F, 16.0F, 30.0F, 55.0F};
	private static final double[] CRATER = {0.0, 5.0, 9.0, 15.0};
	private static final double[] END_RADIUS = {0.0, 3.5, 6.0, 9.0};
	private static final double[] BLAST = {0.0, 4.5, 7.0, 10.0};
	private static final float[] BLAST_DAMAGE = {0.0F, 30.0F, 60.0F, 120.0F};
	private static final int[] DEBRIS = {0, 12, 30, 64};
	public static final float[] VISUAL_SIZE = {0.0F, 1.3F, 2.1F, 3.1F};

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

	public WorldbreakerOrbEntity(ServerLevel level, LivingEntity owner, int stage, Vec3 position, Vec3 direction) {
		this(ModEntities.WORLDBREAKER_ORB, level);
		this.setOwner(owner);
		this.entityData.set(DATA_STAGE, Mth.clamp(stage, 1, 3));
		this.setPos(position);
		Vec3 velocity = direction.normalize().scale(SPEED[this.getStage()]);
		this.setDeltaMovement(velocity);
		this.setYRot((float) (Mth.atan2(velocity.x, velocity.z) * Mth.RAD_TO_DEG));
		this.setXRot((float) (Mth.atan2(velocity.y, velocity.horizontalDistance()) * Mth.RAD_TO_DEG));
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_STAGE, 1);
		builder.define(DATA_DRILLING, false);
	}

	public int getStage() {
		return Mth.clamp(this.entityData.get(DATA_STAGE), 1, 3);
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
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 256.0 * 256.0;
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
		int stage = this.getStage();
		if (this.travelled > RANGE[stage] || this.tickCount > 400 || to.y < level.getMinY() + 2) {
			this.detonate(level);
			return;
		}

		double radius = TUNNEL[stage];
		double length = velocity.length();
		int steps = Math.max(1, Mth.ceil(length / (radius * 0.5)));
		boolean solid = false;
		for (int i = 1; i <= steps; i++) {
			Vec3 point = from.add(velocity.scale((double) i / steps));
			Drill result = this.drill(level, point, radius);
			if (result == Drill.STOPPED) {
				this.setPos(point);
				this.detonate(level);
				return;
			}
			solid |= result == Drill.SOLID;
		}
		this.setPos(to);
		this.travelled += length;
		if (solid) {
			if (this.airRun > 4.0) {
				this.entry = from;
			}
			this.airRun = 0.0;
			this.penetration += length;
		} else {
			this.airRun += length;
		}
		this.entityData.set(DATA_DRILLING, solid);

		this.strikeEntities(level, radius);
		this.serverEffects(level, solid);

		if (this.penetration >= DEPTH[stage]) {
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
		boolean solid = false;
		int r = Mth.ceil(radius + 1.3);
		double inner = radius * radius;
		double outer = (radius + 1.3) * (radius + 1.3);
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		for (int dx = -r; dx <= r; dx++) {
			for (int dy = -r; dy <= r; dy++) {
				for (int dz = -r; dz <= r; dz++) {
					cursor.set(centerPos.getX() + dx, centerPos.getY() + dy, centerPos.getZ() + dz);
					double d2 = cursor.distToCenterSqr(center);
					if (d2 > outer || !level.isInWorldBounds(cursor)) {
						continue;
					}
					BlockState state = level.getBlockState(cursor);
					if (state.isAir()) {
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

	private void strikeEntities(ServerLevel level, double radius) {
		Entity owner = this.getOwner();
		int stage = this.getStage();
		Vec3 center = this.position();
		Vec3 push = this.getDeltaMovement().normalize();
		AABB box = new AABB(center, center).inflate(radius + 1.0);
		for (Entity entity : level.getEntities(this, box, e -> e instanceof LivingEntity && Targeting.canHurt(owner, e))) {
			if (!this.struck.add(entity.getId()) || entity.getBoundingBox().getCenter().distanceTo(center) > radius + 1.5) {
				continue;
			}
			LivingEntity living = (LivingEntity) entity;
			living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.WORLDBREAKER, this, owner), HIT_DAMAGE[stage]);
			living.igniteForSeconds(6.0F);
			living.addEffect(new MobEffectInstance(ModEffects.SEARING, 100, 1), owner);
			living.push(push.x * 1.8, 0.5 + push.y, push.z * 1.8);
			living.hurtMarked = true;
		}
	}

	private void serverEffects(ServerLevel level, boolean drilling) {
		if (this.tickCount % 6 == 0) {
			level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 3.0F, 0.5F);
		}
		if (drilling) {
			if (this.tickCount % 3 == 0) {
				level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ANCIENT_DEBRIS_BREAK, SoundSource.BLOCKS, 3.0F, 0.5F);
				level.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.GRAVEL_BREAK, SoundSource.BLOCKS, 3.0F, 0.6F);
			}
			if (this.tickCount % 4 == 0) {
				Fx.shake(level, this.position(), 28.0, 0.6F + this.getStage() * 0.3F, 6);
			}
		}
	}

	private void clientEffects(Vec3 from, Vec3 to) {
		Level level = this.level();
		RandomSource random = this.random;
		int stage = this.getStage();
		float size = VISUAL_SIZE[stage];
		level.addParticle(ModParticles.ORB_CORE, true, true, to.x, to.y, to.z, size, 1.0, 0.0);
		if (this.tickCount % 2 == 0) {
			level.addParticle(ModParticles.ORB_CORE, true, true, to.x, to.y, to.z, size * 1.9, 0.35, 0.0);
		}
		Vec3 back = this.getDeltaMovement().normalize().scale(-1.0);
		for (int i = 0; i < 3 + stage * 2; i++) {
			Vec3 p = from.add(to.subtract(from).scale(random.nextDouble()));
			Vec3 v = back.scale(0.1 + random.nextDouble() * 0.2).add(random.nextGaussian() * 0.08, random.nextGaussian() * 0.08, random.nextGaussian() * 0.08);
			level.addParticle(ModParticles.STATIC_SPARK, true, true, p.x, p.y, p.z, v.x, v.y, v.z);
		}
		for (int k = 0; k < 3; k++) {
			double angle = this.tickCount * 0.55 + k * (Math.PI * 2.0 / 3.0);
			Vec3 side = new Vec3(Math.cos(angle), Math.sin(angle) * 0.6, Math.sin(angle)).scale(size * 0.55);
			level.addParticle(ModParticles.ARC, true, true, to.x + side.x, to.y + side.y, to.z + side.z, 0.6, 0.8, 4.0);
		}
		if (this.entityData.get(DATA_DRILLING)) {
			for (int i = 0; i < 4 + stage * 3; i++) {
				Vec3 v = new Vec3(random.nextGaussian(), random.nextGaussian() * 0.6 + 0.3, random.nextGaussian()).scale(0.25);
				level.addParticle(ModParticles.BLAST_DUST, true, true, to.x + random.nextGaussian() * size * 0.5,
					to.y + random.nextGaussian() * size * 0.5, to.z + random.nextGaussian() * size * 0.5, v.x, v.y, v.z);
				level.addParticle(ModParticles.EMBER, true, true, to.x, to.y, to.z, v.x * 2.0, v.y * 2.0, v.z * 2.0);
			}
			if (random.nextInt(2) == 0) {
				level.addParticle(ModParticles.MAGMA, true, true, to.x, to.y, to.z, random.nextGaussian() * 0.3, 0.3 + random.nextDouble() * 0.3, random.nextGaussian() * 0.3);
			}
			level.addParticle(ModParticles.HEAVY_SMOKE, true, true, from.x, from.y, from.z, 0.0, 0.03, 0.0);
		}
	}

	private void detonate(ServerLevel level) {
		if (this.detonated) {
			return;
		}
		this.detonated = true;
		int stage = this.getStage();
		Entity owner = this.getOwner();
		Vec3 end = this.position();
		Vec3 entryPoint = this.entry != null ? this.entry : end;

		Devastation.crater(level, entryPoint, end, CRATER[stage], END_RADIUS[stage], BLAST[stage], owner, DEBRIS[stage], Devastation.Lining.INFERNO);
		this.blast(level, end, BLAST[stage] * 2.2, BLAST_DAMAGE[stage], owner);
		if (entryPoint.distanceTo(end) > 6.0) {
			this.blast(level, entryPoint, CRATER[stage] * 1.4, BLAST_DAMAGE[stage] * 0.6F, owner);
		}

		Fx.send(level, end, 320.0, FxKind.ORB_IMPACT, end, entryPoint, stage, this.random.nextInt());
		float volume = 4.0F + stage * 3.0F;
		for (Vec3 at : new Vec3[]{end, entryPoint}) {
			level.playSound(null, at.x, at.y, at.z, SoundEvents.GENERIC_EXPLODE, SoundSource.BLOCKS, volume, 0.45F);
			level.playSound(null, at.x, at.y, at.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.BLOCKS, volume, 0.5F);
		}
		level.playSound(null, end.x, end.y, end.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.BLOCKS, volume * 0.6F, 0.4F);
		Fx.shake(level, end, 48.0 + 40.0 * stage, 1.5F + 1.6F * stage, 18 + 8 * stage);
		this.discard();
	}

	private void blast(ServerLevel level, Vec3 center, double radius, float maxDamage, @Nullable Entity owner) {
		AABB box = new AABB(center, center).inflate(radius);
		float stageFactor = this.getStage() / 3.0F;
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
			double strength = (1.5 + 2.5 * falloff) * (0.5 + stageFactor);
			living.push(dir.x * strength, 0.6 + falloff * 1.2, dir.z * strength);
			living.hurtMarked = true;
		}
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putInt("Stage", this.getStage());
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.entityData.set(DATA_STAGE, input.getIntOr("Stage", 1));
	}
}
