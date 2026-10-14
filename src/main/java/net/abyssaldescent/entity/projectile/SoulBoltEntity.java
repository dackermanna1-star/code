package net.abyssaldescent.entity.projectile;

import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModEntities;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * A slow orb of soul fire. Readable (bright, trailing embers, audible), dodgeable and blockable with a shield. Optional
 * gentle homing makes it punish standing still rather than tracking perfectly.
 */
public class SoulBoltEntity extends Projectile {
	private static final int LIFETIME = 120;
	private float damage = 4.0F;
	private double homing;
	private double speed = 0.4;
	/** Fired by a hostile mob. Kept on the bolt because the owner can be removed (killed) while it is in flight. */
	private boolean hostile;

	public SoulBoltEntity(EntityType<? extends SoulBoltEntity> type, Level level) {
		super(type, level);
	}

	public SoulBoltEntity(Level level, LivingEntity owner, Vec3 direction, double speed, float damage, double homing) {
		this(ModEntities.SOUL_BOLT, level);
		setOwner(owner);
		this.hostile = owner instanceof Enemy;
		this.damage = damage;
		this.homing = homing;
		this.speed = speed;
		setPos(owner.getX(), owner.getEyeY() - 0.2, owner.getZ());
		setDeltaMovement(direction.normalize().scale(speed));
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
	}

	@Override
	public void tick() {
		super.tick();
		Vec3 motion = getDeltaMovement();
		if (!level().isClientSide() && homing > 0 && getOwner() instanceof net.minecraft.world.entity.Mob mob && mob.getTarget() != null) {
			Vec3 toTarget = mob.getTarget().getEyePosition().subtract(position()).normalize();
			motion = motion.normalize().lerp(toTarget, homing).normalize().scale(speed);
			setDeltaMovement(motion);
		}
		HitResult hit = ProjectileUtil.getHitResultOnMoveVector(this, this::canHitEntity);
		if (hit.getType() != HitResult.Type.MISS) {
			hitTargetOrDeflectSelf(hit);
		}
		Vec3 next = position().add(getDeltaMovement());
		setPos(next.x, next.y, next.z);
		ProjectileUtil.rotateTowardsMovement(this, 0.5F);
		if (level().isClientSide()) {
			level().addParticle(ModParticles.SOUL_EMBER, getX(), getY() + 0.15, getZ(), 0.0, 0.0, 0.0);
			if (random.nextInt(2) == 0) {
				level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.15, getZ(), 0.0, 0.01, 0.0);
			}
		} else if (tickCount > LIFETIME) {
			fizzle();
		}
	}

	@Override
	protected void onHitEntity(EntityHitResult result) {
		super.onHitEntity(result);
		if (level() instanceof ServerLevel level) {
			Entity owner = getOwner();
			DamageSource source = level.damageSources().source(ModDamageTypes.SOUL_MAGIC, this, owner);
			if (result.getEntity().hurtServer(level, source, damage) && owner instanceof DungeonMonster monster) {
				monster.onDamageDealt(level, damage);
			}
			burst(level);
		}
	}

	@Override
	protected void onHitBlock(BlockHitResult result) {
		super.onHitBlock(result);
		if (level() instanceof ServerLevel level) {
			burst(level);
		}
	}

	@Override
	protected boolean canHitEntity(Entity entity) {
		// Dungeon enemies' bolts pass through other monsters so groups can fire safely, even after the caster died. The
		// owner check covers clients, which never see the saved flag.
		if ((hostile || getOwner() instanceof Enemy) && entity instanceof Enemy) {
			return false;
		}
		return super.canHitEntity(entity);
	}

	private void burst(ServerLevel level) {
		level.sendParticles(ModParticles.SOUL_EMBER, getX(), getY() + 0.15, getZ(), 14, 0.2, 0.2, 0.2, 0.08);
		level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 0.15, getZ(), 3, 0.15, 0.15, 0.15, 0.02);
		level.playSound(null, getX(), getY(), getZ(), ModSounds.SOUL_BOLT_HIT, SoundSource.HOSTILE, 0.8F, 0.9F + random.nextFloat() * 0.3F);
		discard();
	}

	private void fizzle() {
		if (level() instanceof ServerLevel level) {
			level.sendParticles(ParticleTypes.SOUL, getX(), getY(), getZ(), 4, 0.1, 0.1, 0.1, 0.01);
		}
		discard();
	}

	@Override
	public boolean isNoGravity() {
		return true;
	}

	@Override
	public boolean isOnFire() {
		return false;
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putFloat("damage", damage);
		output.putDouble("homing", homing);
		output.putDouble("speed", speed);
		output.putBoolean("hostile", hostile);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		damage = input.getFloatOr("damage", 4.0F);
		homing = input.getDoubleOr("homing", 0.0);
		speed = input.getDoubleOr("speed", 0.4);
		// Every bolt in the mod is cast by a dungeon enemy, so older saves default to hostile.
		hostile = input.getBooleanOr("hostile", true);
	}

	@Nullable
	public float damage() {
		return damage;
	}
}
