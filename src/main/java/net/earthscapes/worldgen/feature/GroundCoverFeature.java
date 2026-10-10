package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderSet;
import net.minecraft.core.RegistryCodecs;
import net.minecraft.core.registries.Registries;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.stateproviders.BlockStateProvider;

/**
 * Carpets a whole chunk with ground vegetation in one pass: every open surface column gets a plant
 * with a probability that varies smoothly across the world, so grass seas, forest floors and
 * steppe swards are dense but naturally patchy and continuous over chunk borders. Restricted to
 * the listed biomes so each biome's cover stays inside its own borders.
 */
public class GroundCoverFeature extends Feature<GroundCoverFeature.Config> {
	public record Config(BlockStateProvider state, float density, float noiseScale, float noiseInfluence, Optional<HolderSet<Biome>> biomes, int salt)
		implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockStateProvider.CODEC.fieldOf("state").forGetter(Config::state),
			Codec.floatRange(0.0F, 1.0F).fieldOf("density").forGetter(Config::density),
			Codec.floatRange(1.0F, 1024.0F).optionalFieldOf("noise_scale", 24.0F).forGetter(Config::noiseScale),
			Codec.floatRange(0.0F, 1.0F).optionalFieldOf("noise_influence", 0.6F).forGetter(Config::noiseInfluence),
			RegistryCodecs.homogeneousList(Registries.BIOME).optionalFieldOf("biomes").forGetter(Config::biomes),
			Codec.INT.optionalFieldOf("salt", 0).forGetter(Config::salt)
		).apply(instance, Config::new));
	}

	public GroundCoverFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		RandomSource random = context.random();
		Config config = context.config();
		ChunkPos chunk = new ChunkPos(context.origin());
		Geo.Noise2 noise = new Geo.Noise2(level.getSeed() * 31L + config.salt(), config.noiseScale());
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int placed = 0;
		for (int dx = 0; dx < 16; dx++) {
			for (int dz = 0; dz < 16; dz++) {
				int x = chunk.getMinBlockX() + dx;
				int z = chunk.getMinBlockZ() + dz;
				pos.set(x, level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z), z);
				if (!level.isEmptyBlock(pos)) {
					continue;
				}
				double n = 0.5 + 0.5 * noise.sample(x, z);
				double p = config.density() * (1.0 - config.noiseInfluence() + config.noiseInfluence() * n * 1.6);
				if (random.nextFloat() >= p) {
					continue;
				}
				if (config.biomes().isPresent() && !config.biomes().get().contains(level.getBiome(pos))) {
					continue;
				}
				BlockState state = config.state().getState(random, pos);
				if (state.isAir() || !state.canSurvive(level, pos)) {
					continue;
				}
				if (state.getBlock() instanceof DoublePlantBlock) {
					if (!level.isEmptyBlock(pos.above())) {
						continue;
					}
					DoublePlantBlock.placeAt(level, state, pos, Block.UPDATE_CLIENTS);
				} else {
					level.setBlock(pos, state, Block.UPDATE_CLIENTS);
				}
				placed++;
			}
		}
		return placed > 0;
	}
}
