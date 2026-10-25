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
 * A colossal fist of pure kinetic energy. It ploughs forward through terrain, pulverising blocks into
 * flying rubble, launching everything it meets and leaving expanding rings of destruction in its wake.
 */
public class KineticFistEntity extends GfProjectile {
	private final Set<UUID> hit = new HashSet<>();
	private PathJob path;
	private float damage = 24.0F;
	private float launch = 4.0F;

	public KineticFistEntity(EntityType<? extends KineticFistEntity> type, Level level) {
		super(type, level);
		this.maxAge = 30;
	}

	public void configure(float size, float charge, float damage, float launch, int range, boolean terrain) {
		this.setSize(size);
		this.setCharge(charge);
		this.damage = damage;
		this.launch = launch;
		this.terrain = terrain;
		this.maxAge = Math.max(8, range);
	}

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		float size = this.size();
		Entity owner = this.getOwner();
		Vec3 dir = end.subtract(start);
		Vec3 norm = dir.lengthSqr() > 1.0E-6 ? dir.normalize() : new Vec3(0, 0, 1);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(end));
		if (terrain) {
			if (this.age % 2 == 0) {
				Impacts.debris(level, end.add(norm.scale(size)), size * 0.8, 3, 0.9, 0.7);
			}
			if (this.path == null) {
				this.path = new PathJob(level, this.random.nextLong());
				if (!DestructionManager.submit(this.path)) {
					this.path = null;
				}
			}
			if (this.path != null) {
				this.path.add(start, end, size * 0.6, Palette.KINETIC);
			}
		}
		DamageSource source = ModDamageTypes.source(level, WeaponType.GODFIST, this, owner);
		double len = dir.length();
		AABB box = new AABB(start, end).inflate(size + 1.0);
		for (Entity e : level.getEntities(this, box, e -> e.isAlive() && !(e instanceof EffectEntity) && !this.hit.contains(e.getUUID()))) {
			Vec3 c = e.getBoundingBox().getCenter();
			double t = len > 1.0E-6 ? Mth.clamp(c.subtract(start).dot(norm), 0.0, len) : 0.0;
			if (c.distanceTo(start.add(norm.scale(t))) > size * 0.9 + e.getBbWidth() * 0.5) {
				continue;
			}
			if (e == owner) {
				continue;
			}
			this.hit.add(e.getUUID());
			if (Combat.canAffect(level, owner, e)) {
				Combat.hurt(level, e, source, this.damage);
				if (e instanceof LivingEntity) {
					KineticVictims.track(level, e, owner, this.damage * 0.5F, 60);
				}
			}
			Combat.launch(e, norm.scale(this.launch).add(0, 0.9, 0));
		}
		if (this.age % 5 == 0) {
			Fx.send(level, FxType.SHOCKWAVE, new Vec3(end.x, end.y - size * 0.5, end.z), Vec3.ZERO, size * 2.5F, 12.0F, WeaponType.GODFIST.accent(), 160);
		}
		if (this.age % 6 == 0) {
			Fx.sound(level, end, ModSounds.GODFIST_SHOCKWAVE, 3.0F, 1.2F);
		}
		return end;
	}

	@Override
	protected void onExpire(ServerLevel level) {
		Vec3 at = this.position();
		Entity owner = this.getOwner();
		float size = this.size();
		if (this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at))) {
			Impacts.debris(level, at, size * 1.2, 16, 1.2, 1.1);
			CraterJob.builder(level, BlockPos.containing(at), size * 1.5).vertical(0.7).noise(0.25).lining(Palette.KINETIC, 1.2).submit();
		}
		DamageSource source = ModDamageTypes.source(level, WeaponType.GODFIST, this, owner);
		Combat.sphere(level, source, owner, at, size * 2.2, this.damage, 1.0, 3.0, 1.2);
		Fx.send(level, FxType.KINETIC, at, this.getDeltaMovement(), size * 1.8F, 0.0F, WeaponType.GODFIST.accent(), 256);
		Fx.shake(level, at, 0.9F, 20, 96);
		Fx.sound(level, at, ModSounds.GODFIST_PUNCH, 6.0F, 0.6F);
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
		float size = this.size();
		for (int i = 0; i < 6; i++) {
			Vec3 p = end.add((this.random.nextDouble() - 0.5) * size * 1.6, (this.random.nextDouble() - 0.5) * size * 1.6, (this.random.nextDouble() - 0.5) * size * 1.6);
			level.addParticle(
				FxParticleOptions.of(ModParticles.SPARK, 0xBFF6FF, 0x2A8BFF, 0.15F, 12, 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, (start.x - end.x) * 0.2, (start.y - end.y) * 0.2, (start.z - end.z) * 0.2
			);
		}
	}
}
