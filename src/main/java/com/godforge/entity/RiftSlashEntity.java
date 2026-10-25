package com.godforge.entity;

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
import com.godforge.weapon.WeaponType;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** The Worldcutter's crescent of severed space: phases through terrain, carving a clean trench and cleaving foes. */
public class RiftSlashEntity extends GfProjectile {
	private final Set<UUID> hit = new HashSet<>();
	private PathJob trench;
	private float damage = 28.0F;

	public RiftSlashEntity(EntityType<? extends RiftSlashEntity> type, Level level) {
		super(type, level);
		this.maxAge = 24;
	}

	public void configure(float damage, float width, boolean terrain) {
		this.damage = damage;
		this.setSize(width);
		this.terrain = terrain;
	}

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		float width = this.size();
		Vec3 dir = end.subtract(start);
		if (dir.lengthSqr() < 1.0E-6) {
			return end;
		}
		Vec3 forward = dir.normalize();
		Vec3 right = new Vec3(-forward.z, 0, forward.x);
		if (right.lengthSqr() < 1.0E-6) {
			right = new Vec3(1, 0, 0);
		}
		right = right.normalize();

		// cleave everything along the swept crescent
		Entity owner = this.getOwner();
		DamageSource source = ModDamageTypes.source(level, WeaponType.WORLDCUTTER, this, owner);
		AABB box = new AABB(start, end).inflate(width * 0.5 + 0.5, 1.6, width * 0.5 + 0.5);
		for (Entity e : level.getEntities(this, box, e -> e instanceof LivingEntity && e.isAlive() && !this.hit.contains(e.getUUID()))) {
			Vec3 c = e.getBoundingBox().getCenter();
			double t = Math.max(0.0, Math.min(1.0, c.subtract(start).dot(dir) / dir.lengthSqr()));
			Vec3 p = start.add(dir.scale(t));
			Vec3 off = c.subtract(p);
			double lateral = Math.abs(off.dot(right));
			double vertical = Math.abs(off.y);
			if (lateral > width * 0.5 + e.getBbWidth() * 0.5 || vertical > 1.4 + e.getBbHeight() * 0.5) {
				continue;
			}
			if (!Combat.canAffect(level, owner, e)) {
				continue;
			}
			this.hit.add(e.getUUID());
			Combat.hurt(level, e, source, this.damage);
			Combat.launch(e, forward.scale(1.2).add(0, 0.35, 0));
			level.sendParticles(
				FxParticleOptions.of(ModParticles.SPARK, 0xFFFFFF, 0xB18CFF, 0.15F, 12, 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK),
				c.x, c.y, c.z, 14, 0.4, 0.4, 0.4, 0.4
			);
		}

		// carve a clean, thin cut through anything in the way
		if (this.terrain) {
			if (this.trench == null) {
				this.trench = new PathJob(level, this.random.nextLong());
				if (!DestructionManager.submit(this.trench)) {
					this.terrain = false;
				}
			}
			if (this.trench != null && this.terrain) {
				double half = width * 0.5 - 0.3;
				for (double off = -half; off <= half + 1.0E-3; off += 0.9) {
					Vec3 o = right.scale(off);
					double sag = Math.abs(off) / Math.max(0.1, half) * 0.6;
					this.trench.add(start.add(o).add(forward.scale(sag)), end.add(o).add(forward.scale(sag)), 0.75, Palette.NONE);
				}
			}
		}
		return end;
	}

	@Override
	protected void onExpire(ServerLevel level) {
		if (this.trench != null) {
			this.trench.seal();
		}
		Fx.send(level, FxType.SHATTER, this.position(), Vec3.ZERO, this.size() * 0.4F, 0.0F, WeaponType.WORLDCUTTER.color(), 96);
		Fx.sound(level, this.position(), ModSounds.WORLDCUTTER_SLASH, 0.6F, 1.6F);
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		if (this.trench != null) {
			this.trench.seal();
		}
		super.onRemoval(reason);
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		Vec3 dir = end.subtract(start);
		if (dir.lengthSqr() < 1.0E-6) {
			return;
		}
		Vec3 forward = dir.normalize();
		Vec3 right = new Vec3(-forward.z, 0, forward.x).normalize();
		float width = this.size();
		for (int i = 0; i < 6; i++) {
			double off = (this.random.nextDouble() - 0.5) * width;
			Vec3 p = start.add(dir.scale(this.random.nextDouble())).add(right.scale(off));
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, i % 2 == 0 ? 0xFFFFFF : 0xB18CFF, 0x5A2AFF, 0.18F, 10, 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, 0, 0, 0
			);
		}
	}
}
