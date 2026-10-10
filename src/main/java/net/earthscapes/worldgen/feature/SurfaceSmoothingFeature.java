package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.earthscapes.block.SandLayerBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;

/**
 * Turns the top block of every column of a chunk into a partial layer that matches the exact,
 * sub-block height of the generated terrain, so dunes show smooth curves rather than steps.
 * <p>
 * The terrain of these worlds is a height field: inside each 4-block noise cell the surface is the
 * bilinear interpolation of the {@code preliminary_surface_level} function at the cell corners.
 * Re-evaluating that function here recovers the fractional surface height of every column.
 */
public class SurfaceSmoothingFeature extends Feature<SurfaceSmoothingFeature.Config> {
	public record Config(BlockState from, BlockState layer) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockState.CODEC.fieldOf("from").forGetter(Config::from),
			BlockState.CODEC.fieldOf("layer").forGetter(Config::layer)
		).apply(instance, Config::new));
	}

	private static final int CELL = 4;

	public SurfaceSmoothingFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		Config config = context.config();
		if (!config.layer().hasProperty(SandLayerBlock.LAYERS)) {
			return false;
		}
		DensityFunction surface = level.getLevel().getChunkSource().randomState().router().preliminarySurfaceLevel();
		ChunkPos chunk = new ChunkPos(context.origin());
		int minX = chunk.getMinBlockX();
		int minZ = chunk.getMinBlockZ();
		// corner heights of the 4x4 grid of noise cells covering this chunk (5x5 corners)
		double[][] corners = new double[5][5];
		for (int i = 0; i <= 4; i++) {
			for (int j = 0; j <= 4; j++) {
				corners[i][j] = surface.compute(new DensityFunction.SinglePointContext(minX + i * CELL, 0, minZ + j * CELL));
			}
		}
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		boolean changed = false;
		for (int dx = 0; dx < 16; dx++) {
			for (int dz = 0; dz < 16; dz++) {
				int x = minX + dx;
				int z = minZ + dz;
				int top = level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z) - 1;
				pos.set(x, top, z);
				if (!level.getBlockState(pos).is(config.from().getBlock()) || !level.getBlockState(pos.above()).isAir()) {
					continue;
				}
				int ci = dx / CELL;
				int cj = dz / CELL;
				double tx = (dx % CELL) / (double) CELL;
				double tz = (dz % CELL) / (double) CELL;
				double h = Mth.lerp(tz, Mth.lerp(tx, corners[ci][cj], corners[ci + 1][cj]), Mth.lerp(tx, corners[ci][cj + 1], corners[ci + 1][cj + 1]));
				double fraction = h - top;
				if (fraction <= 0.0 || fraction > 1.02) {
					continue; // something else (a cave, a structure) changed this column
				}
				int layers = Mth.clamp((int) Math.round(fraction * 8.0), 1, 8);
				if (layers < 8) {
					level.setBlock(pos, config.layer().setValue(SandLayerBlock.LAYERS, layers), Block.UPDATE_CLIENTS);
					changed = true;
				}
			}
		}
		return changed;
	}
}
