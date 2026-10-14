package net.abyssaldescent.entity.forgotten;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.abyssaldescent.registry.ModEffects;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * A fast, hunched carrion-eater. It circles at mid range, then crouches and shrieks before pouncing along a marked line.
 * Side-step the line and it crashes into the floor, dazed; meet it with a raised shield and it is knocked reeling.
 */
public class CryptGhoulEntity extends DungeonMonster {
	public static final int ACTION_CROUCH = 1;
	public static final int ACTION_LEAP = 2;
	public static final int ACTION_DAZED = 3;
	private static final int CROUCH_TICKS = 14;

	public final AnimationState crouchAnimation = new AnimationState();
	public final AnimationState leapAnimation = new AnimationState();
	public final AnimationState dazedAnimation = new AnimationState();

	public CryptGhoulEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 20.0)
			.add(Attributes.ATTACK_DAMAGE, 4.0)
			.add(Attributes.MOVEMENT_SPEED, 0.31)
			.add(Attributes.FOLLOW_RANGE, 32.0)
			.add(Attributes.SAFE_FALL_DISTANCE, 8.0);
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(0, new FloatGoal(this));
		goalSelector.addGoal(2, new PounceGoal());
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.9));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	protected void onActionChanged(int action) {
		crouchAnimation.animateWhen(action == ACTION_CROUCH, tickCount);
		leapAnimation.animateWhen(action == ACTION_LEAP, tickCount);
		dazedAnimation.animateWhen(action == ACTION_DAZED, tickCount);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		// A dazed ghoul is wide open.
		return super.hurtServer(level, source, action() == ACTION_DAZED ? amount * 1.35F : amount);
	}

	private final class PounceGoal extends Goal {
		private enum Phase { STALK, CROUCH, LEAP, DAZED }

		private Phase phase = Phase.STALK;
		private int timer;
		private int cooldown = 30;
		private int clawCooldown;
		private Vec3 leapTarget = Vec3.ZERO;
		private boolean hitDuringLeap;

		PounceGoal() {
			setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
		}

		@Override
		public boolean canUse() {
			LivingEntity target = getTarget();
			return target != null && target.isAlive();
		}

		@Override
		public boolean canContinueToUse() {
			return canUse() || phase == Phase.LEAP || phase == Phase.DAZED;
		}

		@Override
		public void start() {
			setAggressive(true);
			phase = Phase.STALK;
		}

		@Override
		public void stop() {
			setAggressive(false);
			setAction(0);
			phase = Phase.STALK;
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void tick() {
			LivingEntity target = getTarget();
			if (!(level() instanceof ServerLevel level)) {
				return;
			}
			switch (phase) {
				case STALK -> stalk(level, target);
				case CROUCH -> {
					getNavigation().stop();
					if (target != null) {
						getLookControl().setLookAt(target, 30.0F, 30.0F);
					}
					if (--timer <= 0) {
						leap(level);
					}
				}
				case LEAP -> {
					timer--;
					if (!hitDuringLeap) {
						for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(0.4),
							e -> e instanceof Player p && !p.isSpectator() && !p.isCreative())) {
							hitDuringLeap = true;
							if (victim.isBlocking()) {
								// Met by a shield: the ghoul rebounds and reels.
								victim.hurtServer(level, damageSources().mobAttack(CryptGhoulEntity.this), 1.0F);
								Vec3 back = position().subtract(victim.position()).normalize().scale(0.6);
								setDeltaMovement(back.x, 0.3, back.z);
								level.playSound(null, getX(), getY(), getZ(), SoundEvents.SHIELD_BLOCK.value(), SoundSource.HOSTILE, 1.0F, 0.8F);
								daze(48);
								return;
							}
							if (doHurtTarget(level, victim)) {
								victim.addEffect(new MobEffectInstance(ModEffects.BLEEDING, 60, 0), CryptGhoulEntity.this);
							}
							break;
						}
					}
					if ((onGround() && timer < 16) || timer <= 0) {
						if (hitDuringLeap) {
							setAction(0);
							phase = Phase.STALK;
							cooldown = Math.round(50 * cadence());
						} else {
							level.sendParticles(ParticleTypes.POOF, getX(), getY() + 0.2, getZ(), 6, 0.3, 0.1, 0.3, 0.02);
							daze(26);
						}
					}
				}
				case DAZED -> {
					getNavigation().stop();
					if (tickCount % 6 == 0) {
						level.sendParticles(ParticleTypes.CRIT, getX(), getY() + getBbHeight() + 0.2, getZ(), 2, 0.2, 0.05, 0.2, 0.0);
					}
					if (--timer <= 0) {
						setAction(0);
						phase = Phase.STALK;
						cooldown = Math.round(40 * cadence());
					}
				}
			}
		}

		private void stalk(ServerLevel level, LivingEntity target) {
			if (target == null) {
				return;
			}
			getLookControl().setLookAt(target, 30.0F, 30.0F);
			double dist = distanceTo(target);
			if (cooldown > 0) {
				cooldown--;
			}
			if (clawCooldown > 0) {
				clawCooldown--;
			}
			if (dist < 2.2 && clawCooldown == 0) {
				swing(InteractionHand.MAIN_HAND);
				doHurtTarget(level, target);
				clawCooldown = Math.round(20 * cadence());
			}
			if (cooldown == 0 && dist > 3.5 && dist < 9.0 && getSensing().hasLineOfSight(target) && onGround()) {
				phase = Phase.CROUCH;
				timer = Math.round(CROUCH_TICKS * cadence());
				leapTarget = target.position();
				setAction(ACTION_CROUCH);
				Vec3 dir = leapTarget.subtract(position());
				float yaw = (float) Math.toDegrees(Math.atan2(-dir.x, dir.z));
				TelegraphEntity.line(level, position().add(0, 0.05, 0), yaw, (float) Math.min(9.5, dir.horizontalDistance() + 1.5), 1.4F, timer,
					0xCCB0123A);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.GHOUL_SCREECH, SoundSource.HOSTILE, 1.2F, 0.9F + random.nextFloat() * 0.2F);
				return;
			}
			// Circle at mid range instead of running straight in.
			if (dist > 6.0) {
				getNavigation().moveTo(target, 1.0);
			} else if (dist < 3.0 && clawCooldown > 0) {
				getNavigation().stop();
			} else {
				getNavigation().stop();
				getMoveControl().strafe(0.2F, (tickCount / 40) % 2 == 0 ? 0.6F : -0.6F);
			}
		}

		private void leap(ServerLevel level) {
			Vec3 dir = leapTarget.subtract(position());
			double horizontal = Math.min(9.0, dir.horizontalDistance());
			Vec3 flat = new Vec3(dir.x, 0, dir.z).normalize();
			double power = 0.22 + horizontal * 0.09;
			setDeltaMovement(flat.x * power, 0.42, flat.z * power);
			needsSync = true;
			phase = Phase.LEAP;
			timer = 22;
			hitDuringLeap = false;
			setAction(ACTION_LEAP);
			level.playSound(null, getX(), getY(), getZ(), ModSounds.GHOUL_LEAP, SoundSource.HOSTILE, 1.0F, 1.0F);
		}

		private void daze(int ticks) {
			phase = Phase.DAZED;
			timer = ticks;
			setAction(ACTION_DAZED);
		}
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.HUSK_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.HUSK_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.HUSK_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(SoundEvents.SPIDER_STEP, 0.15F, 1.3F);
	}

	@Override
	public float getVoicePitch() {
		return 1.25F + random.nextFloat() * 0.2F;
	}
}
