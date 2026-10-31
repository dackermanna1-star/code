package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.Blast;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.ParticleDensity;
import com.jjkshowdown.world.Destruction;
import com.jjkshowdown.world.TerrainJournal;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** Divine Flame "Open" (Fuga) — a flaming arrow that erupts into an inferno. */
public class FugaEntity extends TechniqueProjectile {
	public FugaEntity(EntityType<? extends FugaEntity> type, Level level) {
		super(type, level);
		this.maxLife = 60;
	}

	public static FugaEntity create(ServerLevel level, LivingEntity owner, float damage, boolean empowered) {
		FugaEntity f = new FugaEntity(ModEntities.FUGA, level);
		f.setOwner(owner);
		f.damage = damage;
		f.setCharge(empowered ? 1f : 0f);
		f.setScale(empowered ? 1.6f : 1.0f);
		return f;
	}

	@Override
	protected double gravity() {
		return 0.012;
	}

	@Override
	protected void onTechniqueHitEntity(ServerLevel level, LivingEntity target) {
		explode(level, target.getBoundingBox().getCenter());
	}

	@Override
	protected boolean onTechniqueHitBlock(ServerLevel level, BlockHitResult hit) {
		explode(level, hit.getLocation());
		return true;
	}

	@Override
	protected void onExpire(ServerLevel level) {
		explode(level, position());
	}

	private void explode(ServerLevel level, Vec3 at) {
		if (dead) return;
		dead = true;
		boolean empowered = charge() > 0.5f;
		Blast.Spec s = new Blast.Spec();
		s.radius = empowered ? 9f : 6f;
		s.damage = damage;
		s.type = ModDamageTypes.FUGA;
		s.knockback = 1.6;
		s.lift = 0.8;
		s.craterRadius = empowered ? 4.5f : 3f;
		s.maxHardness = 10f;
		s.core = ModParticles.IMPACT_FLASH;
		s.spark = ModParticles.FUGA_FLAME;
		s.sound = ModSounds.FUGA_EXPLODE;
		s.shake = empowered ? 1.4f : 1.0f;
		s.flashColor = 0xFF9030;
		s.igniteSeconds = 8;
		Blast.detonate(level, ownerLiving(), this, at, s);
		Fx.burst(level, ParticleTypes.FLAME, at, 120, 0.8);
		Fx.burst(level, ParticleTypes.LAVA, at, 30, 0.6);
		Fx.particles(level, ParticleTypes.LARGE_SMOKE, at, 40, 2.0, 0.08);
		if (JjkConfig.get().destruction.fuGaPlacesFire && Destruction.enabledFor(level, ownerLiving())) {
			int r = (int) s.radius;
			BlockPos c = BlockPos.containing(at);
			for (int i = 0; i < 40; i++) {
				BlockPos p = c.offset(random.nextInt(r * 2 + 1) - r, random.nextInt(5) - 2, random.nextInt(r * 2 + 1) - r);
				if (level.getBlockState(p).isAir() && BaseFireBlock.canBePlacedAt(level, p, net.minecraft.core.Direction.UP)) {
					TerrainJournal.get(level).replace(level, p, BaseFireBlock.getState(level, p), level.getGameTime() + 200, null);
				}
			}
		}
		discard();
	}

	@Override
	protected void clientTick() {
		Vec3 p = position();
		int n = ParticleDensity.scale(4);
		for (int i = 0; i < n; i++) {
			level().addParticle(i % 2 == 0 ? ModParticles.FUGA_FLAME : ParticleTypes.FLAME, p.x + (random.nextDouble() - 0.5) * 0.3,
					p.y + (random.nextDouble() - 0.5) * 0.3, p.z + (random.nextDouble() - 0.5) * 0.3,
					-getDeltaMovement().x * 0.1, -getDeltaMovement().y * 0.1 + 0.02, -getDeltaMovement().z * 0.1);
		}
	}
}
