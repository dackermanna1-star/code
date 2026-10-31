package com.jjkshowdown.combat;

import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Shared radial blast: damage with falloff, knockback, crater, shockwave visuals and screen shake. */
public final class Blast {
	private Blast() {
	}

	public static final class Spec {
		public float radius = 4f;
		public float damage = 10f;
		public ResourceKey<DamageType> type;
		public double knockback = 1.5;
		public double lift = 0.5;
		public float craterRadius = 0f;
		public float maxHardness = 6f;
		public float debrisChance = 0.25f;
		public ParticleOptions core = ModParticles.IMPACT_FLASH;
		public ParticleOptions spark = ModParticles.RED_SPARK;
		@Nullable
		public SoundEvent sound;
		public float shake = 0.6f;
		public int flashColor = 0xFFFFFF;
		public int igniteSeconds = 0;
		public boolean multiHit = true;
	}

	public static void detonate(ServerLevel level, @Nullable LivingEntity owner, @Nullable Entity direct, Vec3 center, Spec s) {
		Entity filterBase = owner != null ? owner : direct;
		for (LivingEntity t : filterBase != null ? Targeting.livingInRadius(filterBase, center, s.radius + 1.0)
				: level.getEntitiesOfClass(LivingEntity.class, new net.minecraft.world.phys.AABB(center, center).inflate(s.radius + 1))) {
			double d = t.getBoundingBox().getCenter().distanceTo(center);
			float falloff = (float) Math.max(0.25, 1.0 - d / (s.radius + 1.0));
			boolean hit = TechniqueDamage.hurt(t, s.type, direct, owner, s.damage * falloff, s.multiHit);
			if (hit || !t.isAlive()) {
				TechniqueDamage.knockAway(t, center, s.knockback * falloff, s.lift * falloff + 0.15);
				if (s.igniteSeconds > 0) t.igniteForSeconds(s.igniteSeconds);
			}
		}
		if (s.craterRadius > 0) {
			Destruction.carveSphere(level, center, s.craterRadius, owner, s.maxHardness, s.debrisChance, null);
		}
		Fx.particles(level, s.core, center, 3, 0.2, 0.0);
		Fx.particles(level, ModParticles.SHOCKWAVE, center, 1, 0, 0);
		Fx.burst(level, s.spark, center, (int) (30 + s.radius * 10), 0.6 + s.radius * 0.08);
		Fx.particles(level, ParticleTypes.EXPLOSION_EMITTER, center, 1, 0, 0);
		Fx.ring(level, ParticleTypes.CLOUD, center.add(0, 0.2, 0), s.radius * 0.6, 24, 0.35);
		if (s.sound != null) Fx.sound(level, center, s.sound, 2.5f, 0.9f + level.getRandom().nextFloat() * 0.2f);
		JjkNetwork.shakeAround(level, center, s.radius * 6 + 12, s.shake, 14);
		JjkNetwork.flashAround(level, center, s.radius * 4 + 8, 0.35f, 6, s.flashColor);
	}
}
