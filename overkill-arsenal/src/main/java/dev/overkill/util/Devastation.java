package dev.overkill.util;

import dev.overkill.block.ScorchedStoneBlock;
import dev.overkill.registry.ModBlocks;
import dev.overkill.registry.ModGameRules;
import net.fabricmc.fabric.api.tag.convention.v2.ConventionalBlockTags;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.FallingBlockEntity;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FallingBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Everything the weapons do to terrain: scorch marks, molten linings, glassed sand, burning rims,
 * ash fall, flying debris and huge budgeted crater carving.
 */
public final class Devastation {
	/** Max block edits per tick for a crater job, so even the biggest blast never freezes the server. */
	private static final int BLOCK_BUDGET_PER_TICK = 5000;

	/** How a crater's walls get treated. */
	public enum Lining {
		/** Molten rock, magma, scorched stone, burning rim. */
		INFERNO,
		/** Obsidian, crying obsidian and blackstone, rim covered in ash but not burning. */
		VOID
	}

	private Devastation() {
	}

	public static boolean isUnbreakable(ServerLevel level, BlockPos pos, BlockState state) {
		return state.getDestroySpeed(level, pos) < 0.0F;
	}

	// ------------------------------------------------------------------------------------------
	// Single-block treatments
	// ------------------------------------------------------------------------------------------

	/**
	 * Heat-treats one block. {@code heat} is 0..1 (1 = point blank). Stone turns to scorched stone,
	 * molten rock or magma, sand fuses to glass, soil chars, ice melts, plants and leaves burn.
	 */
	public static void scorchBlock(ServerLevel level, BlockPos pos, RandomSource random, float heat) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		BlockState state = level.getBlockState(pos);
		if (state.isAir() || isUnbreakable(level, pos, state) || state.hasBlockEntity()) {
			return;
		}
		FluidState fluid = state.getFluidState();
		if (!fluid.isEmpty()) {
			if (state.is(Blocks.WATER) && heat > 0.6F && random.nextFloat() < 0.35F) {
				level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
				level.sendParticles(ParticleTypes.CLOUD, pos.getX() + 0.5, pos.getY() + 0.8, pos.getZ() + 0.5, 3, 0.3, 0.2, 0.3, 0.02);
			}
			return;
		}
		if (state.is(ConventionalBlockTags.ORES)) {
			return;
		}
		if (state.is(BlockTags.LEAVES) || (state.canBeReplaced() && !state.isSolidRender())) {
			if (random.nextFloat() < 0.4F && ModGameRules.fire(level) && canHoldFire(level, pos)) {
				level.setBlock(pos, BaseFireBlock.getState(level, pos), Block.UPDATE_ALL);
			} else {
				level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
			}
			return;
		}
		if (state.is(BlockTags.SNOW) || state.is(Blocks.SNOW_BLOCK) || state.is(Blocks.POWDER_SNOW)) {
			level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
			return;
		}
		if (state.is(BlockTags.ICE)) {
			level.setBlock(pos, Blocks.WATER.defaultBlockState(), Block.UPDATE_ALL);
			return;
		}
		if (state.is(BlockTags.SAND)) {
			if (random.nextFloat() < 0.35F + heat * 0.5F) {
				level.setBlock(pos, random.nextInt(6) == 0 ? Blocks.TINTED_GLASS.defaultBlockState() : Blocks.GLASS.defaultBlockState(), Block.UPDATE_ALL);
			}
			return;
		}
		if (state.is(BlockTags.LOGS)) {
			if (ModGameRules.fire(level)) {
				igniteAround(level, pos, random);
			}
			return;
		}
		if (state.is(Blocks.GRASS_BLOCK) || state.is(Blocks.MYCELIUM) || state.is(Blocks.PODZOL) || state.is(Blocks.DIRT_PATH)
			|| state.is(Blocks.MOSS_BLOCK) || state.is(Blocks.ROOTED_DIRT)) {
			level.setBlock(pos, random.nextFloat() < heat * 0.5F ? hotScorched() : Blocks.COARSE_DIRT.defaultBlockState(), Block.UPDATE_ALL);
			return;
		}
		if (!state.isSolidRender()) {
			if (state.ignitedByLava() && ModGameRules.fire(level)) {
				igniteAround(level, pos, random);
			}
			return;
		}
		float roll = random.nextFloat();
		float molten = 0.08F + heat * 0.27F;
		if (roll < molten) {
			level.setBlock(pos, ModBlocks.MOLTEN_ROCK.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < molten + 0.42F) {
			level.setBlock(pos, hotScorched(), Block.UPDATE_ALL);
		} else if (roll < molten + 0.50F) {
			level.setBlock(pos, Blocks.MAGMA_BLOCK.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < molten + 0.56F) {
			level.setBlock(pos, Blocks.BLACKSTONE.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < molten + 0.61F) {
			level.setBlock(pos, Blocks.BASALT.defaultBlockState(), Block.UPDATE_ALL);
		} else if (state.ignitedByLava() && ModGameRules.fire(level)) {
			igniteAround(level, pos, random);
		}
	}

	/** Puts fire, smoldering ash or plain ash on top of a solid surface block. */
	public static void dressSurface(ServerLevel level, BlockPos ground, RandomSource random, float heat) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		BlockPos above = ground.above();
		BlockState aboveState = level.getBlockState(above);
		if (!aboveState.isAir() && !(aboveState.canBeReplaced() && aboveState.getFluidState().isEmpty())) {
			return;
		}
		BlockState groundState = level.getBlockState(ground);
		if (!groundState.isFaceSturdy(level, ground, Direction.UP)) {
			return;
		}
		float roll = random.nextFloat();
		if (roll < 0.16F * heat && ModGameRules.fire(level)) {
			level.setBlock(above, BaseFireBlock.getState(level, above), Block.UPDATE_ALL);
		} else if (roll < 0.16F * heat + 0.30F * heat) {
			level.setBlock(above, ModBlocks.SMOLDERING_ASH.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < 0.16F * heat + 0.30F * heat + 0.18F) {
			level.setBlock(above, ModBlocks.ASH_LAYER.defaultBlockState(), Block.UPDATE_ALL);
		} else if (!aboveState.isAir()) {
			level.setBlock(above, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
		}
	}

	/** Void-touched stone: obsidian, crying obsidian and blackstone. */
	public static void voidifyBlock(ServerLevel level, BlockPos pos, RandomSource random) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		BlockState state = level.getBlockState(pos);
		if (!state.isSolidRender() || state.hasBlockEntity() || isUnbreakable(level, pos, state) || state.is(ConventionalBlockTags.ORES)) {
			return;
		}
		float roll = random.nextFloat();
		if (roll < 0.22F) {
			level.setBlock(pos, Blocks.OBSIDIAN.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < 0.32F) {
			level.setBlock(pos, Blocks.CRYING_OBSIDIAN.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < 0.57F) {
			level.setBlock(pos, Blocks.BLACKSTONE.defaultBlockState(), Block.UPDATE_ALL);
		} else if (roll < 0.65F) {
			level.setBlock(pos, hotScorched(), Block.UPDATE_ALL);
		}
	}

	private static void ashOnly(ServerLevel level, BlockPos ground, RandomSource random, float heat) {
		BlockPos above = ground.above();
		BlockState aboveState = level.getBlockState(above);
		if ((aboveState.isAir() || aboveState.canBeReplaced() && aboveState.getFluidState().isEmpty())
			&& level.getBlockState(ground).isFaceSturdy(level, ground, Direction.UP) && random.nextFloat() < 0.35F * heat + 0.1F) {
			level.setBlock(above, ModBlocks.ASH_LAYER.defaultBlockState(), Block.UPDATE_ALL);
		}
	}

	public static BlockState hotScorched() {
		return ModBlocks.SCORCHED_STONE.defaultBlockState().setValue(ScorchedStoneBlock.HOT, true);
	}

	private static boolean canHoldFire(ServerLevel level, BlockPos pos) {
		BlockPos below = pos.below();
		return level.getBlockState(below).isFaceSturdy(level, below, Direction.UP);
	}

	private static void igniteAround(ServerLevel level, BlockPos pos, RandomSource random) {
		Direction direction = Direction.getRandom(random);
		BlockPos side = pos.relative(direction);
		if (level.getBlockState(side).isAir()) {
			level.setBlock(side, BaseFireBlock.getState(level, side), Block.UPDATE_ALL);
		}
	}

	private static boolean isExposed(ServerLevel level, BlockPos pos) {
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		for (Direction direction : Direction.values()) {
			cursor.setWithOffset(pos, direction);
			BlockState neighbor = level.getBlockState(cursor);
			if (neighbor.isAir() || neighbor.is(Blocks.FIRE)) {
				return true;
			}
		}
		return false;
	}

	// ------------------------------------------------------------------------------------------
	// Area treatments
	// ------------------------------------------------------------------------------------------

	/** Chars every exposed block in a ragged sphere and dresses the ground with fire and ash. */
	public static void scorchSphere(ServerLevel level, Vec3 center, double radius, RandomSource random) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		Noise noise = new Noise(random.nextLong(), 2.5);
		int r = Mth.ceil(radius + 1);
		BlockPos origin = BlockPos.containing(center);
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		for (int dx = -r; dx <= r; dx++) {
			for (int dy = -r; dy <= r; dy++) {
				for (int dz = -r; dz <= r; dz++) {
					cursor.set(origin.getX() + dx, origin.getY() + dy, origin.getZ() + dz);
					if (!level.isInWorldBounds(cursor)) {
						continue;
					}
					double dist = Math.sqrt(cursor.distToCenterSqr(center));
					double edge = radius * (1.0 + 0.3 * noise.sample(cursor.getX(), cursor.getY(), cursor.getZ()));
					if (dist > edge) {
						continue;
					}
					BlockState state = level.getBlockState(cursor);
					if (state.isAir()) {
						continue;
					}
					float heat = (float) Mth.clamp(1.0 - dist / Math.max(edge, 0.01), 0.0, 1.0);
					BlockPos pos = cursor.immutable();
					if (isExposed(level, pos)) {
						scorchBlock(level, pos, random, heat);
						if (level.getBlockState(pos.above()).isAir() && random.nextFloat() < 0.75F) {
							dressSurface(level, pos, random, Math.max(heat, 0.35F));
						}
					}
				}
			}
		}
	}

	/** Splashes molten rock over the exposed surfaces near an impact point. */
	public static void moltenSplash(ServerLevel level, Vec3 center, double radius, RandomSource random) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		int r = Mth.ceil(radius);
		BlockPos origin = BlockPos.containing(center);
		for (int i = 0; i < r * r * 6; i++) {
			BlockPos pos = origin.offset(random.nextInt(2 * r + 1) - r, random.nextInt(2 * r + 1) - r, random.nextInt(2 * r + 1) - r);
			if (pos.distToCenterSqr(center) > radius * radius) {
				continue;
			}
			BlockState state = level.getBlockState(pos);
			if (state.isSolidRender() && !state.hasBlockEntity() && !isUnbreakable(level, pos, state) && !state.is(ConventionalBlockTags.ORES)
				&& isExposed(level, pos)) {
				level.setBlock(pos, random.nextInt(3) == 0 ? Blocks.MAGMA_BLOCK.defaultBlockState() : ModBlocks.MOLTEN_ROCK.defaultBlockState(), Block.UPDATE_ALL);
			}
		}
	}

	/**
	 * Launches surface blocks around {@code center} as falling-block debris that rains down around
	 * the blast. Debris that cannot land simply crumbles (no item spam).
	 */
	public static void ejectDebris(ServerLevel level, Vec3 center, double radius, int count, double power, RandomSource random) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		int launched = 0;
		int r = Math.max(1, Mth.ceil(radius));
		BlockPos origin = BlockPos.containing(center);
		for (int attempt = 0; attempt < count * 8 && launched < count; attempt++) {
			BlockPos column = origin.offset(random.nextInt(2 * r + 1) - r, 0, random.nextInt(2 * r + 1) - r);
			BlockPos pos = null;
			for (int dy = r; dy >= -r; dy--) {
				BlockPos candidate = column.above(dy);
				BlockState state = level.getBlockState(candidate);
				if (!state.isAir() && level.getBlockState(candidate.above()).isAir()) {
					pos = candidate;
					break;
				}
			}
			if (pos == null) {
				continue;
			}
			BlockState state = level.getBlockState(pos);
			if (!state.isCollisionShapeFullBlock(level, pos) || state.hasBlockEntity() || isUnbreakable(level, pos, state) || !state.getFluidState().isEmpty()) {
				continue;
			}
			FallingBlockEntity debris = FallingBlockEntity.fall(level, pos, state);
			Vec3 out = new Vec3(pos.getX() + 0.5 - center.x, 0.0, pos.getZ() + 0.5 - center.z);
			out = out.lengthSqr() < 1.0E-4 ? new Vec3(random.nextDouble() - 0.5, 0, random.nextDouble() - 0.5).normalize() : out.normalize();
			double speed = power * (0.45 + random.nextDouble() * 0.55);
			debris.setDeltaMovement(out.x * speed, power * (0.7 + random.nextDouble() * 0.7), out.z * speed);
			debris.hurtMarked = true;
			debris.dropItem = false;
			debris.setHurtsEntities(1.5F, 30);
			launched++;
		}
	}

	// ------------------------------------------------------------------------------------------
	// Craters
	// ------------------------------------------------------------------------------------------

	/**
	 * Carves a ragged funnel from {@code entry} (radius {@code entryRadius}) to {@code end} (radius
	 * {@code endRadius}), plus a blast sphere of {@code blastRadius} at {@code end}. The walls are
	 * lined with molten and scorched rock, water and sand are woken up so they pour in, and the rim
	 * is left burning and covered in ash. Work is spread over several ticks.
	 */
	public static void crater(ServerLevel level, Vec3 entry, Vec3 end, double entryRadius, double endRadius, double blastRadius,
		@Nullable Entity cause, int debris, Lining lining) {
		if (!ModGameRules.terrain(level)) {
			return;
		}
		RandomSource random = level.random;
		CraterShape shape = new CraterShape(entry, end, entryRadius, endRadius, blastRadius, new Noise(random.nextLong(), 3.5));
		AABB box = shape.bounds().inflate(2.0);
		int minY = Math.max(level.getMinY(), Mth.floor(box.minY));
		int maxY = Math.min(level.getMaxY(), Mth.ceil(box.maxY));

		List<BlockPos> carve = new ArrayList<>();
		List<BlockPos> shell = new ArrayList<>();
		for (int x = Mth.floor(box.minX); x <= Mth.ceil(box.maxX); x++) {
			for (int z = Mth.floor(box.minZ); z <= Mth.ceil(box.maxZ); z++) {
				for (int y = minY; y <= maxY; y++) {
					double field = shape.field(x + 0.5, y + 0.5, z + 0.5);
					if (field <= 0.0) {
						carve.add(new BlockPos(x, y, z));
					} else if (field <= 1.8) {
						shell.add(new BlockPos(x, y, z));
					}
				}
			}
		}
		carve.sort(Comparator.comparingDouble(pos -> pos.distToCenterSqr(end)));

		ejectDebris(level, entry, entryRadius * 0.8, debris, 0.9 + entryRadius * 0.06, random);
		ServerProcesses.add(level, new CraterJob(carve, shell, entry, Math.max(entryRadius, blastRadius), cause, lining));
	}

	private record CraterShape(Vec3 a, Vec3 b, double radiusA, double radiusB, double blastRadius, Noise noise) {
		/** Negative inside the crater, positive outside (roughly in blocks). */
		double field(double x, double y, double z) {
			double jitter = 1.0 + 0.16 * this.noise.sample(x, y, z);
			Vec3 p = new Vec3(x, y, z);
			double sphere = p.distanceTo(this.b) - this.blastRadius * jitter;
			Vec3 seg = this.b.subtract(this.a);
			double len2 = seg.lengthSqr();
			if (len2 < 1.0E-3) {
				return sphere;
			}
			double t = Mth.clamp(p.subtract(this.a).dot(seg) / len2, 0.0, 1.0);
			Vec3 closest = this.a.add(seg.scale(t));
			double funnel = p.distanceTo(closest) - Mth.lerp(t, this.radiusA, this.radiusB) * jitter;
			return Math.min(sphere, funnel);
		}

		AABB bounds() {
			double rb = Math.max(this.radiusB, this.blastRadius) * 1.2;
			double ra = this.radiusA * 1.2;
			return new AABB(
				Math.min(this.a.x - ra, this.b.x - rb), Math.min(this.a.y - ra, this.b.y - rb), Math.min(this.a.z - ra, this.b.z - rb),
				Math.max(this.a.x + ra, this.b.x + rb), Math.max(this.a.y + ra, this.b.y + rb), Math.max(this.a.z + ra, this.b.z + rb));
		}
	}

	/** Spreads crater work over ticks: carve (centre outwards), line the walls, then dress the rim. */
	private static final class CraterJob implements ServerProcesses.Process {
		private final List<BlockPos> carve;
		private final List<BlockPos> shell;
		private final Vec3 entry;
		private final double rimRadius;
		private final @Nullable Entity cause;
		private final Lining lining;
		private int carveIndex;
		private int shellIndex;
		private boolean rimDone;

		CraterJob(List<BlockPos> carve, List<BlockPos> shell, Vec3 entry, double rimRadius, @Nullable Entity cause, Lining lining) {
			this.carve = carve;
			this.shell = shell;
			this.entry = entry;
			this.rimRadius = rimRadius;
			this.cause = cause;
			this.lining = lining;
		}

		@Override
		public boolean tick(ServerLevel level) {
			int budget = BLOCK_BUDGET_PER_TICK;
			RandomSource random = level.random;
			while (budget > 0 && this.carveIndex < this.carve.size()) {
				BlockPos pos = this.carve.get(this.carveIndex++);
				BlockState state = level.getBlockState(pos);
				if (state.isAir() || isUnbreakable(level, pos, state)) {
					continue;
				}
				budget--;
				if (state.hasBlockEntity()) {
					level.destroyBlock(pos, true, this.cause);
				} else {
					level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
				}
			}
			while (budget > 0 && this.carveIndex >= this.carve.size() && this.shellIndex < this.shell.size()) {
				BlockPos pos = this.shell.get(this.shellIndex++);
				budget--;
				BlockState state = level.getBlockState(pos);
				if (state.isAir()) {
					continue;
				}
				FluidState fluid = state.getFluidState();
				if (!fluid.isEmpty()) {
					level.scheduleTick(pos, fluid.getType(), fluid.getType().getTickDelay(level));
					continue;
				}
				if (state.getBlock() instanceof FallingBlock) {
					level.scheduleTick(pos, state.getBlock(), 2 + random.nextInt(20));
					continue;
				}
				if (isExposed(level, pos)) {
					if (this.lining == Lining.VOID) {
						voidifyBlock(level, pos, random);
					} else {
						scorchBlock(level, pos, random, 0.9F);
					}
				}
			}
			if (this.carveIndex >= this.carve.size() && this.shellIndex >= this.shell.size() && !this.rimDone) {
				this.rimDone = true;
				this.dressRim(level, random);
				return true;
			}
			return false;
		}

		private void dressRim(ServerLevel level, RandomSource random) {
			double outer = this.rimRadius * 2.4 + 4;
			int r = Mth.ceil(outer);
			BlockPos origin = BlockPos.containing(this.entry);
			BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					double dist = Math.sqrt(dx * dx + dz * dz);
					if (dist > outer) {
						continue;
					}
					float heat = (float) Mth.clamp(1.15 - dist / outer, 0.0, 1.0);
					if (random.nextFloat() > 0.25F + heat) {
						continue;
					}
					for (int dy = 8; dy >= -10; dy--) {
						cursor.set(origin.getX() + dx, origin.getY() + dy, origin.getZ() + dz);
						BlockState state = level.getBlockState(cursor);
						if (!state.isAir() && state.getFluidState().isEmpty() && level.getBlockState(cursor.above()).isAir()) {
							BlockPos ground = cursor.immutable();
							if (this.lining == Lining.VOID) {
								if (dist < this.rimRadius * 1.4 && random.nextFloat() < heat * 0.6F) {
									voidifyBlock(level, ground, random);
								}
								ashOnly(level, ground, random, heat);
							} else {
								if (dist < this.rimRadius * 1.6 && random.nextFloat() < heat) {
									scorchBlock(level, ground, random, heat * 0.8F);
								}
								dressSurface(level, ground, random, heat);
							}
							break;
						}
					}
				}
			}
		}
	}
}
