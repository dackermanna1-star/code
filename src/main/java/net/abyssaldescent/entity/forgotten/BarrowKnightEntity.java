package net.abyssaldescent.entity.forgotten;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.abyssaldescent.network.CameraShakePayload;
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
	/** Smash reach and width: shared by the ground telegraph and the hit test so they always match. */
	private static final float SMASH_LENGTH = 4.2F;
	private static final float SMASH_WIDTH = 1.8F;
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
		targetSelector.addGoal(1, new HurtByTargetGoal(this, DungeonMonster.class));
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
		private Vec3 strikeOrigin = Vec3.ZERO;

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
			return canUse() || windup > 0 || recovery > 0;
		}

		@Override
		public void stop() {
			setAction(0);
			windup = 0;
			recovery = 0;
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
				// The action stays set through recovery so the client plays the whole swing, not just the windup.
				if (--recovery == 0) {
					setAction(0);
				}
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
			strikeOrigin = position();
			float yaw = (float) Math.toDegrees(Math.atan2(-strikeDir.x, strikeDir.z));
			setYRot(yaw);
			setYBodyRot(yaw);
			setYHeadRot(yaw);
			windup = ticks;
			pending = action;
			setAction(action);
			if (action == ACTION_SMASH) {
				TelegraphEntity.line(level, strikeOrigin.add(0, 0.05, 0), yaw, SMASH_LENGTH, SMASH_WIDTH, ticks, 0xCCE0A040);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.KNIGHT_SWING, SoundSource.HOSTILE, 1.0F, 0.7F);
			} else {
				level.playSound(null, getX(), getY(), getZ(), SoundEvents.ARMOR_EQUIP_NETHERITE.value(), SoundSource.HOSTILE, 1.0F, 0.6F);
			}
		}

		private void strike(ServerLevel level) {
			if (pending == ACTION_SMASH) {
				// Lands exactly on the marked strip, even if the knight was shoved during the windup.
				Vec3 start = strikeOrigin;
				Vec3 end = start.add(strikeDir.scale(SMASH_LENGTH));
				AABB box = new AABB(start, end).inflate(SMASH_WIDTH / 2, 1.5, SMASH_WIDTH / 2).setMinY(start.y - 0.5);
				float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 1.4F;
				float dealt = 0;
				for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, box, e -> e != BarrowKnightEntity.this && !(e instanceof Monster))) {
					// The box is only a broad query; the strip is rotated, so test the distance along and across it.
					Vec3 rel = victim.position().subtract(start);
					double along = rel.x * strikeDir.x + rel.z * strikeDir.z;
					double across = Math.abs(rel.x * strikeDir.z - rel.z * strikeDir.x);
					double halfWidth = victim.getBbWidth() / 2;
					if (along < -halfWidth || along > SMASH_LENGTH + halfWidth || across > SMASH_WIDTH / 2 + halfWidth) {
						continue;
					}
					// The smash cleaves through a raised guard.
					if (victim.isBlocking() && victim instanceof Player player) {
						ItemStack shield = player.getUseItem();
						player.getCooldowns().addCooldown(shield, 60);
						player.stopUsingItem();
						level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SHIELD_BREAK.value(), SoundSource.PLAYERS, 1.0F, 0.9F);
					}
					if (victim.hurtServer(level, damageSources().mobAttack(BarrowKnightEntity.this), damage)) {
						dealt += damage;
					}
					victim.knockback(0.8, -strikeDir.x, -strikeDir.z);
				}
				onDamageDealt(level, dealt);
				Vec3 impact = start.add(strikeDir.scale(2.6));
				BlockState floor = level.getBlockState(BlockPos.containing(impact).below());
				level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, floor), impact.x, impact.y + 0.1, impact.z, 30, 0.6, 0.05, 0.6, 0.15);
				level.sendParticles(ModParticles.SHOCK_RING, impact.x, impact.y + 0.05, impact.z, 1, 0, 0, 0, 0);
				level.playSound(null, impact.x, impact.y, impact.z, ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 0.9F, 1.3F);
				CameraShakePayload.send(level, impact, 7.0, 0.45F, 7);
				recovery = Math.round(18 * cadence());
				cooldown = Math.round(30 * cadence());
			} else {
				LivingEntity target = getTarget();
				if (target != null && distanceTo(target) < 2.6) {
					float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.5F;
					if (target.hurtServer(level, damageSources().mobAttack(BarrowKnightEntity.this), damage)) {
						onDamageDealt(level, damage);
					}
					target.knockback(1.6, -strikeDir.x, -strikeDir.z);
				}
				recovery = Math.round(8 * cadence());
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
