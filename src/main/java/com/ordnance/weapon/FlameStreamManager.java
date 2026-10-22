package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.fire.BurningFuelBlock;
import com.ordnance.fire.FireHelper;
import com.ordnance.registry.ModBlocks;
import com.ordnance.registry.ModDamageTypes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Server-side simulation of burning fuel globs from flamethrowers and incendiary munitions. Globs are lightweight
 * (no entities, nothing sent over the network): clients draw the stream themselves from the shooter's state, and
 * only the consequences (damage, fire, puddles) are authoritative.
 */
public final class FlameStreamManager {
	private static final Map<RegistryKey<World>, List<Glob>> GLOBS = new HashMap<>();
	private static final int MAX_GLOBS_PER_WORLD = 2000;
	/** Last tick an entity was burned by a glob, so a dense stream hits ~5 times a second instead of every glob. */
	private static final Map<Entity, Long> LAST_HIT = new java.util.WeakHashMap<>();

	private FlameStreamManager() {
	}

	public static void spawnGlob(ServerWorld world, Vec3d pos, Vec3d velocity, @Nullable Entity owner, boolean napalm) {
		List<Glob> list = GLOBS.computeIfAbsent(world.getRegistryKey(), key -> new ArrayList<>());
		if (list.size() < MAX_GLOBS_PER_WORLD) {
			list.add(new Glob(pos, velocity, owner, napalm));
		}
	}

	public static void tick(ServerWorld world) {
		List<Glob> list = GLOBS.get(world.getRegistryKey());
		if (list == null || list.isEmpty()) {
			return;
		}

		OrdnanceConfig.Flamethrower cfg = ConfigManager.get().weapons.flamethrower;
		for (Iterator<Glob> it = list.iterator(); it.hasNext(); ) {
			Glob glob = it.next();
			if (!glob.tick(world, cfg)) {
				it.remove();
			}
		}
	}

	public static void clear() {
		GLOBS.clear();
		LAST_HIT.clear();
	}

	private static final class Glob {
		private Vec3d pos;
		private Vec3d velocity;
		@Nullable
		private final Entity owner;
		private final boolean napalm;
		private int age;

		Glob(Vec3d pos, Vec3d velocity, @Nullable Entity owner, boolean napalm) {
			this.pos = pos;
			this.velocity = velocity;
			this.owner = owner;
			this.napalm = napalm;
		}

		/** Returns false when the glob is spent. */
		boolean tick(ServerWorld world, OrdnanceConfig.Flamethrower cfg) {
			int maxAge = this.napalm ? 40 : 22;
			if (++this.age > maxAge) {
				return false;
			}

			Vec3d next = this.pos.add(this.velocity);
			BlockHitResult blockHit = world.raycast(new RaycastContext(this.pos, next, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.ANY, net.minecraft.block.ShapeContext.absent()));
			Vec3d end = blockHit.getType() == HitResult.Type.MISS ? next : blockHit.getPos();

			double radius = 0.25 + this.age * 0.045;
			Box sweep = new Box(this.pos, end).expand(radius);
			for (Entity entity : world.getOtherEntities(this.owner, sweep, e -> e.isAlive() && (e instanceof LivingEntity || e.isPushable()))) {
				this.burn(world, entity, cfg);
			}

			if (blockHit.getType() != HitResult.Type.MISS) {
				this.splash(world, blockHit, cfg);
				return false;
			}

			if (world.getFluidState(BlockPos.ofFloored(next)).isIn(FluidTags.WATER)) {
				return false;
			}

			this.pos = next;
			this.velocity = this.velocity.multiply(this.napalm ? 0.96 : 0.93).add(0.0, this.napalm ? -0.04 : -0.012, 0.0);
			return true;
		}

		private void burn(ServerWorld world, Entity entity, OrdnanceConfig.Flamethrower cfg) {
			long now = world.getTime();
			Long last = LAST_HIT.get(entity);
			if (last != null && now - last < 4) {
				return;
			}

			LAST_HIT.put(entity, now);
			if (!entity.isFireImmune()) {
				DamageSource source = ModDamageTypes.create(world, ModDamageTypes.INCINERATED, this.owner, this.owner);
				entity.timeUntilRegen = 0;
				entity.damage(world, source, this.napalm ? cfg.damagePerHit * 0.6F : cfg.damagePerHit);
				entity.setOnFireFor(cfg.igniteSeconds);
			}
		}

		private void splash(ServerWorld world, BlockHitResult hit, OrdnanceConfig.Flamethrower cfg) {
			BlockPos hitPos = hit.getBlockPos();
			if (world.getFluidState(hitPos).isIn(FluidTags.WATER)) {
				return;
			}

			FireHelper.heatBlock(world, hitPos, this.owner);
			if (!cfg.igniteBlocks || !ConfigManager.get().explosions.createFires) {
				return;
			}

			Direction side = hit.getSide();
			BlockPos firePos = hitPos.offset(side);
			BlockState hitState = world.getBlockState(hitPos);
			float puddleChance = this.napalm ? 0.6F : cfg.puddleChance;
			if (side != Direction.UP) {
				// Burning fuel runs down walls: try the floor beneath the splash point.
				BlockPos below = firePos.down();
				if (world.isAir(firePos) && world.isAir(below) && BurningFuelBlock.canBurnAt(world, below) && world.random.nextFloat() < puddleChance * 0.5F) {
					placeFuel(world, below);
					return;
				}
			}

			if (FireHelper.isFlammable(hitState) || world.random.nextFloat() < 0.35F) {
				if (FireHelper.tryIgnite(world, firePos, false, this.owner)) {
					return;
				}
			}

			if (side == Direction.UP && world.random.nextFloat() < puddleChance) {
				FireHelper.tryIgnite(world, firePos, true, this.owner);
			}
		}

		private void placeFuel(ServerWorld world, BlockPos pos) {
			if (com.ordnance.explosion.TerrainEffects.canModify(world, pos, this.owner) && !world.hasRain(pos)) {
				world.setBlockState(pos, ModBlocks.BURNING_FUEL.getDefaultState(), Block.NOTIFY_ALL);
			}
		}
	}
}
