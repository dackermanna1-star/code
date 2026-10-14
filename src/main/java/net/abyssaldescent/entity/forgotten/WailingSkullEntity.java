package net.abyssaldescent.entity.forgotten;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.projectile.SoulBoltEntity;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * A cursed reliquary skull wreathed in soul fire. It drifts out of reach and keens before spitting a slow homing soul
 * bolt: the wail is the cue to find cover behind a pillar or raise a shield. Fragile once you close the distance.
 */
public class WailingSkullEntity extends DungeonMonster {
	public static final int ACTION_CHARGE = 1;
	public final AnimationState chargeAnimation = new AnimationState();

	public WailingSkullEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
		this.moveControl = new FlyingMoveControl(this, 20, true);
		setNoGravity(true);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 10.0)
			.add(Attributes.ATTACK_DAMAGE, 3.0)
			.add(Attributes.MOVEMENT_SPEED, 0.3)
			.add(Attributes.FLYING_SPEED, 0.45)
			.add(Attributes.FOLLOW_RANGE, 32.0);
	}

	@Override
	protected PathNavigation createNavigation(Level level) {
		FlyingPathNavigation navigation = new FlyingPathNavigation(this, level);
		navigation.setCanOpenDoors(false);
		navigation.setCanFloat(true);
		return navigation;
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(2, new HoverAndCastGoal());
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, false));
	}

	@Override
	protected void onActionChanged(int action) {
		chargeAnimation.animateWhen(action == ACTION_CHARGE, tickCount);
	}

	@Override
	public void tick() {
		super.tick();
		if (level().isClientSide()) {
			if (random.nextInt(2) == 0) {
				level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, getX() + (random.nextDouble() - 0.5) * 0.4, getY() + 0.5,
					getZ() + (random.nextDouble() - 0.5) * 0.4, 0.0, 0.02, 0.0);
			}
			if (action() == ACTION_CHARGE) {
				level().addParticle(ModParticles.SOUL_EMBER, getX() + (random.nextDouble() - 0.5) * 1.6, getY() + random.nextDouble(),
					getZ() + (random.nextDouble() - 0.5) * 1.6, 0.0, 0.0, 0.0);
			}
		}
	}

	@Override
	public boolean causeFallDamage(double distance, float multiplier, DamageSource source) {
		return false;
	}

	@Override
	protected void checkFallDamage(double y, boolean onGround, BlockState state, BlockPos pos) {
	}

	@Override
	public void die(DamageSource source) {
		super.die(source);
		if (level() instanceof ServerLevel level) {
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), getX(), getY() + 0.3, getZ(), 20, 0.2,
				0.2, 0.2, 0.1);
			level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 0.3, getZ(), 6, 0.2, 0.2, 0.2, 0.03);
		}
	}

	private final class HoverAndCastGoal extends Goal {
		private int castCooldown = 40;
		private int charge;
		private int repositionTimer;

		HoverAndCastGoal() {
			setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
		}

		@Override
		public boolean canUse() {
			LivingEntity target = getTarget();
			return target != null && target.isAlive();
		}

		@Override
		public void stop() {
			setAction(0);
			charge = 0;
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void tick() {
			LivingEntity target = getTarget();
			if (target == null || !(level() instanceof ServerLevel level)) {
				return;
			}
			getLookControl().setLookAt(target, 40.0F, 40.0F);
			double dist = distanceTo(target);
			if (--repositionTimer <= 0 || getNavigation().isDone() && (dist < 5 || dist > 12)) {
				repositionTimer = 40 + random.nextInt(30);
				double angle = random.nextDouble() * Math.PI * 2;
				double radius = 7 + random.nextDouble() * 3;
				Vec3 spot = target.position().add(Math.cos(angle) * radius, 2.5 + random.nextDouble() * 1.5, Math.sin(angle) * radius);
				getNavigation().moveTo(spot.x, spot.y, spot.z, 1.0);
			}
			if (charge > 0) {
				getNavigation().stop();
				setDeltaMovement(getDeltaMovement().scale(0.6));
				if (--charge == 0) {
					setAction(0);
					Vec3 dir = target.getEyePosition().subtract(getEyePosition());
					double homing = Math.min(0.08, 0.025 + dungeonFloor() * 0.008);
					SoulBoltEntity bolt = new SoulBoltEntity(level, WailingSkullEntity.this, dir, 0.34, 2.5F + dungeonFloor() * 0.45F, homing);
					level.addFreshEntity(bolt);
					level.playSound(null, getX(), getY(), getZ(), ModSounds.SKULL_SHOOT, SoundSource.HOSTILE, 1.0F, 1.0F + random.nextFloat() * 0.2F);
					castCooldown = Math.round((50 + random.nextInt(25)) * cadence());
				}
				return;
			}
			if (--castCooldown <= 0 && dist < 18 && getSensing().hasLineOfSight(target)) {
				charge = Math.round(18 * cadence());
				setAction(ACTION_CHARGE);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.SKULL_WAIL, SoundSource.HOSTILE, 1.4F, 0.9F + random.nextFloat() * 0.2F);
			}
		}
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.SOUL_ESCAPE.value();
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.SKELETON_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return ModSounds.SKULL_WAIL;
	}

	@Override
	public float getVoicePitch() {
		return 1.4F;
	}
}
