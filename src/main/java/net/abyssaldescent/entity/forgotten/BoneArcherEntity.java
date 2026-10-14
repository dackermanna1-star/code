package net.abyssaldescent.entity.forgotten;

import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.ai.KitingBowGoal;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Skeletal archers that keep their distance and lead their shots: running in a straight line gets you hit, changing
 * direction or raising a shield does not. Deeper floors bring better aim and cursed (slowing) arrows.
 */
public class BoneArcherEntity extends DungeonMonster implements RangedAttackMob {
	public BoneArcherEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 16.0)
			.add(Attributes.MOVEMENT_SPEED, 0.25)
			.add(Attributes.FOLLOW_RANGE, 36.0);
	}

	@Override
	protected void registerGoals() {
		goalSelector.addGoal(0, new FloatGoal(this));
		goalSelector.addGoal(3, new KitingBowGoal<>(this, 1.0, 6.0F, 15.0F, 22));
		goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8));
		goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 12.0F));
		goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		targetSelector.addGoal(1, new HurtByTargetGoal(this));
		targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	protected void populateDefaultEquipmentSlots(RandomSource random, DifficultyInstance difficulty) {
		setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.BOW));
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
	public void performRangedAttack(LivingEntity target, float power) {
		if (!(level() instanceof ServerLevel level)) {
			return;
		}
		ItemStack bow = getMainHandItem();
		AbstractArrow arrow = ProjectileUtil.getMobArrow(this, new ItemStack(Items.ARROW), power, bow);
		int floor = dungeonFloor();
		arrow.setBaseDamage(1.6 + floor * 0.18);
		arrow.pickup = AbstractArrow.Pickup.DISALLOWED;
		if (floor >= 3 && arrow instanceof Arrow plain && random.nextFloat() < 0.35F) {
			plain.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 60, 0));
		}
		// Lead the target: aim where it will be when the arrow arrives.
		double flight = distanceTo(target) / 2.4;
		Vec3 lead = target.getDeltaMovement().multiply(flight, 0.0, flight);
		double dx = target.getX() + lead.x - getX();
		double dz = target.getZ() + lead.z - getZ();
		double dy = target.getY(0.3333) - arrow.getY();
		double horizontal = Math.sqrt(dx * dx + dz * dz);
		float inaccuracy = Math.max(1.5F, 9.0F - floor * 1.3F);
		Projectile.spawnProjectileUsingShoot(arrow, level, bow, dx, dy + horizontal * 0.2, dz, 1.6F, inaccuracy);
		playSound(SoundEvents.SKELETON_SHOOT, 1.0F, 1.0F / (getRandom().nextFloat() * 0.4F + 0.8F));
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return SoundEvents.SKELETON_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return SoundEvents.SKELETON_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return SoundEvents.SKELETON_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(SoundEvents.SKELETON_STEP, 0.15F, 1.0F);
	}
}
