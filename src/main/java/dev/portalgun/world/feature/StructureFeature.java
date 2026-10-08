package dev.portalgun.world.feature;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Map;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import org.jetbrains.annotations.Nullable;

/**
 * {@code portalgun:structure} - parametric landmarks built in code. Kinds (roles): arch (main), ring (main, alt),
 * gear (main, axle), ribcage (bone, spine), lily_pad (pad, flower, vein), monolith (main), geyser (vent, mound),
 * cuboids (main, alt, trim), tendril (main, tip), nest (main, egg). See {@link Structures} for the params of each.
 */
public class StructureFeature extends Feature<StructureFeature.Config> {
	public record Config(String kind, Map<String, BlockState> blocks, IntProvider size, Map<String, Float> params)
		implements FeatureConfiguration {
		public static final Codec<Config> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.STRING.fieldOf("kind").forGetter(Config::kind),
			Codec.unboundedMap(Codec.STRING, BlockState.CODEC).fieldOf("blocks").forGetter(Config::blocks),
			IntProvider.CODEC.fieldOf("size").forGetter(Config::size),
			Codec.unboundedMap(Codec.STRING, Codec.FLOAT).optionalFieldOf("params", Map.of()).forGetter(Config::params)
		).apply(i, Config::new));

		/** The block for a role, falling back to "main" and then to any configured block. */
		public BlockState role(String role, String... fallbacks) {
			BlockState s = this.blocks.get(role);
			if (s != null) {
				return s;
			}
			for (String f : fallbacks) {
				s = this.blocks.get(f);
				if (s != null) {
					return s;
				}
			}
			s = this.blocks.get("main");
			if (s != null) {
				return s;
			}
			return this.blocks.isEmpty() ? Blocks.STONE.defaultBlockState() : this.blocks.values().iterator().next();
		}

		public @Nullable BlockState optionalRole(String role) {
			return this.blocks.get(role);
		}

		public float param(String name, float def) {
			Float f = this.params.get(name);
			return f != null && Float.isFinite(f) ? f : def;
		}
	}

	public StructureFeature(Codec<Config> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<Config> ctx) {
		Config c = ctx.config();
		try {
			Placer p = new Placer(ctx);
			RandomSource rnd = ctx.random();
			int size = c.size().sample(rnd);
			return switch (c.kind()) {
				case "arch" -> Structures.arch(p, c, size);
				case "ring" -> Structures.ring(p, c, size);
				case "gear" -> Structures.gear(p, c, size);
				case "ribcage" -> Structures.ribcage(p, c, size);
				case "lily_pad" -> Structures.lilyPad(p, c, size);
				case "monolith" -> Structures.monolith(p, c, size);
				case "geyser" -> Structures.geyser(p, c, size);
				case "cuboids" -> Structures.cuboids(p, c, size);
				case "tendril" -> Structures.tendril(p, c, size);
				case "nest" -> Structures.nest(p, c, size);
				default -> {
					FeatureErrors.report("structure/" + c.kind(), new IllegalArgumentException("Unknown structure kind " + c.kind()));
					yield false;
				}
			};
		} catch (RuntimeException e) {
			FeatureErrors.report("structure/" + c.kind(), e);
			return false;
		}
	}
}
