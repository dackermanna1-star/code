package com.modernapartments.world;

import com.modernapartments.ModConfig;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.registry.ModStructures;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Arrays;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * World-generation structure for one apartment complex. Picks a reasonably flat site, then adds a
 * single {@link ApartmentPiece} that copies the generated building chunk by chunk.
 */
public class ApartmentStructure extends Structure {
	private static final Codec<ComplexType> COMPLEX_CODEC = Codec.STRING.comapFlatMap(id -> {
		ComplexType t = ComplexType.byId(id);
		return t == null ? DataResult.error(() -> "Unknown apartment complex " + id) : DataResult.success(t);
	}, ComplexType::id);

	public static final MapCodec<ApartmentStructure> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		settingsCodec(instance),
		COMPLEX_CODEC.fieldOf("complex").forGetter(s -> s.complex),
		Codec.INT.optionalFieldOf("max_slope", 10).forGetter(s -> s.maxSlope)
	).apply(instance, ApartmentStructure::new));

	private final ComplexType complex;
	private final int maxSlope;

	public ApartmentStructure(StructureSettings settings, ComplexType complex, int maxSlope) {
		super(settings);
		this.complex = complex;
		this.maxSlope = maxSlope;
	}

	public ComplexType complex() {
		return complex;
	}

	@Override
	protected Optional<GenerationStub> findGenerationPoint(GenerationContext context) {
		if (!ModConfig.get().naturalGeneration) {
			return Optional.empty();
		}
		ChunkPos chunk = context.chunkPos();
		Rotation rotation = Rotation.getRandom(context.random());
		PlacementTransform probe = new PlacementTransform(BlockPos.ZERO, rotation, complex.sizeX(), complex.sizeY(), complex.sizeZ());
		int minX = chunk.getMiddleBlockX() - probe.footprintX() / 2;
		int minZ = chunk.getMiddleBlockZ() - probe.footprintZ() / 2;
		int[] samples = new int[9];
		int i = 0;
		for (int sx = 0; sx < 3; sx++) {
			for (int sz = 0; sz < 3; sz++) {
				int x = minX + sx * (probe.footprintX() - 1) / 2;
				int z = minZ + sz * (probe.footprintZ() - 1) / 2;
				int surface = context.chunkGenerator().getFirstOccupiedHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG,
					context.heightAccessor(), context.randomState());
				int floor = context.chunkGenerator().getFirstOccupiedHeight(x, z, Heightmap.Types.OCEAN_FLOOR_WG,
					context.heightAccessor(), context.randomState());
				if (surface - floor > 2) {
					return Optional.empty(); // standing water
				}
				samples[i++] = surface - 1;
			}
		}
		Arrays.sort(samples);
		if (samples[8] - samples[0] > maxSlope) {
			return Optional.empty();
		}
		int ground = samples[4];
		BlockPos min = new BlockPos(minX, ground - complex.groundY(), minZ);
		if (min.getY() <= context.heightAccessor().getMinY() + 2
			|| min.getY() + complex.sizeY() + 4 >= context.heightAccessor().getMaxY()) {
			return Optional.empty();
		}
		PlacementTransform transform = new PlacementTransform(min, rotation, complex.sizeX(), complex.sizeY(), complex.sizeZ());
		long seed = context.seed() ^ (chunk.toLong() * 0x9E3779B97F4A7C15L);
		return Optional.of(new GenerationStub(new BlockPos(chunk.getMiddleBlockX(), ground, chunk.getMiddleBlockZ()),
			builder -> builder.addPiece(new ApartmentPiece(complex, seed, transform))));
	}

	@Override
	public StructureType<?> type() {
		return ModStructures.APARTMENT_COMPLEX;
	}
}
