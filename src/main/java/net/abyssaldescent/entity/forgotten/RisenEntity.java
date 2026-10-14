package net.abyssaldescent.entity.forgotten;

import net.abyssaldescent.entity.DungeonMonster;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
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
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * The shambling dead of the Forgotten Halls. Slow and fragile alone, dangerous in numbers: they claw their way out of
 * the floor and their grasp slows whoever they hit, pinning delvers for the archers behind them.
 */
public class RisenEntity extends DungeonMonster {
	/**
	 * Game time this Risen started clawing out of the floor. Saved and synced (entity tick counts are neither), so it
	 * does not re-emerge after a reload and late-tracking clients draw it already standing.
	 */
	private static final EntityDataAccessor<Long> DATA_EMERGE_START = SynchedEntityData.defineId(RisenEntity.class, EntityDataSerializers.LONG);
	private static final int EMERGE_TICKS = 24;

	public RisenEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
		if (!level.isClientSide()) {
			entityData.set(DATA_EMERGE_START, level.getGameTime());
		}
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		// 0 = emerged long ago (also what a client sees until told otherwise).
		builder.define(DATA_EMERGE_START, 0L);
	}

	private long emergeAge() {
		return level().getGameTime() - entityData.get(DATA_EMERGE_START);
	}

	private boolean emerging() {
		return emergeAge() < EMERGE_TICKS;
	}

	/** 0 = still underground, 1 = fully risen. */
	public float emergeProgress(float partialTick) {
		return Mth.clamp((emergeAge() + partialTick) / EMERGE_TICKS, 0.0F, 1.0F);
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
			// Own swing cooldown: vanilla's is private and fixed at 20 ticks, but frenzied elites swing faster.
			private int attackCooldown;

			@Override
			public boolean canUse() {
				return !emerging() && super.canUse();
			}

			@Override
			public void start() {
				super.start();
				attackCooldown = 0;
			}

			@Override
			public void tick() {
				attackCooldown = Math.max(attackCooldown - 1, 0);
				super.tick();
			}

			@Override
			protected void resetAttackCooldown() {
				attackCooldown = adjustedTickDelay(Math.round(20 * cadence()));
			}

			@Override
			protected boolean isTimeToAttack() {
				return attackCooldown <= 0;
			}
		});
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this, DungeonMonster.class));
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
	protected void customServerAiStep(ServerLevel level) {
		if (emerging()) {
			getNavigation().stop();
			if (tickCount % 4 == 0) {
				level.sendParticles(new net.minecraft.core.particles.BlockParticleOption(net.minecraft.core.particles.ParticleTypes.BLOCK,
					level.getBlockState(blockPosition().below())), getX(), getY() + 0.1, getZ(), 6, 0.3, 0.05, 0.3, 0.05);
			}
		}
		super.customServerAiStep(level);
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
		return emergeAge() < EMERGE_TICKS / 2 && !source.isCreativePlayer() || super.isInvulnerableTo(level, source);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putLong("emerge_start", entityData.get(DATA_EMERGE_START));
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		entityData.set(DATA_EMERGE_START, input.getLongOr("emerge_start", 0L));
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
