package com.godforge.entity;

import com.godforge.destruction.BlockOps;
import com.godforge.destruction.Palette;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.Loaded;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * A temporary tear between dimensions. Nearby terrain bleeds into blocks from other worlds, creatures
 * are dragged towards the opening and lashed by void arcs, and the rift seals itself after a while.
 */
public class DimensionalRiftEntity extends GfEffectEntity {
	private float damage = 6.0F;

	public DimensionalRiftEntity(EntityType<? extends DimensionalRiftEntity> type, Level level) {
		super(type, level);
		this.setLifetime(240);
	}

	public void configure(float height, int lifetime, float damage, boolean terrain) {
		this.setSize(height);
		this.setLifetime(lifetime);
		this.setVariant(this.random.nextInt());
		this.damage = damage;
		this.terrain = terrain;
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		Vec3 center = this.position().add(0, this.size() * 0.5, 0);
		Entity owner = this.getOwner();
		if (age % 5 == 0) {
			AABB box = new AABB(center, center).inflate(9.0, this.size(), 9.0);
			DamageSource source = ModDamageTypes.source(level, WeaponType.REALITY_BREAKER, this, owner);
			for (Entity e : level.getEntities(this, box, e -> e instanceof LivingEntity && e.isAlive())) {
				if (!Combat.canAffect(level, owner, e)) {
					continue;
				}
				Vec3 to = center.subtract(e.position());
				double d = to.length();
				if (d < 1.8) {
					Combat.hurt(level, e, source, this.damage);
					// spat back out somewhere chaotic
					Combat.launch(e, new Vec3(this.random.nextGaussian(), 0.9, this.random.nextGaussian()).normalize().scale(1.6));
				} else if (d < 9.0) {
					Combat.launch(e, to.normalize().scale(0.14 * (1.0 - d / 9.0) + 0.04));
				}
			}
		}
		if (age % 30 == 15) {
			// void arc to a random nearby creature
			List<Entity> targets = level.getEntities(this, new AABB(center, center).inflate(14.0), e -> e instanceof LivingEntity && e.isAlive() && Combat.canAffect(level, owner, e));
			if (!targets.isEmpty()) {
				Entity target = targets.get(this.random.nextInt(targets.size()));
				Combat.hurt(level, target, ModDamageTypes.source(level, WeaponType.REALITY_BREAKER, this, owner), this.damage * 1.5F);
				Fx.send(level, FxType.MUZZLE, center, target.getBoundingBox().getCenter().subtract(center), 1.0F, 1.0F, WeaponType.REALITY_BREAKER.accent(), 96);
				Fx.sound(level, center, ModSounds.REALITY_SHATTER, 1.0F, 1.6F);
			}
		}
		if (this.terrain && age % 3 == 0 && WeaponAccess.terrainAllowed(level, owner, true, this.blockPosition())) {
			// the surrounding land slowly bleeds into other dimensions
			double angle = this.random.nextDouble() * Math.PI * 2;
			double dist = Math.sqrt(this.random.nextDouble()) * 9.0;
			int x = (int) Math.floor(center.x + Math.cos(angle) * dist);
			int z = (int) Math.floor(center.z + Math.sin(angle) * dist);
			BlockPos top = new BlockPos(x, level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z) - 1, z);
			if (Math.abs(top.getY() - center.y) < 12) {
				for (int i = 0; i < 2; i++) {
					BlockPos p = top.below(i);
					BlockState state = Loaded.state(level, p);
					if (state != null && !BlockOps.isProtected(level, p, state)) {
						BlockState next = Palette.bleed(state, p, this.getVariant());
						if (next != null) {
							BlockOps.set(level, p, next);
						}
					}
				}
			}
		}
	}

	private long getVariant() {
		return this.variant();
	}

	@Override
	protected void onEnd(ServerLevel level) {
		Vec3 center = this.position().add(0, this.size() * 0.5, 0);
		Fx.send(level, FxType.IMPLOSION, center, Vec3.ZERO, this.size(), 10.0F, WeaponType.REALITY_BREAKER.color(), 160);
		Fx.sound(level, center, ModSounds.REALITY_SHATTER, 2.0F, 0.6F);
	}

	@Override
	protected void clientTick() {
		Level level = this.level();
		float h = this.size();
		Vec3 base = this.position();
		for (int i = 0; i < 3; i++) {
			double y = this.random.nextDouble() * h;
			double angle = this.random.nextDouble() * Math.PI * 2;
			double r = 2.0 + this.random.nextDouble() * 5.0;
			Vec3 p = base.add(Math.cos(angle) * r, y, Math.sin(angle) * r);
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, this.random.nextBoolean() ? 0xD04DFF : 0x6CF6FF, 0x1A0033, 0.12F, 30, 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_NO_PHYSICS | FxParticleOptions.F_ATTRACT),
				p.x, p.y, p.z, base.x, base.y + y, base.z
			);
		}
		if (this.random.nextInt(4) == 0) {
			level.addParticle(
				FxParticleOptions.of(ModParticles.SHARD, 0xE0A0FF, 0x6CF6FF, 0.18F, 40, 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SPIN | FxParticleOptions.F_NO_PHYSICS | FxParticleOptions.F_SHRINK),
				base.x + (this.random.nextDouble() - 0.5) * 1.5, base.y + this.random.nextDouble() * h, base.z + (this.random.nextDouble() - 0.5) * 1.5,
				(this.random.nextDouble() - 0.5) * 0.1, 0.02, (this.random.nextDouble() - 0.5) * 0.1
			);
		}
	}
}
