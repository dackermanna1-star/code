package com.godforge.entity;

import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.SurfaceJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.Loaded;
import com.godforge.util.Scheduler;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The Planet Cracker's siege round. On impact: a colossal detonation, a vast crater, a ring of secondary
 * blasts around the rim and concentric shockwaves rolling outward across the landscape.
 */
public class CrackerShellEntity extends GfProjectile {
	private float damage = 70.0F;
	private boolean exploded;

	public CrackerShellEntity(EntityType<? extends CrackerShellEntity> type, Level level) {
		super(type, level);
		this.maxAge = 140;
		this.gravity = 0.015;
	}

	/** @param size crater radius in blocks */
	public void configure(float size, float charge, float damage, boolean terrain) {
		this.setSize(size);
		this.setCharge(charge);
		this.damage = damage;
		this.terrain = terrain;
	}

	@Override
	protected double hitInflate() {
		return 0.6;
	}

	@Override
	protected void onHitEntity(EntityHitResult hit) {
		if (this.level() instanceof ServerLevel level) {
			this.explode(level, hit.getLocation());
		}
	}

	@Override
	protected void onHitBlock(BlockHitResult hit) {
		if (this.level() instanceof ServerLevel level) {
			this.explode(level, hit.getLocation());
		}
	}

	@Override
	protected void onExpire(ServerLevel level) {
		this.explode(level, this.position());
	}

	private void explode(ServerLevel level, Vec3 at) {
		if (this.exploded) {
			return;
		}
		this.exploded = true;
		Entity owner = this.getOwner();
		float radius = this.size();
		float charge = this.charge();
		int color = WeaponType.PLANET_CRACKER.color();
		DamageSource source = ModDamageTypes.source(level, WeaponType.PLANET_CRACKER, this, owner);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at));
		if (terrain) {
			Impacts.debris(level, at, radius * 0.8, (int) (radius * 3), 1.0 + radius * 0.03, 1.2);
			CraterJob.builder(level, BlockPos.containing(at), radius).vertical(0.6).noise(0.22).lining(Palette.SCORCHED, 2.0).fire(0.35F).submit();
			DestructionManager.submit(new SurfaceJob(level, BlockPos.containing(at), radius * 2.6, 2, (int) radius + 6, 0.08F, 0.2,
				(state, pos, layer) -> Palette.scorchSurface(state, pos, 7777L, false)).delayed(8));
			// secondary detonations ripple around the rim
			RandomSource random = this.random;
			int secondaries = 4 + (int) (radius * 0.6);
			for (int i = 0; i < secondaries; i++) {
				double angle = Math.PI * 2 * i / secondaries + random.nextDouble() * 0.4;
				double dist = radius * (1.1 + random.nextDouble() * 0.6);
				int x = (int) Math.floor(at.x + Math.cos(angle) * dist);
				int z = (int) Math.floor(at.z + Math.sin(angle) * dist);
				int delay = 6 + i * 2;
				Scheduler.later(level, delay, () -> {
					if (Loaded.chunk(level, x, z) == null) {
						return;
					}
					Vec3 p = new Vec3(x + 0.5, level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z), z + 0.5);
					CraterJob.builder(level, BlockPos.containing(p), 2.5 + random.nextDouble() * 2.5).vertical(0.8).lining(Palette.SCORCHED, 1.0).fire(0.4F).submit();
					Fx.send(level, FxType.EXPLOSION, p, Vec3.ZERO, 4.0F, 0.0F, color, 256);
					Fx.sound(level, p, ModSounds.BIG_EXPLOSION, 4.0F, 0.9F + random.nextFloat() * 0.3F);
				});
			}
		}
		Combat.sphere(level, source, owner, at, radius * 1.7, this.damage * (0.5F + charge * 0.5F), 1.0, 3.0, 1.4);
		Impacts.shockwaves(level, at, 4, radius * 4.5, 6, color, this.damage * 0.35F, source, owner);
		Impacts.blastFx(level, at, radius, color, 0.85F, 2.0F);
		Fx.skyFlash(level, at, 4, radius * 14);
		Fx.sound(level, at, ModSounds.CRACKER_IMPACT, 16.0F + radius, 0.8F);
		Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 16.0F + radius, 0.5F);
		this.discard();
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		for (int i = 0; i < 8; i++) {
			Vec3 p = start.add(end.subtract(start).scale(this.random.nextDouble()));
			level.addParticle(
				FxParticleOptions.of(i % 2 == 0 ? ModParticles.GLOW : ModParticles.SPARK, i % 3 == 0 ? 0xD2FFE0 : 0x3DFF7A, 0x0A6B2A, 0.25F, 16, 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x + (this.random.nextDouble() - 0.5) * 0.4, p.y + (this.random.nextDouble() - 0.5) * 0.4, p.z + (this.random.nextDouble() - 0.5) * 0.4, 0, 0, 0
			);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 640.0 * 640.0;
	}
}
