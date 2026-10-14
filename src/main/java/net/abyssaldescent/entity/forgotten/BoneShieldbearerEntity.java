package net.abyssaldescent.entity.forgotten;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
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
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Advances behind a raised shield that blocks frontal attacks. It lowers the shield to strike (a short, readable
 * windup with the sword raised overhead), leaving a punish window. Flank it, bait the swing, or break the shield with
 * an axe, exactly as you would against a shield-wielding player.
 */
public class BoneShieldbearerEntity extends DungeonMonster {
	public static final int ACTION_WINDUP = 1;
	private int shieldBrokenTicks;

	public BoneShieldbearerEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 22.0)
			.add(Attributes.ATTACK_DAMAGE, 4.5)
			.add(Attributes.MOVEMENT_SPEED, 0.23)
			.add(Attributes.ARMOR, 4.0)
			.add(Attributes.KNOCKBACK_RESISTANCE, 0.3)
			.add(Attributes.FOLLOW_RANGE, 32.0);
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(0, new FloatGoal(this));
		goalSelector.addGoal(2, new ShieldAdvanceGoal());
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	protected void populateDefaultEquipmentSlots(RandomSource random, DifficultyInstance difficulty) {
		setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.IRON_SWORD));
		setItemSlot(EquipmentSlot.OFFHAND, new ItemStack(Items.SHIELD));
	}

	@Override
	protected void onPrepared() {
		super.onPrepared();
		populateDefaultEquipmentSlots(random, null);
		for (EquipmentSlot slot : EquipmentSlot.values()) {
			setDropChance(slot, 0.0F);
		}
	}

	public boolean shieldBroken() {
		return shieldBrokenTicks > 0;
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		if (shieldBrokenTicks > 0) {
			shieldBrokenTicks--;
		}
		super.customServerAiStep(level);
	}

	@Override
	protected void blockUsingItem(ServerLevel level, LivingEntity attacker) {
		super.blockUsingItem(level, attacker);
		if (attacker.getSecondsToDisableBlocking() > 0.0F) {
			// Axes break the guard, as they do for players.
			stopUsingItem();
			shieldBrokenTicks = 100;
			level.playSound(null, getX(), getY(), getZ(), SoundEvents.SHIELD_BREAK.value(), SoundSource.HOSTILE, 1.0F, 0.8F + random.nextFloat() * 0.3F);
			level.sendParticles(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.SHIELD)), getX(), getY() + 1.1, getZ(), 12, 0.3, 0.3, 0.3,
				0.1);
		}
	}

	private final class ShieldAdvanceGoal extends Goal {
		private int windup;
		private int recovery;

		ShieldAdvanceGoal() {
			setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
		}

		@Override
		public boolean canUse() {
			LivingEntity target = getTarget();
			return target != null && target.isAlive();
		}

		@Override
		public void start() {
			setAggressive(true);
			windup = 0;
			recovery = 0;
		}

		@Override
		public void stop() {
			setAggressive(false);
			stopUsingItem();
			setAction(0);
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void tick() {
			LivingEntity target = getTarget();
			if (target == null) {
				return;
			}
			getLookControl().setLookAt(target, 30.0F, 30.0F);
			double dist = distanceTo(target);
			if (windup > 0) {
				getNavigation().stop();
				lookAt(target, 30.0F, 30.0F);
				if (--windup == 0) {
					setAction(0);
					swing(InteractionHand.MAIN_HAND);
					if (distanceTo(target) < 3.4 && level() instanceof ServerLevel level) {
						doHurtTarget(level, target);
					}
					recovery = Math.round(16 * cadence());
				}
				return;
			}
			if (recovery > 0) {
				recovery--;
				getNavigation().stop();
				return;
			}
			boolean wantsGuard = !shieldBroken() && dist < 10;
			if (wantsGuard && !isUsingItem()) {
				startUsingItem(InteractionHand.OFF_HAND);
			} else if (!wantsGuard && isUsingItem()) {
				stopUsingItem();
			}
			if (dist > 2.6) {
				getNavigation().moveTo(target, isUsingItem() ? 0.85 : 1.1);
			} else {
				getNavigation().stop();
				stopUsingItem();
				windup = Math.round(10 * cadence());
				setAction(ACTION_WINDUP);
				playSound(SoundEvents.ARMOR_EQUIP_IRON.value(), 0.8F, 0.6F);
			}
		}
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.SKELETON_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return isBlocking() ? SoundEvents.SHIELD_BLOCK.value() : SoundEvents.SKELETON_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.SKELETON_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(SoundEvents.SKELETON_STEP, 0.15F, 0.85F);
	}

	@Override
	public float getVoicePitch() {
		return 0.8F;
	}
}
