package com.chaosunleashed.events.alien;

import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.ai.RangedAttackMob;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.LookAroundGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.ProjectileAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.passive.IronGolemEntity;
import net.minecraft.entity.passive.VillagerEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/** Alien Soldier: dropped by UFOs, keeps its distance and fires slow, visible plasma bolts. */
public class AlienSoldierEntity extends HostileEntity implements RangedAttackMob {
	public AlienSoldierEntity(EntityType<? extends AlienSoldierEntity> type, World world) {
		super(type, world);
		this.experiencePoints = 8;
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return HostileEntity.createHostileAttributes()
			.add(EntityAttributes.MAX_HEALTH, 22.0)
			.add(EntityAttributes.MOVEMENT_SPEED, 0.27)
			.add(EntityAttributes.FOLLOW_RANGE, 40.0)
			.add(EntityAttributes.ARMOR, 4.0);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new ProjectileAttackGoal(this, 1.0, 30, 45, 18.0F));
		this.goalSelector.add(6, new WanderAroundFarGoal(this, 0.8));
		this.goalSelector.add(7, new LookAtEntityGoal(this, PlayerEntity.class, 16.0F));
		this.goalSelector.add(8, new LookAroundGoal(this));
		this.targetSelector.add(1, new RevengeGoal(this, AlienSoldierEntity.class));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
		this.targetSelector.add(3, new ActiveTargetGoal<>(this, VillagerEntity.class, false));
		this.targetSelector.add(3, new ActiveTargetGoal<>(this, IronGolemEntity.class, true));
	}

	@Override
	public void shootAt(LivingEntity target, float pullProgress) {
		PlasmaBoltEntity bolt = new PlasmaBoltEntity(this.getEntityWorld(), this);
		bolt.setDamage(4.0F);
		Vec3d from = new Vec3d(this.getX(), this.getEyeY() - 0.2, this.getZ());
		bolt.setPosition(from);
		double dx = target.getX() - from.x;
		double dy = target.getBodyY(0.5) - from.y;
		double dz = target.getZ() - from.z;
		bolt.setVelocity(dx, dy, dz, 0.75F, 4.0F);
		this.getEntityWorld().spawnEntity(bolt);
		this.getEntityWorld().playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PLASMA_SHOOT, SoundCategory.HOSTILE, 1.0F,
			0.9F + this.random.nextFloat() * 0.2F);
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return ModSounds.ALIEN_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return ModSounds.ALIEN_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return ModSounds.ALIEN_DEATH;
	}
}
