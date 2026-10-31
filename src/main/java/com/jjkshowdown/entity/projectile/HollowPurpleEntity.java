package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.ParticleDensity;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Hollow Technique: Purple — the imaginary mass. Erases everything in its path: terrain, entities, barriers.
 */
public class HollowPurpleEntity extends TechniqueProjectile {
	public HollowPurpleEntity(EntityType<? extends HollowPurpleEntity> type, Level level) {
		super(type, level);
		this.maxLife = 80;
		this.pierce = Integer.MAX_VALUE;
	}

	public static HollowPurpleEntity create(ServerLevel level, LivingEntity owner, float radius, float damage, int life) {
		HollowPurpleEntity p = new HollowPurpleEntity(ModEntities.HOLLOW_PURPLE, level);
		p.setOwner(owner);
		p.setScale(radius);
		p.setCharge(1f);
		p.damage = damage;
		p.maxLife = life;
		return p;
	}

	@Override
	protected boolean collidesWithBlocks() {
		return false;
	}

	@Override
	protected boolean bypassesInfinity() {
		return true;
	}

	@Override
	protected double hitInflate() {
		return scale();
	}

	@Override
	protected void onTechniqueHitEntity(ServerLevel level, LivingEntity target) {
		TechniqueDamage.hurt(target, ModDamageTypes.HOLLOW_PURPLE, this, ownerLiving(), damage, true);
		if (target.isAlive()) {
			TechniqueDamage.impulse(target, getDeltaMovement().normalize().scale(2.5).add(0, 0.6, 0));
		}
		Fx.burst(level, ModParticles.PURPLE_SPARK, target.getBoundingBox().getCenter(), 30, 0.7);
		JjkNetwork.screenEffect(target, com.jjkshowdown.network.Payloads.ScreenEffect.FLASH, 1.0f, 12, 0xC070FF);
	}

	@Override
	protected void serverTick(ServerLevel level, Vec3 from, Vec3 to) {
		float r = scale();
		Destruction.carveCapsule(level, from, to, r * 1.05, ownerLiving(), 60f, 0.04f);
		if (tickCount % 3 == 0) {
			JjkNetwork.shakeAround(level, position(), 48, 0.35f, 6);
		}
		// anything grazing the sphere is caught in the wake
		if (tickCount % 2 == 0 && ownerLiving() != null) {
			for (LivingEntity e : Targeting.livingInRadius(ownerLiving(), position(), r + 2.5)) {
				if (!hitEntities.contains(e.getId())) {
					TechniqueDamage.impulse(e, e.position().subtract(position()).normalize().scale(0.6).add(0, 0.25, 0));
				}
			}
		}
	}

	@Override
	protected void onExpire(ServerLevel level) {
		Fx.burst(level, ModParticles.PURPLE_SPARK, position(), 120, 1.2);
		Fx.particles(level, ModParticles.IMPACT_FLASH, position(), 2, 0.5, 0);
	}

	@Override
	protected void clientTick() {
		Vec3 p = position();
		float r = scale();
		int n = ParticleDensity.scale(14);
		for (int i = 0; i < n; i++) {
			double u = random.nextDouble() * 2 - 1;
			double t = random.nextDouble() * Math.PI * 2;
			double s = Math.sqrt(1 - u * u);
			Vec3 dir = new Vec3(s * Math.cos(t), u, s * Math.sin(t));
			Vec3 at = p.add(dir.scale(r * (0.9 + random.nextDouble() * 0.3)));
			Vec3 v = dir.scale(0.05).subtract(getDeltaMovement().scale(0.2));
			level().addParticle(random.nextInt(3) == 0 ? ModParticles.RED_SPARK : random.nextBoolean() ? ModParticles.PURPLE_SPARK : ModParticles.BLUE_SPARK,
					at.x, at.y, at.z, v.x, v.y, v.z);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double d) {
		return d < 256 * 256;
	}
}
