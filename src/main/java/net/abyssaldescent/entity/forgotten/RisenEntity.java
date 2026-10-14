package net.abyssaldescent.entity.forgotten;

import net.abyssaldescent.entity.DungeonMonster;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The shambling dead of the Forgotten Halls. Slow and fragile alone, dangerous in numbers: they claw their way out of
 * the floor and their grasp slows whoever they hit, pinning delvers for the archers behind them.
 */
public class RisenEntity extends DungeonMonster {
	public static final byte EVENT_EMERGE = 101;
	private static final int EMERGE_TICKS = 24;
	public final AnimationState emergeAnimation = new AnimationState();

	public RisenEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 18.0)
			.add(Attributes.ATTACK_DAMAGE, 3.5)
			.add(Attributes.MOVEMENT_SPEED, 0.22)
			.add(Attributes.FOLLOW_RANGE, 32.0)
			.add(Attributes.ARMOR, 2.0);
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(0, new FloatGoal(this));
		goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, false) {
			@Override
			public boolean canUse() {
				return tickCount > EMERGE_TICKS && super.canUse();
			}
		});
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	protected void populateDefaultEquipmentSlots(RandomSource random, DifficultyInstance difficulty) {
		setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(random.nextBoolean() ? Items.STONE_SWORD : Items.IRON_SHOVEL));
	}

	@Override
	protected void onPrepared() {
		super.onPrepared();
		populateDefaultEquipmentSlots(random, null);
		for (EquipmentSlot slot : EquipmentSlot.values()) {
			setDropChance(slot, 0.0F);
		}
	}

	@Override
	public void tick() {
		super.tick();
		if (!level().isClientSide() && tickCount == 1) {
			level().broadcastEntityEvent(this, EVENT_EMERGE);
		}
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		if (tickCount < EMERGE_TICKS) {
			getNavigation().stop();
			if (tickCount % 4 == 0) {
				level.sendParticles(new net.minecraft.core.particles.BlockParticleOption(net.minecraft.core.particles.ParticleTypes.BLOCK,
					level.getBlockState(blockPosition().below())), getX(), getY() + 0.1, getZ(), 6, 0.3, 0.05, 0.3, 0.05);
			}
		}
		super.customServerAiStep(level);
	}

	@Override
	public void handleEntityEvent(byte id) {
		if (id == EVENT_EMERGE) {
			emergeAnimation.start(tickCount);
		} else {
			super.handleEntityEvent(id);
		}
	}

	@Override
	public boolean doHurtTarget(ServerLevel level, Entity target) {
		boolean hit = super.doHurtTarget(level, target);
		if (hit && target instanceof LivingEntity living && random.nextFloat() < 0.3F) {
			living.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 30, 0), this);
		}
		return hit;
	}

	@Override
	public boolean isInvulnerableTo(ServerLevel level, DamageSource source) {
		return tickCount < EMERGE_TICKS / 2 && !source.isCreativePlayer() || super.isInvulnerableTo(level, source);
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.ZOMBIE_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.ZOMBIE_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.ZOMBIE_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(SoundEvents.ZOMBIE_STEP, 0.15F, 0.8F);
	}

	@Override
	public float getVoicePitch() {
		return 0.65F + random.nextFloat() * 0.15F;
	}
}
