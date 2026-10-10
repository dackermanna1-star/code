package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.earthscapes.block.VictoriaLilyPadBlock;
import net.earthscapes.registry.EsBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;

/** Floats colonies of giant Victoria water lily pads on calm, open water. */
public class VictoriaLilyFeature extends Feature<VictoriaLilyFeature.Config> {
	public record Config(IntProvider count, int spread) implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			IntProvider.codec(1, 64).fieldOf("count").forGetter(Config::count),
			Codec.intRange(0, 15).optionalFieldOf("spread", 7).forGetter(Config::spread)
		).apply(instance, Config::new));
	}

	public VictoriaLilyFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		Config config = context.config();
		if (!(EsBlocks.VICTORIA_LILY_PAD instanceof VictoriaLilyPadBlock pad)) {
			return false;
		}
		int placed = 0;
		int attempts = config.count().sample(random);
		for (int i = 0; i < attempts * 3 && placed < attempts; i++) {
			int x = origin.getX() + random.nextInt(config.spread() * 2 + 1) - config.spread();
			int z = origin.getZ() + random.nextInt(config.spread() * 2 + 1) - config.spread();
			BlockPos centre = new BlockPos(x, EsFeatureUtil.surface(level, x, z), z);
			if (pad.canPlacePad(level, centre)) {
				pad.placePad(level, centre, Block.UPDATE_CLIENTS);
				placed++;
			}
		}
		return placed > 0;
	}
}
