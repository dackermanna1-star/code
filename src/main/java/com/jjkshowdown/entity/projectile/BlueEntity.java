package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.entity.FlyingDebrisEntity;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.ParticleDensity;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Lapse: Blue — a point of attraction. Pulls entities, projectiles and loose terrain into a crushing singularity.
 * With "Blue movement" the owner himself is pulled toward the point, which Gojo uses for mobility.
 */
public class BlueEntity extends TechniqueProjectile {
	private float pullRadius = 7f;
	private float coreRadius = 1.8f;
	private boolean movement;
	private Vec3 drift = Vec3.ZERO;

	public BlueEntity(EntityType<? extends BlueEntity> type, Level level) {
		super(type, level);
		this.pierce = Integer.MAX_VALUE;
	}

	public static BlueEntity create(ServerLevel level, LivingEntity owner, Vec3 pos, float charge, float damage, boolean movement) {
		BlueEntity b = new BlueEntity(ModEntities.BLUE, level);
		b.setOwner(owner);
		b.setPos(pos.x, pos.y, pos.z);
		b.setCharge(charge);
		b.setScale(0.6f + charge * 0.9f);
		b.damage = damage;
		b.movement = movement;
		b.pullRadius = movement ? 3f : 6.5f + 5f * charge;
		b.coreRadius = 1.6f + 1.6f * charge;
		b.maxLife = movement ? 10 : (int) (45 + 55 * charge);
		return b;
	}

	public void setDrift(Vec3 drift) {
		this.drift = drift;
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
		return 0;
	}

	@Override
	public void tick() {
		// Blue does not use projectile travel; it drifts slowly toward where it was thrown.
		setDeltaMovement(drift);
		drift = drift.scale(0.9);
		super.tick();
	}

	@Override
	protected void serverTick(ServerLevel level, Vec3 from, Vec3 to) {
		LivingEntity owner = ownerLiving();
		Vec3 c = position();
		if (movement) {
			if (owner != null) {
				Vec3 d = c.subtract(owner.position());
				if (d.length() < 1.5) {
					discard();
					return;
				}
				TechniqueDamage.setVelocity(owner, d.normalize().scale(Math.min(2.2, 0.6 + d.length() * 0.25)));
				owner.fallDistance = 0;
			}
			return;
		}
		float t = tickCount / (float) maxLife;
		float strengthBase = 0.14f + 0.16f * charge();
		AABB box = new AABB(c, c).inflate(pullRadius);
		for (Entity e : level.getEntities(this, box, e -> e != owner && !(e instanceof BlueEntity))) {
			Vec3 ec = e.getBoundingBox().getCenter();
			Vec3 d = c.subtract(ec);
			double dist = d.length();
			if (dist > pullRadius || dist < 1.0E-3) continue;
			double falloff = Math.sqrt(1.0 - dist / pullRadius);
			Vec3 dir = d.scale(1.0 / dist);
			if (e instanceof LivingEntity le && Targeting.hostileTo(owner != null ? owner : this).test(le)) {
				Vec3 swirl = dir.cross(new Vec3(0, 1, 0)).scale(0.05);
				Vec3 v = le.getDeltaMovement().scale(0.55).add(dir.scale(strengthBase * (0.4 + falloff) * 1.6)).add(swirl);
				if (dist < coreRadius * 0.6) v = v.scale(0.2);
				TechniqueDamage.setVelocity(le, v);
				le.fallDistance = 0;
				if (dist < coreRadius && tickCount % 4 == 0) {
					TechniqueDamage.hurt(le, ModDamageTypes.BLUE, this, owner, damage, true);
					Fx.particles(level, ModParticles.BLUE_SPARK, ec, 6, 0.3, 0.1);
				}
			} else if (e instanceof Projectile || e instanceof ItemEntity || e instanceof FlyingDebrisEntity) {
				e.setDeltaMovement(e.getDeltaMovement().scale(0.7).add(dir.scale(strengthBase * 1.4)));
				e.hurtMarked = true;
			}
		}
		// rip up the terrain around the singularity
		if (tickCount % 3 == 0 && Destruction.enabledFor(level, owner)) {
			int r = Mth.ceil(coreRadius);
			BlockPos cp = BlockPos.containing(c);
			for (int i = 0; i < 6 + (int) (charge() * 10); i++) {
				BlockPos p = cp.offset(random.nextInt(r * 2 + 1) - r, random.nextInt(r * 2 + 1) - r, random.nextInt(r * 2 + 1) - r);
				if (Vec3.atCenterOf(p).distanceTo(c) > coreRadius + 0.5) continue;
				var state = level.getBlockState(p);
				if (Destruction.destroy(level, p, owner, 5f, 0f, null, null) && random.nextFloat() < 0.6f) {
					FlyingDebrisEntity d = FlyingDebrisEntity.spawn(level, Vec3.atCenterOf(p), state, Vec3.ZERO);
					if (d != null) d.setAttractor(this.getId(), c);
				}
			}
		}
		if (tickCount == maxLife - 1) {
			// collapse: final crushing implosion
			for (LivingEntity le : Targeting.livingInRadius(owner != null ? owner : this, c, coreRadius + 1.5)) {
				TechniqueDamage.hurt(le, ModDamageTypes.BLUE, this, owner, damage * 3, true);
			}
			Fx.burst(level, ModParticles.BLUE_SPARK, c, 60, 0.9);
			Fx.particles(level, ModParticles.IMPACT_FLASH, c, 1, 0, 0);
			Fx.sound(level, c, ModSounds.BLUE_CAST, 1.6f, 0.6f);
		}
		if (tickCount == 1) Fx.sound(level, c, ModSounds.BLUE_CAST, 2.0f, 1.0f);
		if (t > 1) discard();
	}

	@Override
	protected void clientTick() {
		Vec3 c = position();
		int n = ParticleDensity.scale(movement ? 2 : 5 + (int) (charge() * 8));
		float r = (movement ? 2f : 3.5f + charge() * 3.5f);
		for (int i = 0; i < n; i++) {
			double a = random.nextDouble() * Math.PI * 2;
			double y = (random.nextDouble() - 0.5) * r;
			double rr = r * (0.7 + random.nextDouble() * 0.5);
			Vec3 p = c.add(Math.cos(a) * rr, y, Math.sin(a) * rr);
			Vec3 v = c.subtract(p).scale(0.12).add(new Vec3(-Math.sin(a), 0, Math.cos(a)).scale(0.18));
			level().addParticle(ModParticles.BLUE_SPARK, p.x, p.y, p.z, v.x, v.y, v.z);
		}
		if (random.nextFloat() < 0.3f * ParticleDensity.factor) {
			level().addParticle(ParticleTypes.REVERSE_PORTAL, c.x, c.y, c.z, (random.nextDouble() - 0.5) * 0.4, (random.nextDouble() - 0.5) * 0.4, (random.nextDouble() - 0.5) * 0.4);
		}
	}

	public float pullRadius() {
		return pullRadius;
	}
}
