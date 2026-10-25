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
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * A miniature star. Variant 0 is a bow shot, 1 a meteor of a shower, 2 the gigantic falling star of
 * Celestial Judgment. All detonate in stellar explosions scaled by their size.
 */
public class StarBoltEntity extends GfProjectile {
	public static final int SHOT = 0;
	public static final int METEOR = 1;
	public static final int JUDGMENT = 2;
	private float damage = 20.0F;
	private boolean exploded;

	public StarBoltEntity(EntityType<? extends StarBoltEntity> type, Level level) {
		super(type, level);
		this.maxAge = 20 * 20;
	}

	public void configure(int variant, float size, float damage, boolean terrain) {
		this.setVariant(variant);
		this.setSize(size);
		this.damage = damage;
		this.terrain = terrain;
		this.gravity = variant == SHOT ? 0.012 : 0.0;
	}

	@Override
	protected double hitInflate() {
		return this.variant() == JUDGMENT ? this.size() * 0.5 : 0.3;
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

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		if (this.variant() == JUDGMENT && this.age % 10 == 0) {
			Fx.sound(level, start, ModSounds.ASTEROID_INCOMING, 14.0F, 1.4F);
			Fx.skyFlash(level, start, 2, 384);
		}
		return super.serverMove(level, start, end);
	}

	private void explode(ServerLevel level, Vec3 at) {
		if (this.exploded) {
			return;
		}
		this.exploded = true;
		Entity owner = this.getOwner();
		int variant = this.variant();
		float size = this.size();
		float radius = switch (variant) {
			case JUDGMENT -> size;
			case METEOR -> 2.5F + size * 1.4F;
			default -> 1.6F + size * 1.6F;
		};
		DamageSource source = ModDamageTypes.source(level, WeaponType.STARFALL_BOW, this, owner);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at));
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(at), radius)
				.vertical(variant == JUDGMENT ? 0.5 : 0.75)
				.noise(0.2)
				.lining(Palette.GLASSED, variant == JUDGMENT ? 2.5 : 1.0)
				.fire(variant == JUDGMENT ? 0.5F : 0.25F)
				.submit();
			if (variant == JUDGMENT) {
				Impacts.debris(level, at, radius * 0.7, 60, 1.6, 1.8);
				DestructionManager.submit(new SurfaceJob(level, BlockPos.containing(at), radius * 2.2, 3, (int) radius, 0.2F, 0.2,
					(state, pos, layer) -> Palette.scorchSurface(state, pos, 31337L, layer == 0)).delayed(6));
			}
		}
		int color = WeaponType.STARFALL_BOW.color();
		if (variant == JUDGMENT) {
			Combat.sphere(level, source, owner, at, radius * 2.2, this.damage * 8.0F, 0.9, 4.0, 1.8);
			Impacts.shockwaves(level, at, 5, radius * 4.0, 5, 0xFFF2B0, this.damage * 2.0F, source, owner);
			Fx.send(level, FxType.STAR_BURST, at, Vec3.ZERO, radius, 1.0F, 0xFFF6D0, 768);
			Fx.flash(level, at, 0xFFF6E0, 1.0F, 40, radius * 14);
			Fx.shake(level, at, 3.0F, 90, radius * 14);
			Fx.skyFlash(level, at, 8, radius * 16);
			Fx.sound(level, at, ModSounds.STARFALL_JUDGMENT, 24.0F, 0.8F);
			Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 24.0F, 0.4F);
		} else {
			Combat.sphere(level, source, owner, at, radius * 1.6, this.damage, 1.0, 1.2, 0.6);
			Fx.send(level, FxType.STAR_BURST, at, Vec3.ZERO, radius, 0.0F, color, 256);
			Fx.sound(level, at, ModSounds.STAR_IMPACT, 3.0F + radius, 0.9F + this.random.nextFloat() * 0.3F);
			if (variant == METEOR) {
				Fx.shake(level, at, 0.35F, 10, 48);
			}
		}
		for (Entity e : level.getEntities(this, this.getBoundingBox().inflate(radius), e -> e instanceof LivingEntity)) {
			if (Combat.canAffect(level, owner, e)) {
				e.igniteForSeconds(4.0F);
			}
		}
		this.discard();
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		int variant = this.variant();
		float size = this.size();
		Vec3 back = start.subtract(end);
		double len = back.length();
		if (len < 1.0E-4) {
			return;
		}
		back = back.normalize();
		int count = variant == JUDGMENT ? 40 : (variant == METEOR ? 6 : 4);
		for (int i = 0; i < count; i++) {
			double t = this.random.nextDouble() * Math.max(len, size * 2.0);
			double spread = variant == JUDGMENT ? size * 0.4 : 0.15 + size * 0.1;
			Vec3 p = start.add(back.scale(t)).add((this.random.nextDouble() - 0.5) * spread, (this.random.nextDouble() - 0.5) * spread, (this.random.nextDouble() - 0.5) * spread);
			int color = this.random.nextInt(3) == 0 ? 0x8FD0FF : (this.random.nextBoolean() ? 0xFFF6C8 : 0xFFD24A);
			level.addParticle(
				FxParticleOptions.of(i % 4 == 0 ? ModParticles.STAR : ModParticles.GLOW, color, 0x3A5BFF, (variant == JUDGMENT ? 0.6F : 0.12F) + size * 0.05F,
					16 + this.random.nextInt(14), 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, 0, 0, 0
			);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 768.0 * 768.0;
	}
}
