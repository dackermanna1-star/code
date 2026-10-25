package com.godforge.entity;

import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.PathJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The Orb Eraser's rainbow singularity. It never stops for terrain: everything within its radius is
 * erased as it tears across the landscape at up to thousands of blocks per second, then it ends in a
 * prismatic nova.
 */
public class PrismOrbEntity extends GfProjectile {
	private final Set<UUID> hit = new HashSet<>();
	private PathJob path;
	private double traveled;
	private double maxRange = 512.0;
	private float damage = 60.0F;

	public PrismOrbEntity(EntityType<? extends PrismOrbEntity> type, Level level) {
		super(type, level);
		this.maxAge = 400;
	}

	/** variant 1 = prismatic annihilation (ultimate). */
	public void configure(float radius, float charge, float damage, double maxRange, boolean ultimate, boolean terrain) {
		this.setSize(radius);
		this.setCharge(charge);
		this.setVariant(ultimate ? 1 : 0);
		this.damage = damage;
		this.maxRange = maxRange;
		this.terrain = terrain;
	}

	public boolean ultimate() {
		return this.variant() == 1;
	}

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		float radius = this.size();
		Entity owner = this.getOwner();
		boolean detonate = false;
		Vec3 stop = end;
		// stay inside loaded, ticking terrain and the world border
		BlockPos endPos = BlockPos.containing(end);
		if (!level.isPositionEntityTicking(endPos) || !level.getWorldBorder().isWithinBounds(endPos) || end.y < level.getMinY() - 32 || end.y > level.getMaxY() + 64) {
			detonate = true;
			stop = this.findLastLoaded(level, start, end);
		}
		double step = stop.distanceTo(start);
		if (this.traveled + step >= this.maxRange) {
			double allowed = Math.max(0.0, this.maxRange - this.traveled);
			stop = start.add(end.subtract(start).normalize().scale(allowed));
			detonate = true;
		}
		this.traveled += stop.distanceTo(start);

		if (this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(stop))) {
			if (this.path == null) {
				this.path = new PathJob(level, this.random.nextLong());
				if (!DestructionManager.submit(this.path)) {
					this.path = null;
					this.terrain = false;
				}
			}
			if (this.path != null) {
				this.path.add(start, stop, radius, Palette.NONE);
			}
		}

		DamageSource source = ModDamageTypes.source(level, WeaponType.ORB_ERASER, this, owner);
		Vec3 dir = stop.subtract(start);
		double len = dir.length();
		Vec3 norm = len > 1.0E-6 ? dir.scale(1.0 / len) : new Vec3(0, 0, 1);
		AABB box = new AABB(start, stop).inflate(radius + 1.0);
		for (Entity e : level.getEntities(this, box, e -> e.isAlive() && !(e instanceof EffectEntity) && !this.hit.contains(e.getUUID()))) {
			Vec3 c = e.getBoundingBox().getCenter();
			double t = len > 1.0E-6 ? Mth.clamp(c.subtract(start).dot(norm), 0.0, len) : 0.0;
			if (c.distanceTo(start.add(norm.scale(t))) > radius + e.getBbWidth() * 0.5) {
				continue;
			}
			if (!Combat.canAffect(level, owner, e)) {
				continue;
			}
			this.hit.add(e.getUUID());
			if (e instanceof LivingEntity living) {
				living.invulnerableTime = 0;
			}
			Combat.hurt(level, e, source, this.damage * (this.ultimate() ? 3.0F : 1.0F) * (0.5F + this.charge()));
			Combat.launch(e, norm.scale(2.5).add(0, 0.8, 0));
		}
		if (this.age % 2 == 0) {
			Fx.sound(level, stop, ModSounds.ORB_TRAVEL, 4.0F + radius * 0.5F, 0.8F + this.random.nextFloat() * 0.3F);
		}
		if (detonate) {
			this.detonate(level, stop);
		}
		return stop;
	}

	private Vec3 findLastLoaded(ServerLevel level, Vec3 start, Vec3 end) {
		Vec3 dir = end.subtract(start);
		double len = dir.length();
		Vec3 last = start;
		for (double t = 0; t <= len; t += 8.0) {
			Vec3 p = start.add(dir.scale(t / Math.max(1.0E-6, len)));
			BlockPos bp = BlockPos.containing(p);
			if (!level.isPositionEntityTicking(bp) || !level.getWorldBorder().isWithinBounds(bp)) {
				break;
			}
			last = p;
		}
		return last;
	}

	private void detonate(ServerLevel level, Vec3 at) {
		float radius = this.size();
		boolean ultimate = this.ultimate();
		float blast = radius * (ultimate ? 2.6F : 1.7F);
		Entity owner = this.getOwner();
		if (this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at))) {
			CraterJob.builder(level, BlockPos.containing(at), blast).vertical(0.85).noise(0.22).lining(ultimate ? Palette.DIMENSIONAL : Palette.NONE, 1.2).submit(2);
		}
		Combat.sphere(level, ModDamageTypes.source(level, WeaponType.ORB_ERASER, this, owner), owner, at, blast * 1.5, this.damage * (ultimate ? 2.0F : 1.0F), 1.0, 3.0, 1.0);
		Fx.send(level, FxType.NOVA, at, Vec3.ZERO, blast, ultimate ? 1.0F : 0.0F, 0xFFFFFF, 512);
		Fx.flash(level, at, 0xFFFFFF, ultimate ? 0.9F : 0.5F, ultimate ? 24 : 12, blast * 8);
		Fx.shake(level, at, ultimate ? 1.6F : 0.8F, ultimate ? 50 : 25, blast * 8);
		Fx.sound(level, at, ModSounds.ORB_IMPACT, ultimate ? 16.0F : 8.0F, ultimate ? 0.7F : 1.0F);
		this.discard();
	}

	@Override
	protected void onExpire(ServerLevel level) {
		this.detonate(level, this.position());
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		if (this.path != null) {
			this.path.seal();
		}
		super.onRemoval(reason);
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		float radius = this.size();
		Vec3 dir = end.subtract(start);
		double len = dir.length();
		int count = (int) Mth.clamp(len * 1.5, 6, 160);
		float hue0 = (this.age * 0.03F) % 1.0F;
		for (int i = 0; i < count; i++) {
			double t = this.random.nextDouble();
			Vec3 p = start.add(dir.scale(t));
			double ox = (this.random.nextDouble() - 0.5) * radius * 2.2;
			double oy = (this.random.nextDouble() - 0.5) * radius * 2.2;
			double oz = (this.random.nextDouble() - 0.5) * radius * 2.2;
			int color = Mth.hsvToRgb((hue0 + (float) t * 0.5F + this.random.nextFloat() * 0.2F) % 1.0F, 0.8F, 1.0F);
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, color, 0xFFFFFF, 0.3F + radius * 0.08F, 20 + this.random.nextInt(20), 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS | FxParticleOptions.F_RAINBOW),
				p.x + ox, p.y + oy, p.z + oz, 0, 0, 0
			);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 1024.0 * 1024.0;
	}
}
