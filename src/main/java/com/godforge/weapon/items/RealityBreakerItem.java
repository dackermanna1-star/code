package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.SurfaceJob;
import com.godforge.entity.DimensionalRiftEntity;
import com.godforge.entity.FractureChunkEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import com.godforge.util.Scheduler;
import com.godforge.util.Targeting;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The Reality Breaker — Dimensional Collapse. Shatters terrain into floating chunks and tears rifts
 * into other dimensions; the ultimate spreads the fracture across the landscape in a chain reaction.
 */
public class RealityBreakerItem extends GodWeaponItem {
	public RealityBreakerItem(Properties properties) {
		super(WeaponType.REALITY_BREAKER, properties);
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 0.9F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.accent(), 64);
			Fx.sound(level, player.position(), ModSounds.REALITY_SHATTER, 0.8F, 1.8F);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
		if (charge < 0.2F || mode.ultimate() && charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		Vec3 aim = Targeting.aimPoint(player, mode.ultimate() ? 96.0 : 56.0);
		Vec3 ground = Targeting.ground(level, aim);
		Vec3 center = ground != null ? ground : aim;
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(center));
		float damage = (float) tuning.damage;
		player.swing(net.minecraft.world.InteractionHand.MAIN_HAND, true);
		Fx.send(level, FxType.MUZZLE, handPosition(player, 1.0F), center.subtract(player.getEyePosition()), 2.0F, 1.0F, this.type.color(), 128);
		if (mode.ultimate()) {
			collapse(level, player, center, (int) tuning.extra("collapseNodes", 16.0), damage, scale, terrain);
		} else {
			double radius = tuning.extra("fractureRadius", 11.0) * scale * (0.4 + 0.6 * charge) * settings.sizeFraction();
			int rifts = Math.round(settings.power() * charge);
			fracture(level, player, center, radius, rifts, damage * (0.6F + charge * 0.6F), terrain, false);
		}
		return true;
	}

	/** One fracture blast: floating chunks, a jagged scar, dimensional bleed and rifts. */
	public static void fracture(ServerLevel level, @Nullable Entity owner, Vec3 center, double radius, int rifts, float damage, boolean terrain, boolean quiet) {
		RandomSource random = level.getRandom();
		int color = WeaponType.REALITY_BREAKER.color();
		Fx.send(level, FxType.SHATTER, center, Vec3.ZERO, (float) radius, 1.0F, color, 384);
		if (!quiet) {
			Fx.flash(level, center, 0xC86BFF, 0.45F, 12, radius * 10);
			Fx.distort(level, center, 0.8F, 40, radius * 8);
		}
		Fx.shake(level, center, quiet ? 0.6F : 1.0F, 30, radius * 10);
		Fx.sound(level, center, ModSounds.REALITY_SHATTER, 6.0F + (float) radius * 0.5F, 0.7F + random.nextFloat() * 0.3F);

		// reality lets go of everything nearby: creatures are hurled upward and left floating
		AABB box = new AABB(center, center).inflate(radius * 1.3);
		Combat.area(level, ModDamageTypes.source(level, WeaponType.REALITY_BREAKER, owner, owner), owner, center, radius * 1.3, damage, 0.6, 0.5, 1.2, e -> true);
		for (Entity e : level.getEntities((Entity) null, box, e -> e instanceof LivingEntity && e.isAlive() && !(e instanceof EffectEntity))) {
			if (e != owner && Combat.canAffect(level, owner, e)) {
				((LivingEntity) e).addEffect(new MobEffectInstance(MobEffects.LEVITATION, 50, 1), owner);
			}
		}
		if (!terrain) {
			return;
		}
		int chunks = (int) Math.min(28, radius * 1.5);
		for (int i = 0; i < chunks; i++) {
			tearChunk(level, center, radius, damage * 0.5F, random);
		}
		CraterJob.builder(level, BlockPos.containing(center), radius * 0.45).vertical(0.7).noise(0.45).lining(Palette.DIMENSIONAL, 1.4).submit(2);
		DestructionManager.submit(new SurfaceJob(level, BlockPos.containing(center), radius * 1.35, 2, (int) radius + 6, 0.0F, 0.35,
			(state, pos, layer) -> Palette.bleed(state, pos, 0xD1A7L)).delayed(4));
		for (int i = 0; i < rifts; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double dist = radius * (0.3 + random.nextDouble() * 0.6);
			Vec3 p = Targeting.ground(level, center.add(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
			if (p == null) {
				continue;
			}
			DimensionalRiftEntity rift = new DimensionalRiftEntity(ModEntities.DIMENSIONAL_RIFT, level);
			rift.setOwner(owner);
			rift.setPos(p.add(0, 0.5, 0));
			rift.configure(5.0F + random.nextFloat() * 5.0F, 200 + random.nextInt(120), damage * 0.25F, terrain);
			level.addFreshEntity(rift);
		}
	}

	/** Tears a small box of terrain out of the ground and lifts it into the air as a floating fragment. */
	private static void tearChunk(ServerLevel level, Vec3 center, double radius, float damage, RandomSource random) {
		if (!FractureChunkEntity.canSpawn()) {
			return;
		}
		double angle = random.nextDouble() * Math.PI * 2;
		double dist = Math.sqrt(random.nextDouble()) * radius;
		int cx = Mth.floor(center.x + Math.cos(angle) * dist);
		int cz = Mth.floor(center.z + Math.sin(angle) * dist);
		if (Loaded.chunk(level, cx, cz) == null) {
			return;
		}
		int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, cx, cz) - 1;
		if (Math.abs(top - center.y) > radius + 4) {
			return;
		}
		int w = 2 + random.nextInt(3);
		int h = 2 + random.nextInt(2);
		int d = 2 + random.nextInt(3);
		int x0 = cx - w / 2;
		int z0 = cz - d / 2;
		int y0 = top - h + 1;
		BlockState[] states = new BlockState[w * h * d];
		int solid = 0;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int y = 0; y < h; y++) {
			for (int z = 0; z < d; z++) {
				for (int x = 0; x < w; x++) {
					pos.set(x0 + x, y0 + y, z0 + z);
					BlockState state = Loaded.state(level, pos);
					if (state == null || state.isAir() || !state.getFluidState().isEmpty() || state.hasBlockEntity() || BlockOps.isProtected(level, pos, state)) {
						continue;
					}
					states[(y * d + z) * w + x] = state;
					solid++;
				}
			}
		}
		if (solid < states.length * 0.4) {
			return;
		}
		for (int y = 0; y < h; y++) {
			for (int z = 0; z < d; z++) {
				for (int x = 0; x < w; x++) {
					if (states[(y * d + z) * w + x] != null) {
						pos.set(x0 + x, y0 + y, z0 + z);
						BlockOps.erase(level, pos);
					}
				}
			}
		}
		Vec3 spawn = new Vec3(x0 + w * 0.5, y0, z0 + d * 0.5);
		FractureChunkEntity.spawn(level, spawn, w, h, d, states, 0.35F + random.nextFloat() * 0.45F, 140 + random.nextInt(160), damage);
	}

	/** The ultimate: a branching chain of fractures racing across the land. */
	public static void collapse(ServerLevel level, ServerPlayer owner, Vec3 origin, int nodes, float damage, double scale, boolean terrain) {
		AtomicInteger budget = new AtomicInteger(Math.max(1, nodes));
		RandomSource random = level.getRandom();
		Fx.sound(level, origin, ModSounds.REALITY_COLLAPSE, 20.0F, 0.8F);
		Fx.flash(level, origin, 0xD9A0FF, 0.9F, 30, 256);
		Fx.distort(level, origin, 1.0F, 160, 256);
		Fx.skyFlash(level, origin, 6, 320);
		node(level, owner, origin, random.nextDouble() * Math.PI * 2, 0, budget, damage, scale, terrain, random);
		Scheduler.later(level, nodes * 7 + 20, () -> {
			Fx.send(level, FxType.SHATTER, origin, Vec3.ZERO, 96.0F, 2.0F, WeaponType.REALITY_BREAKER.accent(), 384);
			Fx.shake(level, origin, 2.5F, 60, 320);
			Fx.sound(level, origin, ModSounds.REALITY_COLLAPSE, 24.0F, 0.6F);
		});
	}

	private static void node(ServerLevel level, ServerPlayer owner, Vec3 at, double heading, int generation, AtomicInteger budget, float damage, double scale, boolean terrain,
		RandomSource random) {
		if (budget.getAndDecrement() <= 0) {
			return;
		}
		double radius = (7.0 + random.nextDouble() * 5.0) * scale;
		fracture(level, owner, at, radius, generation % 2 == 0 ? 1 : 0, damage, terrain, generation > 0);
		int children = generation < 2 ? 2 : (random.nextFloat() < 0.6F ? 1 : 2);
		for (int i = 0; i < children; i++) {
			double angle = heading + (random.nextDouble() - 0.5) * 1.8 + (i - (children - 1) * 0.5) * 0.9;
			double dist = (14.0 + random.nextDouble() * 9.0) * scale;
			Vec3 next = Targeting.ground(level, at.add(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
			if (next == null) {
				continue;
			}
			int delay = 6 + random.nextInt(6);
			Scheduler.later(level, delay, () -> node(level, owner, next, angle, generation + 1, budget, damage, scale, terrain, random));
		}
	}
}
