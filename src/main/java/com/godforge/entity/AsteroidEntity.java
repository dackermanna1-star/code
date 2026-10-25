package com.godforge.entity;

import com.godforge.destruction.BlockOps;
import com.godforge.destruction.CraterJob;
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
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * A summoned asteroid. It falls from high above the marked location, accelerating as it comes, and
 * detonates into a molten crater with shockwaves, ejecta, fire and a smoking meteorite core.
 * Size (synced) is the rock's radius; the crater is far larger.
 */
public class AsteroidEntity extends GfProjectile {
	private Vec3 target = Vec3.ZERO;
	private float craterRadius = 10.0F;
	private float damage = 60.0F;
	private boolean impacted;

	public AsteroidEntity(EntityType<? extends AsteroidEntity> type, Level level) {
		super(type, level);
		this.maxAge = 20 * 30;
	}

	/** variant 1 = planetfall (ultimate), 2 = fragment. */
	public void configure(Vec3 target, float rockRadius, float craterRadius, float damage, int variant, boolean terrain) {
		this.target = target;
		this.setSize(rockRadius);
		this.craterRadius = craterRadius;
		this.damage = damage;
		this.setVariant(variant);
		this.terrain = terrain;
	}

	/** Places the asteroid high above the target so it descends at a steep, visible angle. */
	public void launchTowards(Vec3 target, Vec3 approachFrom, double height, double initialSpeed) {
		Vec3 flat = new Vec3(approachFrom.x, 0, approachFrom.z);
		flat = flat.lengthSqr() < 1.0E-4 ? new Vec3(1, 0, 0) : flat.normalize();
		// come in at a slant from beyond the target, but start inside ticking chunks or it would hang in the sky
		double offset = height * 0.55;
		Vec3 start = target.add(flat.scale(offset)).add(0, height, 0);
		if (this.level() instanceof ServerLevel server) {
			while (offset > 1.0 && !server.isPositionEntityTicking(BlockPos.containing(start))) {
				offset *= 0.5;
				start = target.add(flat.scale(offset)).add(0, height, 0);
			}
		}
		this.setPos(start);
		this.setDeltaMovement(target.subtract(start).normalize().scale(initialSpeed));
	}

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		// accelerate like something truly falling from orbit
		Vec3 motion = this.getDeltaMovement();
		double speed = Math.min(7.0, motion.length() * 1.035 + 0.04);
		Vec3 toTarget = this.target.subtract(start);
		Vec3 dir = toTarget.lengthSqr() > 1.0 ? toTarget.normalize() : motion.normalize();
		motion = motion.normalize().scale(0.85).add(dir.scale(0.15)).normalize().scale(speed);
		this.setDeltaMovement(motion);
		end = start.add(motion);
		if (this.age % 10 == 0) {
			Fx.sound(level, start, ModSounds.ASTEROID_INCOMING, 10.0F + this.size(), 0.6F + 0.4F / Math.max(1.0F, this.size() * 0.3F));
		}
		BlockHitResult hit = Loaded.clip(level, start, end.add(motion.normalize().scale(this.size() * 0.5)), ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY, this);
		if (hit.getType() != HitResult.Type.MISS || end.y <= this.target.y + 0.5) {
			Vec3 at = hit.getType() != HitResult.Type.MISS ? hit.getLocation() : new Vec3(end.x, this.target.y, end.z);
			this.impact(level, at);
			return at;
		}
		return end;
	}

	@Override
	protected void onExpire(ServerLevel level) {
		if (!this.impacted) {
			this.impact(level, this.position());
		}
	}

	private void impact(ServerLevel level, Vec3 at) {
		if (this.impacted) {
			return;
		}
		this.impacted = true;
		Entity owner = this.getOwner();
		float crater = this.craterRadius;
		boolean planetfall = this.variant() == 1;
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at));
		DamageSource source = ModDamageTypes.source(level, WeaponType.ASTEROID_GUN, this, owner);
		int color = 0xFF8A1F;

		if (terrain) {
			Impacts.debris(level, at, crater * 0.8, (int) (crater * 3), 0.6 + crater * 0.04, 0.9 + crater * 0.03);
			CraterJob.builder(level, BlockPos.containing(at), crater)
				.vertical(0.55)
				.noise(0.24)
				.lining(planetfall ? Palette.MOLTEN : Palette.SCORCHED, 2.4)
				.fire(0.45F)
				.submit();
			// scorched blast zone around the crater
			com.godforge.destruction.DestructionManager.submit(
				new SurfaceJob(level, BlockPos.containing(at), crater * 2.1, 2, (int) (crater * 0.8) + 6, 0.06F, 0.25, (state, pos, layer) -> Palette.scorchSurface(state, pos, 977L, false))
					.delayed(4)
			);
			float core = Math.max(1.5F, this.size() * 0.55F);
			Vec3 coreAt = at.add(0, -crater * 0.55 * 0.6, 0);
			Scheduler.later(level, 30 + (int) crater, () -> placeCore(level, coreAt, core, level.getRandom()));
		}
		Combat.sphere(level, source, owner, at, crater * 1.9, this.damage, 1.1, 2.5, 1.4);
		Impacts.shockwaves(level, at, planetfall ? 5 : 3, crater * (planetfall ? 4.0 : 3.0), 5, color, this.damage * 0.4F, source, owner);
		Impacts.blastFx(level, at, crater, color, planetfall ? 1.0F : 0.7F, planetfall ? 2.5F : 1.4F);
		Fx.skyFlash(level, at, planetfall ? 6 : 3, crater * 16);
		Fx.sound(level, at, ModSounds.ASTEROID_IMPACT, 16.0F + crater, planetfall ? 0.55F : 0.75F);
		Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 12.0F + crater, 0.5F);
		this.discard();
	}

	/** Leaves a smouldering meteorite remnant at the bottom of the crater. */
	private static void placeCore(ServerLevel level, Vec3 center, float radius, RandomSource random) {
		BlockPos c = BlockPos.containing(center);
		int r = Mth.ceil(radius);
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int x = -r; x <= r; x++) {
			for (int y = -r; y <= r; y++) {
				for (int z = -r; z <= r; z++) {
					double d = Math.sqrt(x * x + y * y * 1.6 + z * z);
					if (d > radius + random.nextFloat() * 0.6F) {
						continue;
					}
					pos.set(c.getX() + x, c.getY() + y, c.getZ() + z);
					BlockState current = Loaded.state(level, pos);
					if (current == null || BlockOps.isProtected(level, pos, current)) {
						continue;
					}
					float roll = random.nextFloat();
					BlockState state;
					if (d < radius * 0.35F) {
						state = roll < 0.12F ? Blocks.ANCIENT_DEBRIS.defaultBlockState() : (roll < 0.3F ? Blocks.RAW_IRON_BLOCK.defaultBlockState() : Blocks.MAGMA_BLOCK.defaultBlockState());
					} else {
						state = roll < 0.4F ? Blocks.BLACKSTONE.defaultBlockState() : (roll < 0.7F ? Blocks.MAGMA_BLOCK.defaultBlockState() : Blocks.OBSIDIAN.defaultBlockState());
					}
					BlockOps.set(level, pos, state);
				}
			}
		}
		Fx.particles(level, FxParticleOptions.of(ModParticles.SMOKE, 0x3A302A, 0x1A1614, 1.4F, 80, -0.04F, 0), center, 30, radius, 0.02);
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		float size = this.size();
		Vec3 back = start.subtract(end).normalize();
		int count = 6 + (int) (size * 3);
		for (int i = 0; i < count; i++) {
			Vec3 p = start.add(back.scale(this.random.nextDouble() * size * 2.0))
				.add((this.random.nextDouble() - 0.5) * size, (this.random.nextDouble() - 0.5) * size, (this.random.nextDouble() - 0.5) * size);
			level.addParticle(
				FxParticleOptions.of(ModParticles.PLASMA, i % 3 == 0 ? 0xFFF2B0 : 0xFF7A1A, 0x8A1A05, 0.5F + size * 0.25F, 14 + this.random.nextInt(10), 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, back.x * 0.2, back.y * 0.2, back.z * 0.2
			);
			if (i % 2 == 0) {
				Vec3 s = start.add(back.scale(size * (1.5 + this.random.nextDouble() * 4.0)));
				level.addParticle(
					FxParticleOptions.of(ModParticles.SMOKE, 0x4A4038, 0x1E1A18, 0.8F + size * 0.4F, 60 + this.random.nextInt(40), -0.01F, FxParticleOptions.F_GROW | FxParticleOptions.F_NO_PHYSICS),
					s.x + (this.random.nextDouble() - 0.5) * size, s.y + (this.random.nextDouble() - 0.5) * size, s.z + (this.random.nextDouble() - 0.5) * size,
					0, 0.01, 0
				);
			}
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 768.0 * 768.0;
	}
}
