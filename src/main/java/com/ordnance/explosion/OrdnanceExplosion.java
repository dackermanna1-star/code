package com.ordnance.explosion;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.entity.DebrisEntity;
import com.ordnance.entity.GrenadeEntity;
import com.ordnance.fire.FireHelper;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModDamageTypes;
import com.ordnance.registry.ModTags;
import com.ordnance.weapon.FlameStreamManager;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.fluid.FluidState;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.Util;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.event.GameEvent;
import net.minecraft.world.explosion.Explosion;
import net.minecraft.world.explosion.ExplosionImpl;
import org.jspecify.annotations.Nullable;

/**
 * Server-side detonation of an Ordnance warhead.
 *
 * <p>Order of events: blocks are gathered by vanilla-style blast rays plus an explicit crater bowl and an optional
 * shaped-charge jet; fragments hit instantly; the blast front reaches entities with a distance-based delay; a sample
 * of the destroyed blocks is thrown as physical debris; fires, napalm and scorch marks are applied; finally clients
 * are told to play the effect. Blocks are destroyed through {@link BlockState#onExploded} so TNT chains, loot decay
 * and block callbacks behave like vanilla.
 */
public final class OrdnanceExplosion implements Explosion {
	private static final float CRATER_MAX_RESISTANCE = 60.0F;
	/** Warheads at least this strong flatten light structures beyond the reach of their blast rays. */
	private static final float OVERPRESSURE_MIN_POWER = 8.0F;
	/** Blocks up to this blast resistance (wood, glass, foliage, soil, concrete) give way to the overpressure. */
	private static final float OVERPRESSURE_MAX_RESISTANCE = 3.0F;

	private final ServerWorld world;
	private final Vec3d pos;
	private final ExplosionProfile profile;
	private final OrdnanceConfig.Warhead warhead;
	private final OrdnanceConfig.Explosions settings;
	@Nullable
	private final Entity source;
	@Nullable
	private final Entity owner;
	private final Vec3d direction;
	private final Random random;
	private final float power;
	private final float damage;
	private final float radius;
	private final float knockback;
	private final boolean destroysTerrain;
	private final DamageSource blastSource;
	private boolean underwater;

	private OrdnanceExplosion(ServerWorld world, Vec3d pos, ExplosionProfile profile, @Nullable Entity source, @Nullable Entity owner, Vec3d direction) {
		this.world = world;
		this.pos = pos;
		this.profile = profile;
		this.source = source;
		this.owner = owner;
		this.direction = direction.lengthSquared() > 1.0E-6 ? direction.normalize() : new Vec3d(0.0, -1.0, 0.0);
		this.random = world.getRandom();
		this.settings = ConfigManager.get().explosions;
		this.warhead = profile.warhead();
		this.power = this.warhead.power * this.settings.blockDamageMultiplier;
		this.damage = this.warhead.damage * this.settings.entityDamageMultiplier;
		this.radius = this.warhead.radius * this.settings.blastRadiusMultiplier;
		this.knockback = this.warhead.knockback * this.settings.knockbackMultiplier;
		this.destroysTerrain = this.settings.terrainDamage && this.power > 0.05F;
		this.blastSource = ModDamageTypes.create(
			world, profile == ExplosionProfile.HYPERSONIC_MISSILE ? ModDamageTypes.MISSILE_STRIKE : ModDamageTypes.BLAST, source, owner
		);
	}

	/**
	 * Detonates a warhead.
	 *
	 * @param source the exploding entity (projectile), excluded from damage
	 * @param owner the entity responsible (credited for kills, subject to block protection)
	 * @param direction travel direction at impact; drives the shaped-charge jet and directional effects
	 */
	public static void detonate(ServerWorld world, Vec3d pos, ExplosionProfile profile, @Nullable Entity source, @Nullable Entity owner, Vec3d direction) {
		if (profile.style().isSmoke()) {
			// Smoke munitions don't explode; they vent a smoke screen.
			GrenadeEntity.ventSmoke(world, pos, profile, owner);
			return;
		}

		new OrdnanceExplosion(world, pos, profile, source, owner, direction).explode();
	}

	private void explode() {
		this.world.emitGameEvent(this.source, GameEvent.EXPLODE, this.pos);
		FluidState fluid = this.world.getFluidState(BlockPos.ofFloored(this.pos));
		this.underwater = fluid.isIn(FluidTags.WATER);

		LongSet blocks = this.destroysTerrain ? this.collectBlocks() : new LongOpenHashSet();
		if (this.settings.fragmentation && this.warhead.fragments > 0) {
			this.fireFragments();
		}

		this.damageEntities();
		List<DebrisEntity.Seed> debris = this.destroysTerrain ? DebrisEntity.sample(this.world, blocks, this.debrisCount(), this.random) : List.of();
		this.destroyBlocks(blocks, debris);
		DebrisEntity.launch(this.world, debris, this.pos, this.radius, this.warhead.visualScale, this.debrisBurnChance(), this.owner);

		if (!this.underwater) {
			this.igniteArea();
			if (this.settings.scorchMarks && this.warhead.scorchRadius > 0.0F) {
				TerrainEffects.scorch(this.world, this.pos, this.warhead.scorchRadius, this.random, this.owner, 1.0F);
			}
		}

		OrdnanceNetworking.sendExplosion(this.world, this.pos, this.profile, this.warhead.visualScale, this.direction, this.random.nextLong());
	}

	private int debrisCount() {
		if (!this.settings.flyingDebris) {
			return 0;
		}

		int count = Math.round(this.warhead.debris * this.settings.debrisMultiplier);
		return Math.min(count, this.settings.maxDebrisPerExplosion);
	}

	private float debrisBurnChance() {
		if (this.underwater) {
			return 0.0F;
		}

		return this.warhead.incendiary ? 0.8F : Math.min(0.9F, this.warhead.fireChance * 1.5F);
	}

	// ---------------------------------------------------------------- blocks

	private LongSet collectBlocks() {
		LongSet set = new LongOpenHashSet();
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int i = 0; i < 16; i++) {
			for (int j = 0; j < 16; j++) {
				for (int k = 0; k < 16; k++) {
					if (i != 0 && i != 15 && j != 0 && j != 15 && k != 0 && k != 15) {
						continue;
					}

					double dx = i / 15.0 * 2.0 - 1.0;
					double dy = j / 15.0 * 2.0 - 1.0;
					double dz = k / 15.0 * 2.0 - 1.0;
					double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
					dx /= len;
					dy /= len;
					dz /= len;
					float strength = this.power * (0.7F + this.random.nextFloat() * 0.6F);
					double x = this.pos.x;
					double y = this.pos.y;
					double z = this.pos.z;

					while (strength > 0.0F) {
						mutable.set(x, y, z);
						if (!this.world.isInBuildLimit(mutable)) {
							break;
						}

						BlockState state = this.world.getBlockState(mutable);
						FluidState fluid = this.world.getFluidState(mutable);
						if (!state.isAir() || !fluid.isEmpty()) {
							float resistance = Math.max(state.getBlock().getBlastResistance(), fluid.getBlastResistance());
							strength -= (resistance + 0.3F) * 0.3F;
							if (strength > 0.0F && this.canDestroy(mutable, state)) {
								set.add(mutable.asLong());
							}
						}

						x += dx * 0.3;
						y += dy * 0.3;
						z += dz * 0.3;
						strength -= 0.22500001F;
					}
				}
			}
		}

		if (this.settings.craters && this.warhead.craterRadius > 0.0F && !this.underwater) {
			this.carveCrater(set);
		}

		if (this.warhead.penetration > 0.0F) {
			this.penetrate(set);
		}

		if (this.power >= OVERPRESSURE_MIN_POWER && !this.underwater) {
			this.overpressure(set);
		}

		int limit = this.settings.maxBlocksPerExplosion;
		if (set.size() > limit) {
			LongSet trimmed = new LongOpenHashSet(limit);
			List<Long> sorted = new ArrayList<>(set);
			sorted.sort((a, b) -> Double.compare(BlockPos.fromLong(a).getSquaredDistance(this.pos), BlockPos.fromLong(b).getSquaredDistance(this.pos)));
			for (int i = 0; i < limit; i++) {
				trimmed.add((long)sorted.get(i));
			}

			return trimmed;
		}

		return set;
	}

	/** An explicit bowl so big warheads leave a convincing crater even in stone. */
	private void carveCrater(LongSet set) {
		float scale = MathHelper.sqrt(Math.max(0.0F, this.settings.blockDamageMultiplier));
		float craterRadius = this.warhead.craterRadius * scale;
		float craterDepth = Math.max(0.5F, this.warhead.craterDepth * scale);
		if (craterRadius < 0.5F) {
			return;
		}

		BlockPos center = BlockPos.ofFloored(this.pos);
		int r = MathHelper.ceil(craterRadius);
		int down = MathHelper.ceil(craterDepth);
		int up = MathHelper.ceil(craterRadius * 0.5F);
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int dx = -r; dx <= r; dx++) {
			for (int dz = -r; dz <= r; dz++) {
				for (int dy = -down; dy <= up; dy++) {
					double nx = dx / (double)craterRadius;
					double nz = dz / (double)craterRadius;
					double ny = dy < 0 ? dy / (double)craterDepth : dy / (craterRadius * 0.5);
					double edge = 1.0 + (this.random.nextDouble() - 0.5) * 0.35;
					if (nx * nx + ny * ny + nz * nz > edge) {
						continue;
					}

					mutable.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
					if (!this.world.isInBuildLimit(mutable)) {
						continue;
					}

					BlockState state = this.world.getBlockState(mutable);
					if (!state.isAir() && state.getBlock().getBlastResistance() <= CRATER_MAX_RESISTANCE && this.canDestroy(mutable, state)) {
						set.add(mutable.asLong());
					}
				}
			}
		}
	}

	/**
	 * The blast front of a very large warhead flattens trees and light buildings well beyond the crater, which the
	 * ray pass alone can't do (rays lose strength quickly in open air). Only blocks at or above the burst height go;
	 * the ground itself is left to the crater and scorching.
	 */
	private void overpressure(LongSet set) {
		float radius = this.power * 1.5F;
		int r = MathHelper.ceil(radius);
		int up = MathHelper.ceil(radius * 0.6F);
		BlockPos center = BlockPos.ofFloored(this.pos);
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int dx = -r; dx <= r; dx++) {
			for (int dz = -r; dz <= r; dz++) {
				for (int dy = 0; dy <= up; dy++) {
					double d = Math.sqrt(dx * dx + dz * dz + dy * dy * 2.5) / radius;
					if (d > 1.0 || this.random.nextFloat() > (1.0 - d) * 1.8) {
						continue;
					}

					mutable.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
					if (!this.world.isInBuildLimit(mutable) || set.contains(mutable.asLong())) {
						continue;
					}

					BlockState state = this.world.getBlockState(mutable);
					if (!state.isAir() && state.getBlock().getBlastResistance() <= OVERPRESSURE_MAX_RESISTANCE && this.canDestroy(mutable, state)) {
						set.add(mutable.asLong());
					}
				}
			}
		}
	}

	/** Shaped-charge jet: punches a narrow channel along the impact direction until its budget is spent. */
	private void penetrate(LongSet set) {
		double maxDistance = this.warhead.penetration * 2.0;
		double budget = this.warhead.penetration * 6.0 * this.settings.blockDamageMultiplier;
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		long last = Long.MIN_VALUE;
		for (double t = 0.0; t < maxDistance && budget > 0.0; t += 0.25) {
			mutable.set(this.pos.x + this.direction.x * t, this.pos.y + this.direction.y * t, this.pos.z + this.direction.z * t);
			long key = mutable.asLong();
			if (key == last) {
				continue;
			}

			last = key;
			if (!this.world.isInBuildLimit(mutable)) {
				break;
			}

			BlockState state = this.world.getBlockState(mutable);
			if (state.isAir()) {
				continue;
			}

			float resistance = Math.max(state.getBlock().getBlastResistance(), this.world.getFluidState(mutable).getBlastResistance());
			if (resistance >= 1200.0F || !this.canDestroy(mutable, state)) {
				break;
			}

			budget -= resistance + 1.0;
			set.add(key);
		}
	}

	private boolean canDestroy(BlockPos pos, BlockState state) {
		if (state.isAir() || state.getHardness(this.world, pos) < 0.0F || state.isIn(ModTags.EXPLOSION_PROOF)) {
			return false;
		}

		return !this.settings.respectBlockProtection || !(this.owner instanceof PlayerEntity player) || player.canModifyAt(this.world, pos);
	}

	private void destroyBlocks(LongSet set, List<DebrisEntity.Seed> debris) {
		if (set.isEmpty()) {
			return;
		}

		LongSet thrown = new LongOpenHashSet();
		for (DebrisEntity.Seed seed : debris) {
			thrown.add(seed.pos().asLong());
		}

		List<BlockPos> positions = new ArrayList<>(set.size());
		for (long key : set) {
			positions.add(BlockPos.fromLong(key));
		}

		Util.shuffle(positions, this.random);
		List<Drop> drops = new ArrayList<>();
		for (BlockPos blockPos : positions) {
			BlockState state = this.world.getBlockState(blockPos);
			if (state.isAir()) {
				continue;
			}

			if (!this.settings.dropBlocks || thrown.contains(blockPos.asLong())) {
				this.world.setBlockState(blockPos, Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
				state.getBlock().onDestroyedByExplosion(this.world, blockPos, this);
			} else {
				state.onExploded(this.world, blockPos, this, (stack, dropPos) -> mergeDrop(drops, stack, dropPos));
			}
		}

		for (Drop drop : drops) {
			Block.dropStack(this.world, drop.pos, drop.stack);
		}
	}

	private static void mergeDrop(List<Drop> drops, ItemStack stack, BlockPos pos) {
		for (Drop drop : drops) {
			if (ItemEntity.canMerge(drop.stack, stack)) {
				drop.stack = ItemEntity.merge(drop.stack, stack, 16);
				if (stack.isEmpty()) {
					return;
				}
			}
		}

		drops.add(new Drop(pos, stack));
	}

	// ---------------------------------------------------------------- entities

	private void damageEntities() {
		if (this.radius <= 0.0F || this.damage <= 0.0F && this.knockback <= 0.0F) {
			return;
		}

		float fireRadius = this.underwater ? 0.0F : this.warhead.fireRadius * this.settings.blastRadiusMultiplier;
		Box box = new Box(this.pos, this.pos).expand(this.radius + 1.0);
		float waveSpeed = this.settings.blastWaveSpeed;
		for (Entity entity : this.world.getOtherEntities(this.source, box)) {
			if (entity.isImmuneToExplosion(this) || entity instanceof DebrisEntity) {
				continue;
			}

			Vec3d center = entity.getBoundingBox().getCenter();
			double distance = center.distanceTo(this.pos);
			if (distance > this.radius) {
				continue;
			}

			float exposure = ExplosionImpl.calculateReceivedDamage(this.pos, entity);
			if (distance < 1.5) {
				exposure = Math.max(exposure, 0.6F);
			}

			if (exposure <= 0.001F) {
				continue;
			}

			double falloff = 1.0 - distance / this.radius;
			float hitDamage = (float)(this.damage * Math.pow(falloff, 1.6) * exposure);
			double resistance = entity instanceof LivingEntity living ? living.getAttributeValue(EntityAttributes.EXPLOSION_KNOCKBACK_RESISTANCE) : 0.0;
			Vec3d away = center.subtract(this.pos);
			away = away.lengthSquared() < 1.0E-4 ? new Vec3d(0.0, 1.0, 0.0) : away.normalize();
			double push = this.knockback * falloff * exposure * (1.0 - resistance);
			Vec3d impulse = away.multiply(push).add(0.0, push * 0.25, 0.0);
			float ignite = distance <= fireRadius ? this.warhead.igniteSeconds : 0.0F;
			BlastWaveManager.Hit hit = new BlastWaveManager.Hit(entity, hitDamage, this.blastSource, impulse, ignite, this.source);
			BlastWaveManager.schedule(this.world, hit, (int)(distance / waveSpeed));
		}
	}

	/** Fragments are hitscan rays; they are faster than the blast front so they land immediately. */
	private void fireFragments() {
		float range = this.warhead.fragmentRange * this.settings.blastRadiusMultiplier;
		List<Entity> candidates = this.world.getOtherEntities(this.source, new Box(this.pos, this.pos).expand(range), e -> e.isAlive() && !(e instanceof DebrisEntity));
		Map<Entity, Float> hits = new HashMap<>();
		DamageSource shrapnel = ModDamageTypes.create(this.world, ModDamageTypes.SHRAPNEL, this.source, this.owner);
		for (int i = 0; i < this.warhead.fragments; i++) {
			Vec3d dir = randomDirection(this.random);
			Vec3d end = this.pos.add(dir.multiply(range));
			BlockHitResult blockHit = this.world.raycast(new RaycastContext(this.pos, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, this.source == null ? net.minecraft.block.ShapeContext.absent() : net.minecraft.block.ShapeContext.of(this.source)));
			if (blockHit.getType() != HitResult.Type.MISS) {
				end = blockHit.getPos();
				if (this.settings.fragmentsBreakGlass && this.destroysTerrain) {
					BlockPos hitPos = blockHit.getBlockPos();
					BlockState state = this.world.getBlockState(hitPos);
					if (state.isIn(ModTags.SHATTERABLE) && this.canDestroy(hitPos, state)) {
						this.world.breakBlock(hitPos, false, this.source);
					}
				}
			}

			Entity nearest = null;
			double nearestDistance = Double.MAX_VALUE;
			for (Entity candidate : candidates) {
				Optional<Vec3d> point = candidate.getBoundingBox().expand(0.1).raycast(this.pos, end);
				if (point.isPresent()) {
					double d = point.get().squaredDistanceTo(this.pos);
					if (d < nearestDistance) {
						nearestDistance = d;
						nearest = candidate;
					}
				}
			}

			if (nearest != null) {
				double t = Math.sqrt(nearestDistance) / range;
				float fragmentDamage = (float)(this.warhead.fragmentDamage * this.settings.entityDamageMultiplier * Math.sqrt(Math.max(0.0, 1.0 - t)));
				hits.merge(nearest, fragmentDamage, Float::sum);
			}
		}

		for (Map.Entry<Entity, Float> entry : hits.entrySet()) {
			Entity entity = entry.getKey();
			Vec3d away = entity.getBoundingBox().getCenter().subtract(this.pos).normalize();
			BlastWaveManager.apply(this.world, new BlastWaveManager.Hit(entity, entry.getValue(), shrapnel, away.multiply(0.05 * entry.getValue()), 0.0F, this.source));
		}
	}

	static Vec3d randomDirection(Random random) {
		double z = random.nextDouble() * 2.0 - 1.0;
		double angle = random.nextDouble() * Math.PI * 2.0;
		double r = Math.sqrt(1.0 - z * z);
		return new Vec3d(r * Math.cos(angle), z, r * Math.sin(angle));
	}

	// ---------------------------------------------------------------- fire

	private void igniteArea() {
		OrdnanceConfig.Explosions settings = this.settings;
		float fireRadius = this.warhead.fireRadius;
		if (!settings.createFires || this.warhead.fireChance <= 0.0F || fireRadius <= 0.0F) {
			return;
		}

		int attempts = MathHelper.ceil(fireRadius * fireRadius * 4.0F);
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int i = 0; i < attempts; i++) {
			double dx = (this.random.nextDouble() * 2.0 - 1.0) * fireRadius;
			double dy = (this.random.nextDouble() * 2.0 - 1.0) * fireRadius * 0.6;
			double dz = (this.random.nextDouble() * 2.0 - 1.0) * fireRadius;
			double d2 = (dx * dx + dz * dz) / (fireRadius * fireRadius) + dy * dy / (fireRadius * fireRadius * 0.36);
			if (d2 > 1.0 || this.random.nextFloat() > this.warhead.fireChance * (1.0 - 0.5 * Math.sqrt(d2))) {
				continue;
			}

			mutable.set(this.pos.x + dx, this.pos.y + dy, this.pos.z + dz);
			for (int k = 0; k < 4 && this.world.getBlockState(mutable).isAir() && this.world.getBlockState(mutable.down()).isAir(); k++) {
				mutable.move(0, -1, 0);
			}

			FireHelper.tryIgnite(this.world, mutable.toImmutable(), this.warhead.incendiary, this.owner);
		}

		if (this.warhead.incendiary) {
			int globs = MathHelper.ceil(fireRadius * 5.0F);
			for (int i = 0; i < globs; i++) {
				Vec3d dir = randomDirection(this.random);
				Vec3d velocity = new Vec3d(dir.x, Math.abs(dir.y) * 0.8 + 0.2, dir.z).multiply(0.25 + this.random.nextDouble() * 0.35 * fireRadius / 4.0);
				FlameStreamManager.spawnGlob(this.world, this.pos.add(0.0, 0.3, 0.0), velocity, this.owner, true);
			}
		}
	}

	// ---------------------------------------------------------------- Explosion

	@Override
	public ServerWorld getWorld() {
		return this.world;
	}

	@Override
	public Explosion.DestructionType getDestructionType() {
		return this.destroysTerrain ? Explosion.DestructionType.DESTROY_WITH_DECAY : Explosion.DestructionType.KEEP;
	}

	@Nullable
	@Override
	public LivingEntity getCausingEntity() {
		return this.owner instanceof LivingEntity living ? living : Explosion.getCausingEntity(this.source);
	}

	@Nullable
	@Override
	public Entity getEntity() {
		return this.source;
	}

	@Override
	public float getPower() {
		return Math.max(this.power, 1.0F);
	}

	@Override
	public Vec3d getPosition() {
		return this.pos;
	}

	@Override
	public boolean canTriggerBlocks() {
		return false;
	}

	@Override
	public boolean preservesDecorativeEntities() {
		return !this.destroysTerrain;
	}

	private static final class Drop {
		final BlockPos pos;
		ItemStack stack;

		Drop(BlockPos pos, ItemStack stack) {
			this.pos = pos;
			this.stack = stack;
		}
	}
}
