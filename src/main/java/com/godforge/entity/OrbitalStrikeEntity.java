package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.SurfaceJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.Loaded;
import com.godforge.util.Scheduler;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Controller for the Planet Cracker's orbital bombardment. It paints targets across the designated
 * zone and calls down lances of energy from orbit, turning the area into a blazing wasteland.
 */
public class OrbitalStrikeEntity extends GfEffectEntity {
	public static final int WARNING_TICKS = 16;
	private static final AtomicInteger ACTIVE = new AtomicInteger();

	private boolean counted;
	private float damage = 40.0F;
	private int strikes = 40;
	private int fired;

	/** Live instances are never saved, so a starting server always begins from zero. */
	public static void resetLiveCount() {
		ACTIVE.set(0);
	}

	public OrbitalStrikeEntity(EntityType<? extends OrbitalStrikeEntity> type, Level level) {
		super(type, level);
		this.setLifetime(20 * 15);
	}

	public static boolean canSpawn() {
		return ACTIVE.get() < GodforgeConfig.get().performance.maxOrbitalBarrages;
	}

	public void configure(float radius, int strikes, float damage, int lifetime, boolean terrain) {
		this.setSize(radius);
		this.strikes = strikes;
		this.damage = damage;
		this.setLifetime(lifetime);
		this.terrain = terrain;
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		if (!this.counted) {
			this.counted = true;
			ACTIVE.incrementAndGet();
		}
		Vec3 center = this.position();
		Entity owner = this.getOwner();
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, this.blockPosition());
		float radius = this.size();
		if (age == 1) {
			Fx.sound(level, center, ModSounds.ASTEROID_LOCK, 12.0F, 0.5F);
			Fx.send(level, FxType.LOCK_ON, center, Vec3.ZERO, radius, 40.0F, WeaponType.PLANET_CRACKER.color(), 512);
			if (terrain) {
				// the bombardment zone burns into a wasteland
				DestructionManager.submit(new SurfaceJob(level, this.blockPosition(), radius * 1.1, 3, 40, 0.22F, 0.2,
					(state, pos, layer) -> Palette.scorchSurface(state, pos, 6060L, true)).delayed(40));
			}
		}
		int active = this.lifetime() - WARNING_TICKS - 20;
		if (age < 20 || age > active || this.fired >= this.strikes) {
			return;
		}
		float progress = (age - 20) / (float) Math.max(1, active - 20);
		int due = Math.round(progress * this.strikes);
		while (this.fired < due) {
			this.fired++;
			this.designate(level, center, radius, owner, terrain);
		}
	}

	private void designate(ServerLevel level, Vec3 center, float radius, Entity owner, boolean terrain) {
		double angle = this.random.nextDouble() * Math.PI * 2;
		double dist = Math.sqrt(this.random.nextDouble()) * radius;
		int x = Mth.floor(center.x + Math.cos(angle) * dist);
		int z = Mth.floor(center.z + Math.sin(angle) * dist);
		if (Loaded.chunk(level, x, z) == null) {
			return;
		}
		Vec3 target = new Vec3(x + 0.5, level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z), z + 0.5);
		float strikeRadius = 4.0F + this.random.nextFloat() * 3.5F;
		Fx.send(level, FxType.LOCK_ON, target, Vec3.ZERO, strikeRadius, WARNING_TICKS, 0xFF2A2A, 384);
		Scheduler.later(level, WARNING_TICKS, () -> this.strike(level, target, strikeRadius, owner, terrain));
	}

	private void strike(ServerLevel level, Vec3 target, float radius, Entity owner, boolean terrain) {
		DamageSource source = ModDamageTypes.source(level, WeaponType.PLANET_CRACKER, this, owner);
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(target), radius).vertical(0.7).noise(0.25).lining(Palette.MOLTEN, 1.5).fire(0.5F).submit();
			Impacts.debris(level, target, radius * 0.6, 4, 0.7, 1.2);
		}
		Combat.sphere(level, source, owner, target, radius * 1.8, this.damage, 1.0, 1.8, 1.2);
		Fx.send(level, FxType.ORBITAL, target, new Vec3(0, 1, 0), radius * 0.6F, 18.0F, WeaponType.PLANET_CRACKER.color(), 512);
		Fx.send(level, FxType.EXPLOSION, target, Vec3.ZERO, radius, 0.0F, 0x3DFF7A, 384);
		Fx.shake(level, target, 0.8F, 18, radius * 14);
		Fx.flash(level, target, 0xD2FFE0, 0.35F, 8, radius * 10);
		Fx.sound(level, target, ModSounds.ORBITAL_STRIKE, 14.0F, 0.8F + this.random.nextFloat() * 0.4F);
	}

	@Override
	protected void onEnd(ServerLevel level) {
		Fx.sound(level, this.position(), ModSounds.CRACKER_IMPACT, 16.0F, 0.5F);
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		// runs for every removal, including chunk unloads that bypass remove()
		if (this.counted) {
			this.counted = false;
			ACTIVE.decrementAndGet();
		}
		super.onRemoval(reason);
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 768.0 * 768.0;
	}
}
