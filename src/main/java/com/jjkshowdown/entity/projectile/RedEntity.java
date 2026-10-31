package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.Blast;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.util.ParticleDensity;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** Reversal: Red — a repulsive orb that detonates into a massive outward blast. */
public class RedEntity extends TechniqueProjectile {
	public RedEntity(EntityType<? extends RedEntity> type, Level level) {
		super(type, level);
		this.maxLife = 26;
	}

	public static RedEntity create(ServerLevel level, LivingEntity owner, float charge, float damage) {
		RedEntity r = new RedEntity(ModEntities.RED, level);
		r.setOwner(owner);
		r.setCharge(charge);
		r.setScale(0.5f + charge * 0.6f);
		r.damage = damage;
		return r;
	}

	@Override
	protected void onTechniqueHitEntity(ServerLevel level, LivingEntity target) {
		detonate(level, target.getBoundingBox().getCenter());
	}

	@Override
	protected boolean onTechniqueHitBlock(ServerLevel level, BlockHitResult hit) {
		detonate(level, hit.getLocation());
		return true;
	}

	@Override
	protected void onExpire(ServerLevel level) {
		detonate(level, position());
	}

	public void detonate(ServerLevel level, Vec3 at) {
		if (dead) return;
		dead = true;
		Blast.Spec s = new Blast.Spec();
		float c = charge();
		s.radius = 3.5f + 3.0f * c;
		s.damage = damage;
		s.type = ModDamageTypes.RED;
		s.knockback = 2.4 + 2.2 * c;
		s.lift = 0.7 + 0.4 * c;
		s.craterRadius = 1.6f + 2.4f * c;
		s.maxHardness = 6f + 20f * c;
		s.debrisChance = 0.35f;
		s.core = ModParticles.IMPACT_FLASH;
		s.spark = ModParticles.RED_SPARK;
		s.sound = ModSounds.RED_IMPACT;
		s.shake = 0.7f + 0.6f * c;
		s.flashColor = 0xFF5040;
		Blast.detonate(level, ownerLiving(), this, at, s);
		discard();
	}

	@Override
	protected void clientTick() {
		Vec3 p = position();
		int n = ParticleDensity.scale(3);
		for (int i = 0; i < n; i++) {
			level().addParticle(ModParticles.RED_SPARK, p.x + (random.nextDouble() - 0.5) * 0.4, p.y + (random.nextDouble() - 0.5) * 0.4,
					p.z + (random.nextDouble() - 0.5) * 0.4, (random.nextDouble() - 0.5) * 0.1, (random.nextDouble() - 0.5) * 0.1, (random.nextDouble() - 0.5) * 0.1);
		}
	}
}
