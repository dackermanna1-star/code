package net.earthscapes.entity;

import net.earthscapes.entity.goal.GrazeGoal;
import net.earthscapes.entity.goal.HuntGoal;
import net.earthscapes.entity.goal.StayWithHerdGoal;
import net.earthscapes.registry.EsEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.BreedGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowParentGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jspecify.annotations.Nullable;

/**
 * The wild animals of the Earthscapes worlds. One class serves them all; what each species eats,
 * whom it fears or hunts and how it sounds comes from its {@link Species}.
 */
public class EsAnimal extends Animal {
	/** Entity event: lowers the head to graze for a while. */
	public static final byte EVENT_GRAZE = 10;
	/** Entity event: plays the species' display (trunk raised, yawn, roar). */
	public static final byte EVENT_ACTION = 11;
	public static final int GRAZE_TICKS = 40;
	public static final int ACTION_TICKS = 50;

	private static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(EsAnimal.class, EntityDataSerializers.INT);

	private int grazeTicks;
	private int actionTicks;
	private long huntReadyTick;

	public EsAnimal(EntityType<? extends EsAnimal> type, Level level) {
		super(type, level);
		if (this.species().swims) {
			this.setPathfindingMalus(PathType.WATER, 0.0F);
		}
	}

	public final Species species() {
		return Species.of(this.getType());
	}

	@Override
	protected void registerGoals() {
		Species sp = this.species();
		boolean fights = sp.neutral || sp.hunts != null || sp.ambushesInWater;
		this.goalSelector.addGoal(0, new FloatGoal(this));
		if (fights) {
			this.goalSelector.addGoal(1, new MeleeAttackGoal(this, sp.chaseSpeed, true));
		} else {
			this.goalSelector.addGoal(1, new PanicGoal(this, sp.fleeSpeed));
		}
		if (sp.prey) {
			this.goalSelector.addGoal(2, new AvoidEntityGoal<>(this, LivingEntity.class, 14.0F, 1.1, sp.fleeSpeed,
				e -> e.getType().is(EsEntities.PREDATORS) && !e.isBaby()));
		}
		if (sp.shyDistance > 0.0F) {
			this.goalSelector.addGoal(2, new AvoidEntityGoal<>(this, Player.class, sp.shyDistance, 1.1, sp.fleeSpeed,
				e -> !e.isDiscrete() && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(e)));
		}
		this.goalSelector.addGoal(3, new BreedGoal(this, 1.0));
		this.goalSelector.addGoal(4, new TemptGoal(this, 1.1, stack -> stack.is(sp.food), false));
		this.goalSelector.addGoal(5, new FollowParentGoal(this, 1.1));
		if (sp.herdRadius > 0.0F) {
			this.goalSelector.addGoal(6, new StayWithHerdGoal(this, sp.herdRadius, 1.0));
		}
		if (sp.grazes) {
			this.goalSelector.addGoal(7, new GrazeGoal(this));
		}
		this.goalSelector.addGoal(8, sp.swims ? new RandomStrollGoal(this, 1.0) : new WaterAvoidingRandomStrollGoal(this, 1.0));
		this.goalSelector.addGoal(9, new LookAtPlayerGoal(this, Player.class, 8.0F));
		this.goalSelector.addGoal(10, new RandomLookAroundGoal(this));
		if (sp.neutral) {
			this.targetSelector.addGoal(1, new HurtByTargetGoal(this).setAlertOthers());
		}
		if (sp.hunts != null) {
			this.targetSelector.addGoal(2, new HuntGoal(this, sp.hunts));
		}
		if (sp.ambushesInWater) {
			this.targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, Player.class, 20, true, false,
				(target, level) -> this.isInWater() && target.distanceToSqr(this) < 49.0));
		}
	}

	// ------------------------------------------------------------------ variants

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_VARIANT, 0);
	}

	public int getVariant() {
		return this.entityData.get(DATA_VARIANT);
	}

	public void setVariant(int variant) {
		this.entityData.set(DATA_VARIANT, variant);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putInt("Variant", this.getVariant());
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.setVariant(input.getIntOr("Variant", 0));
	}

	@Override
	public @Nullable SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, EntitySpawnReason reason,
		@Nullable SpawnGroupData groupData) {
		Species sp = this.species();
		if (sp.variants != null) {
			this.setVariant(sp.variants.pick(level.getBiome(this.blockPosition()), level.getRandom()));
		}
		if (groupData == null) {
			// herds bring their young along
			groupData = new AgeableMob.AgeableMobGroupData(sp.herdRadius > 0.0F ? 0.2F : 0.1F);
		}
		return super.finalizeSpawn(level, difficulty, reason, groupData);
	}

	// ------------------------------------------------------------------ breeding

	@Override
	public boolean isFood(ItemStack stack) {
		return stack.is(this.species().food);
	}

	@Override
	public @Nullable AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
		@SuppressWarnings("unchecked")
		EsAnimal child = ((EntityType<? extends EsAnimal>) this.getType()).create(level, EntitySpawnReason.BREEDING);
		if (child != null) {
			Species sp = this.species();
			child.setVariant(sp.variants != null ? sp.variants.pick(level.getBiome(this.blockPosition()), this.random) : this.getVariant());
		}
		return child;
	}

	@Override
	public int getMaxSpawnClusterSize() {
		return this.species().herdRadius > 0.0F ? 10 : 3;
	}

	// ------------------------------------------------------------------ hunting

	public boolean isHungry() {
		return this.level().getGameTime() >= this.huntReadyTick;
	}

	/** After a hunt, predators rest and digest for a few minutes. */
	public void sated() {
		this.huntReadyTick = this.level().getGameTime() + 2400 + this.random.nextInt(4800);
	}

	// ------------------------------------------------------------------ grazing and displays (client-side animation state)

	@Override
	public void handleEntityEvent(byte event) {
		if (event == EVENT_GRAZE) {
			this.grazeTicks = GRAZE_TICKS;
		} else if (event == EVENT_ACTION) {
			this.actionTicks = ACTION_TICKS;
		} else {
			super.handleEntityEvent(event);
		}
	}

	@Override
	public void aiStep() {
		if (this.level().isClientSide()) {
			this.grazeTicks = Math.max(0, this.grazeTicks - 1);
			this.actionTicks = Math.max(0, this.actionTicks - 1);
		}
		super.aiStep();
	}

	/** 0..1 how far the head is lowered for grazing. */
	public float getGrazeAmount(float partialTick) {
		if (this.grazeTicks <= 0) {
			return 0.0F;
		}
		float t = this.grazeTicks - partialTick;
		return Math.min(1.0F, Math.min(t, GRAZE_TICKS - t) / 6.0F);
	}

	/** 0..1 progress of the display animation, or 0 when there is none. */
	public float getActionAmount(float partialTick) {
		if (this.actionTicks <= 0) {
			return 0.0F;
		}
		float t = this.actionTicks - partialTick;
		return Math.min(1.0F, Math.min(t, ACTION_TICKS - t) / 10.0F);
	}

	// ------------------------------------------------------------------ sounds

	@Override
	public void playAmbientSound() {
		Species sp = this.species();
		if (!this.level().isClientSide() && sp.actionChance > 0.0F && !this.isBaby() && this.random.nextFloat() < sp.actionChance) {
			this.level().broadcastEntityEvent(this, EVENT_ACTION);
			if (sp.action != null) {
				this.playSound(sp.action, this.getSoundVolume() * 1.5F, this.getVoicePitch());
				return;
			}
		}
		super.playAmbientSound();
	}

	@Override
	protected @Nullable SoundEvent getAmbientSound() {
		return this.species().ambient;
	}

	@Override
	protected @Nullable SoundEvent getHurtSound(DamageSource source) {
		return this.species().hurt;
	}

	@Override
	protected @Nullable SoundEvent getDeathSound() {
		return this.species().death;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		SoundEvent step = this.species().step;
		if (step != null) {
			this.playSound(step, 0.15F * this.species().volume, 1.0F);
		} else {
			super.playStepSound(pos, state);
		}
	}

	@Override
	protected float getSoundVolume() {
		return this.species().volume;
	}

	@Override
	public float getVoicePitch() {
		return super.getVoicePitch() * this.species().pitch;
	}

	@Override
	public int getAmbientSoundInterval() {
		return this.species().ambientInterval;
	}

	// ------------------------------------------------------------------ spawning

	/**
	 * Natural spawns: on open ground of the kinds these animals live on (including sand drifts and
	 * rock), at the surface rather than in caves, and regardless of the light under a canopy.
	 */
	public static boolean checkSpawnRules(EntityType<? extends EsAnimal> type, LevelAccessor level, EntitySpawnReason reason, BlockPos pos,
		RandomSource random) {
		if (!level.getBlockState(pos.below()).is(EsEntities.ANIMALS_SPAWNABLE_ON)) {
			return false;
		}
		return EntitySpawnReason.ignoresLightRequirements(reason)
			|| pos.getY() >= level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, pos.getX(), pos.getZ()) - 1;
	}
}
