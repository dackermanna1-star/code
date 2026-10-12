package com.chaosunleashed.events.eclipse;

import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.LookAroundGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Eclipse-only monster: a fast shadow that is invisible except for its glowing eyes, and only faintly visible in
 * darkness. Hits inflict Darkness. It cannot stand bright light and withers away in daylight.
 */
public class ShadeStalkerEntity extends HostileEntity {
	public ShadeStalkerEntity(EntityType<? extends ShadeStalkerEntity> type, World world) {
		super(type, world);
		this.experiencePoints = 10;
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return HostileEntity.createHostileAttributes()
			.add(EntityAttributes.MAX_HEALTH, 24.0)
			.add(EntityAttributes.MOVEMENT_SPEED, 0.36)
			.add(EntityAttributes.ATTACK_DAMAGE, 5.0)
			.add(EntityAttributes.FOLLOW_RANGE, 48.0)
			.add(EntityAttributes.STEP_HEIGHT, 1.0);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.2, false));
		this.goalSelector.add(7, new WanderAroundFarGoal(this, 0.8));
		this.goalSelector.add(8, new LookAtEntityGoal(this, PlayerEntity.class, 16.0F));
		this.goalSelector.add(8, new LookAroundGoal(this));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, false));
	}

	@Override
	public boolean tryAttack(ServerWorld world, Entity target) {
		boolean hit = super.tryAttack(world, target);
		if (hit && target instanceof LivingEntity living) {
			living.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 80, 0), this);
		}
		return hit;
	}

	@Override
	public void tickMovement() {
		super.tickMovement();
		World world = this.getEntityWorld();
		if (world.isClient()) {
			if (this.random.nextInt(3) == 0) {
				world.addParticleClient(ModParticles.SHADOW_WISP, this.getParticleX(0.5), this.getRandomBodyY(), this.getParticleZ(0.5), 0.0, 0.02, 0.0);
			}
		} else if (this.age % 20 == 0 && this.isInBrightLight(world)) {
			// Shadows can't survive real daylight.
			this.damage((ServerWorld) world, this.getDamageSources().magic(), 3.0F);
		}
	}

	private boolean isInBrightLight(World world) {
		BlockPos eyes = BlockPos.ofFloored(this.getX(), this.getEyeY(), this.getZ());
		return world.getLightLevel(eyes) >= 12;
	}

	@Override
	protected void playStepSound(BlockPos pos, net.minecraft.block.BlockState state) {
		// Silent footsteps.
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return ModSounds.SHADE_STALKER_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return ModSounds.SHADE_STALKER_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return ModSounds.SHADE_STALKER_DEATH;
	}
}
