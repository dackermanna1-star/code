package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.SurfaceJob;
import com.godforge.destruction.TempBlocksJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LightBlock;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The Sunforge ultimate: an enormous artificial sun ignites above the target, floods the land with real
 * light and searing heat, lashes the ground with solar flares, then erupts in an apocalyptic detonation
 * that leaves a scorched, burning wasteland.
 */
public class ArtificialSunEntity extends GfEffectEntity {
	public static final int GROW_TICKS = 40;
	public static final int ERUPT_TICKS = 24;
	private static final AtomicInteger ACTIVE = new AtomicInteger();

	private boolean counted;
	private float damage = 20.0F;
	private float areaRadius = 40.0F;
	private double groundY;

	/** Live instances are never saved, so a starting server always begins from zero. */
	public static void resetLiveCount() {
		ACTIVE.set(0);
	}

	public ArtificialSunEntity(EntityType<? extends ArtificialSunEntity> type, Level level) {
		super(type, level);
		this.setLifetime(200);
	}

	public static boolean canSpawn() {
		return ACTIVE.get() < GodforgeConfig.get().performance.maxArtificialSuns;
	}

	/** @param sunRadius visual radius of the sun; @param areaRadius radius of the scorched region */
	public void configure(float sunRadius, float areaRadius, float damage, double groundY, int lifetime, boolean terrain) {
		this.setSize(sunRadius);
		this.areaRadius = areaRadius;
		this.damage = damage;
		this.groundY = groundY;
		this.setLifetime(lifetime);
		this.terrain = terrain;
	}

	/** 0..1 growth, used by the renderer. */
	public float growth(float partialTick) {
		return Mth.clamp((this.age() + partialTick) / GROW_TICKS, 0.0F, 1.0F);
	}

	/** 0..1 eruption progress (0 until the eruption starts). */
	public float eruption(float partialTick) {
		float start = this.lifetime() - ERUPT_TICKS;
		return Mth.clamp((this.age() + partialTick - start) / ERUPT_TICKS, 0.0F, 1.0F);
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		if (!this.counted) {
			this.counted = true;
			ACTIVE.incrementAndGet();
		}
		Vec3 sun = this.position();
		Vec3 ground = new Vec3(sun.x, this.groundY, sun.z);
		Entity owner = this.getOwner();
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(ground));
		int eruptAt = this.lifetime() - ERUPT_TICKS;
		if (age == 1) {
			Fx.sound(level, sun, ModSounds.SUN_LOOP, 16.0F, 0.6F);
			Fx.skyFlash(level, sun, 10, this.areaRadius * 5);
			if (terrain) {
				this.illuminate(level, ground);
			}
		}
		if (age % 40 == 0 && age < eruptAt) {
			Fx.sound(level, sun, ModSounds.SUN_LOOP, 16.0F, 0.6F + age / (float) this.lifetime() * 0.5F);
		}
		float heat = Math.min(1.0F, age / (float) eruptAt);
		if (age % 5 == 0 && age < eruptAt) {
			this.searArea(level, ground, heat, owner);
			Fx.send(level, FxType.HEAT_HAZE, ground, Vec3.ZERO, this.areaRadius * 0.6F, 20.0F, 0xFFB01F, 384);
		}
		if (age > GROW_TICKS && age < eruptAt && age % Math.max(2, 8 - (int) (heat * 6)) == 0) {
			this.solarFlare(level, sun, ground, owner, terrain);
		}
		if (age == eruptAt) {
			Fx.send(level, FxType.IMPLOSION, sun, Vec3.ZERO, this.size() * 2.0F, ERUPT_TICKS, 0xFFE27A, 768);
			Fx.sound(level, sun, ModSounds.BLACKHOLE_COLLAPSE, 16.0F, 1.4F);
		}
	}

	/** Real light: temporary light blocks blanket the ground beneath the sun. */
	private void illuminate(ServerLevel level, Vec3 ground) {
		TempBlocksJob lights = new TempBlocksJob(level, this.lifetime() + 10, true);
		int r = (int) Math.min(48, this.areaRadius);
		for (int dx = -r; dx <= r; dx += 7) {
			for (int dz = -r; dz <= r; dz += 7) {
				if (dx * dx + dz * dz > r * r) {
					continue;
				}
				int x = Mth.floor(ground.x) + dx;
				int z = Mth.floor(ground.z) + dz;
				BlockPos top = new BlockPos(x, level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z) + 1, z);
				if (Math.abs(top.getY() - ground.y) < 40) {
					lights.add(top, Blocks.LIGHT.defaultBlockState().setValue(LightBlock.LEVEL, 15));
				}
			}
		}
		DestructionManager.submit(lights);
	}

	private void searArea(ServerLevel level, Vec3 ground, float heat, Entity owner) {
		DamageSource source = ModDamageTypes.source(level, WeaponType.SUNFORGE, this, owner);
		AABB box = new AABB(ground, ground).inflate(this.areaRadius, 40.0, this.areaRadius);
		for (Entity e : level.getEntities(this, box, e -> e instanceof LivingEntity && e.isAlive() && !(e instanceof EffectEntity))) {
			double h = Math.sqrt(e.distanceToSqr(ground.x, e.getY(), ground.z));
			if (h > this.areaRadius || !Combat.canAffect(level, owner, e)) {
				continue;
			}
			float f = (float) (1.0 - h / this.areaRadius);
			e.igniteForSeconds(4.0F + heat * 6.0F);
			if (heat > 0.3F) {
				Combat.hurt(level, e, source, this.damage * 0.15F * heat * f);
			}
		}
	}

	private void solarFlare(ServerLevel level, Vec3 sun, Vec3 ground, Entity owner, boolean terrain) {
		double angle = this.random.nextDouble() * Math.PI * 2;
		double dist = Math.sqrt(this.random.nextDouble()) * this.areaRadius * 0.85;
		int x = Mth.floor(ground.x + Math.cos(angle) * dist);
		int z = Mth.floor(ground.z + Math.sin(angle) * dist);
		if (Loaded.chunk(level, x, z) == null) {
			return;
		}
		Vec3 hit = new Vec3(x + 0.5, level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z), z + 0.5);
		Fx.send(level, FxType.MUZZLE, sun, hit.subtract(sun), 3.0F, 1.0F, 0xFFC23A, 512);
		Fx.send(level, FxType.EXPLOSION, hit, Vec3.ZERO, 3.5F, 0.0F, 0xFF8A1F, 256);
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(hit), 2.5 + this.random.nextDouble() * 2.0).vertical(0.7).lining(Palette.MOLTEN, 1.0).fire(0.6F).submit();
		}
		Combat.sphere(level, ModDamageTypes.source(level, WeaponType.SUNFORGE, this, owner), owner, hit, 5.0, this.damage, 0.8, 1.2, 0.8);
		if (this.random.nextInt(3) == 0) {
			Fx.sound(level, hit, ModSounds.SUNFORGE_BOLT, 4.0F, 0.6F);
		}
	}

	@Override
	protected void onEnd(ServerLevel level) {
		Vec3 sun = this.position();
		Vec3 ground = new Vec3(sun.x, this.groundY, sun.z);
		Entity owner = this.getOwner();
		DamageSource source = ModDamageTypes.source(level, WeaponType.SUNFORGE, this, owner);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(ground));
		float area = this.areaRadius;
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(ground), area * 0.45).vertical(0.45).noise(0.25).lining(Palette.MOLTEN, 2.5).fire(0.6F).submit();
			DestructionManager.submit(new SurfaceJob(level, BlockPos.containing(ground), area * 1.15, 3, 40, 0.3F, 0.18,
				(state, pos, layer) -> Palette.scorchSurface(state, pos, 1919L, true)).delayed(5));
			Impacts.debris(level, ground, area * 0.3, 60, 1.5, 1.5);
		}
		Combat.sphere(level, source, owner, ground, area, this.damage * 5.0F, 0.8, 3.5, 1.5);
		for (Entity e : level.getEntities(this, new AABB(ground, ground).inflate(area * 1.3), e -> e instanceof LivingEntity && e.isAlive())) {
			if (Combat.canAffect(level, owner, e)) {
				e.igniteForSeconds(15.0F);
			}
		}
		Impacts.shockwaves(level, ground, 6, area * 2.4, 4, 0xFF8A1F, this.damage * 1.5F, source, owner);
		Fx.send(level, FxType.SOLAR, ground, Vec3.ZERO, area, 1.0F, 0xFFE27A, 1024);
		Fx.flash(level, ground, 0xFFF4D0, 1.0F, 50, area * 10);
		Fx.shake(level, ground, 3.0F, 100, area * 10);
		Fx.skyFlash(level, ground, 12, area * 12);
		Fx.sound(level, ground, ModSounds.SOLAR_ERUPTION, 24.0F, 0.7F);
		Fx.sound(level, ground, ModSounds.BIG_EXPLOSION, 24.0F, 0.4F);
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
		return distance < 1024.0 * 1024.0;
	}
}
