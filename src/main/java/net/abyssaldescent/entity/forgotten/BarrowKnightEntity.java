package net.abyssaldescent.entity.forgotten;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.fx.TelegraphEntity;
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
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * A barrow lord in rusted plate. Heavily armoured (axes and armour-breaking weapons shine here), slow, and deadly: its
 * overhead smash is marked on the ground, shatters raised shields, and leaves it exposed for a moment afterwards. Stand
 * too close and it shoves you away with its pommel.
 */
public class BarrowKnightEntity extends DungeonMonster {
	public static final int ACTION_SMASH = 1;
	public static final int ACTION_BASH = 2;
	public final AnimationState smashAnimation = new AnimationState();
	public final AnimationState bashAnimation = new AnimationState();

	public BarrowKnightEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 44.0)
			.add(Attributes.ATTACK_DAMAGE, 9.0)
			.add(Attributes.ATTACK_KNOCKBACK, 1.0)
			.add(Attributes.MOVEMENT_SPEED, 0.21)
			.add(Attributes.ARMOR, 12.0)
			.add(Attributes.ARMOR_TOUGHNESS, 2.0)
			.add(Attributes.KNOCKBACK_RESISTANCE, 0.6)
			.add(Attributes.FOLLOW_RANGE, 32.0);
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(0, new FloatGoal(this));
		goalSelector.addGoal(2, new KnightGoal());
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.7));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	protected void onActionChanged(int action) {
		smashAnimation.animateWhen(action == ACTION_SMASH, tickCount);
		bashAnimation.animateWhen(action == ACTION_BASH, tickCount);
	}

	private final class KnightGoal extends Goal {
		private int windup;
		private int recovery;
		private int cooldown = 20;
		private int pending;
		private Vec3 strikeDir = Vec3.ZERO;

		KnightGoal() {
			setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
		}

		@Override
		public boolean canUse() {
			LivingEntity target = getTarget();
			return target != null && target.isAlive();
		}

		@Override
		public boolean canContinueToUse() {
			return canUse() || windup > 0;
		}

		@Override
		public void stop() {
			setAction(0);
			windup = 0;
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
			if (windup > 0) {
				getNavigation().stop();
				if (--windup == 0) {
					strike(level);
				}
				return;
			}
			if (recovery > 0) {
				recovery--;
				getNavigation().stop();
				return;
			}
			if (target == null) {
				return;
			}
			getLookControl().setLookAt(target, 20.0F, 20.0F);
			double dist = distanceTo(target);
			if (cooldown > 0) {
				cooldown--;
			}
			if (dist < 1.7 && cooldown == 0) {
				begin(level, target, ACTION_BASH, Math.round(8 * cadence()));
			} else if (dist < 3.6 && cooldown == 0) {
				begin(level, target, ACTION_SMASH, Math.round(22 * cadence()));
			} else {
				getNavigation().moveTo(target, 1.0);
			}
		}

		private void begin(ServerLevel level, LivingEntity target, int action, int ticks) {
			Vec3 to = target.position().subtract(position());
			strikeDir = new Vec3(to.x, 0, to.z).normalize();
			float yaw = (float) Math.toDegrees(Math.atan2(-strikeDir.x, strikeDir.z));
			setYRot(yaw);
			setYBodyRot(yaw);
			setYHeadRot(yaw);
			windup = ticks;
			pending = action;
			setAction(action);
			if (action == ACTION_SMASH) {
				TelegraphEntity.line(level, position().add(0, 0.05, 0), yaw, 4.2F, 1.8F, ticks, 0xCCE0A040);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.KNIGHT_SWING, SoundSource.HOSTILE, 1.0F, 0.7F);
			} else {
				level.playSound(null, getX(), getY(), getZ(), SoundEvents.ARMOR_EQUIP_NETHERITE.value(), SoundSource.HOSTILE, 1.0F, 0.6F);
			}
		}

		private void strike(ServerLevel level) {
			setAction(0);
			if (pending == ACTION_SMASH) {
				Vec3 start = position();
				Vec3 end = start.add(strikeDir.scale(4.2));
				AABB box = new AABB(start, end).inflate(0.9, 1.5, 0.9).setMinY(getY() - 0.5);
				for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, box, e -> e != BarrowKnightEntity.this && !(e instanceof Monster))) {
					// The smash cleaves through a raised guard.
					if (victim.isBlocking() && victim instanceof Player player) {
						ItemStack shield = player.getUseItem();
						player.getCooldowns().addCooldown(shield, 60);
						player.stopUsingItem();
						level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SHIELD_BREAK.value(), SoundSource.PLAYERS, 1.0F, 0.9F);
					}
					victim.hurtServer(level, damageSources().mobAttack(BarrowKnightEntity.this), (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 1.4F);
					victim.knockback(0.8, -strikeDir.x, -strikeDir.z);
				}
				Vec3 impact = start.add(strikeDir.scale(2.6));
				BlockState floor = level.getBlockState(BlockPos.containing(impact).below());
				level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, floor), impact.x, impact.y + 0.1, impact.z, 30, 0.6, 0.05, 0.6, 0.15);
				level.sendParticles(ModParticles.SHOCK_RING, impact.x, impact.y + 0.05, impact.z, 1, 0, 0, 0, 0);
				level.playSound(null, impact.x, impact.y, impact.z, ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 0.9F, 1.3F);
				recovery = Math.round(18 * cadence());
				cooldown = Math.round(30 * cadence());
			} else {
				LivingEntity target = getTarget();
				if (target != null && distanceTo(target) < 2.6) {
					target.hurtServer(level, damageSources().mobAttack(BarrowKnightEntity.this), (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.5F);
					target.knockback(1.6, -strikeDir.x, -strikeDir.z);
				}
				recovery = 8;
				cooldown = Math.round(16 * cadence());
			}
		}
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.WITHER_SKELETON_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.IRON_GOLEM_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.WITHER_SKELETON_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(SoundEvents.NETHERITE_BLOCK_STEP, 0.4F, 0.6F);
	}

	@Override
	public float getVoicePitch() {
		return 0.6F;
	}
}
