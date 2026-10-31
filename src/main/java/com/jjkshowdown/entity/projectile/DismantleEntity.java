package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.ParticleDensity;
import com.jjkshowdown.world.Destruction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Dismantle — Sukuna's standard slash. A razor-thin, nearly invisible blade of cursed energy that cuts through
 * soft terrain and anything standing in its way.
 */
public class DismantleEntity extends TechniqueProjectile {
	private float cutHardness = 2.0f;

	public DismantleEntity(EntityType<? extends DismantleEntity> type, Level level) {
		super(type, level);
		this.maxLife = 13;
		this.pierce = 3;
	}

	public static DismantleEntity create(ServerLevel level, LivingEntity owner, float width, float damage, float roll, float cutHardness) {
		DismantleEntity d = new DismantleEntity(ModEntities.DISMANTLE, level);
		d.setOwner(owner);
		d.setScale(width);
		d.setRoll(roll);
		d.damage = damage;
		d.cutHardness = cutHardness;
		return d;
	}

	@Override
	protected boolean collidesWithBlocks() {
		return false;
	}

	@Override
	protected double hitInflate() {
		return scale() * 0.5;
	}

	/** Blade edge direction in world space (perpendicular to travel, rotated by roll). */
	public Vec3 edge() {
		Vec3 f = getDeltaMovement().lengthSqr() > 1.0E-6 ? getDeltaMovement().normalize() : getLookAngle();
		Vec3 side = f.cross(new Vec3(0, 1, 0));
		if (side.lengthSqr() < 1.0E-4) side = new Vec3(1, 0, 0);
		side = side.normalize();
		Vec3 up = side.cross(f).normalize();
		double a = Math.toRadians(roll());
		return side.scale(Math.cos(a)).add(up.scale(Math.sin(a)));
	}

	@Override
	protected void onTechniqueHitEntity(ServerLevel level, LivingEntity target) {
		TechniqueDamage.hurt(target, ModDamageTypes.DISMANTLE, this, ownerLiving(), damage, true);
		Vec3 c = target.getBoundingBox().getCenter();
		Fx.particles(level, ModParticles.SLASH, c, 2, 0.3, 0.0);
		Fx.particles(level, ModParticles.BLOOD, c, 6, 0.3, 0.15);
		Fx.sound(level, c, ModSounds.SHRINE_SLASH, 0.8f, 1.2f + random.nextFloat() * 0.3f);
	}

	@Override
	protected void serverTick(ServerLevel level, Vec3 from, Vec3 to) {
		Vec3 move = to.subtract(from);
		if (move.lengthSqr() < 1.0E-6) return;
		// Stop at terrain that is too hard to cut.
		BlockPos ahead = BlockPos.containing(to);
		var state = level.getBlockState(ahead);
		if (!state.isAir() && !state.getCollisionShape(level, ahead).isEmpty()) {
			float h = state.getDestroySpeed(level, ahead);
			if (h < 0 || h > cutHardness || !Destruction.enabledFor(level, ownerLiving())) {
				Fx.particles(level, ParticleTypes.CRIT, to, 12, 0.3, 0.3);
				Fx.particles(level, ModParticles.SLASH, to, 1, 0, 0);
				Fx.sound(level, to, ModSounds.SHRINE_SLASH, 0.7f, 0.7f);
				discard();
				return;
			}
		}
		Destruction.cutPlane(level, from, move, edge(), move.length(), scale() * 0.5, 0.2, ownerLiving(), cutHardness, 0.08f);
	}

	@Override
	protected void clientTick() {
		if (random.nextFloat() < 0.6f * ParticleDensity.factor) {
			Vec3 p = position();
			Vec3 e = edge().scale((random.nextDouble() - 0.5) * scale());
			level().addParticle(ParticleTypes.CRIT, p.x + e.x, p.y + e.y, p.z + e.z, 0, 0, 0);
		}
	}
}
