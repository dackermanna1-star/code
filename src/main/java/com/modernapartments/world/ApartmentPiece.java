package com.modernapartments.world;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacementTransform;
import com.modernapartments.build.placement.TerrainAdapter;
import com.modernapartments.registry.ModStructures;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

/** Copies one chunk-sized slice of a cached building (plus terrain adaptation) per call. */
public class ApartmentPiece extends StructurePiece {
	private final ComplexType complex;
	private final long seed;
	private final PlacementTransform transform;

	public ApartmentPiece(ComplexType complex, long seed, PlacementTransform transform) {
		super(ModStructures.APARTMENT_PIECE, 0, TerrainAdapter.fullBox(transform));
		this.complex = complex;
		this.seed = seed;
		this.transform = transform;
	}

	public ApartmentPiece(CompoundTag tag) {
		super(ModStructures.APARTMENT_PIECE, tag);
		ComplexType type = ComplexType.byId(tag.getStringOr("Complex", ""));
		this.complex = type == null ? ComplexType.METROPOLITAN : type;
		this.seed = tag.getLongOr("Seed", 0L);
		this.transform = tag.read("Transform", PlacementTransform.CODEC).orElseThrow();
	}

	public ComplexType complex() {
		return complex;
	}

	public PlacementTransform transform() {
		return transform;
	}

	public long seed() {
		return seed;
	}

	@Override
	protected void addAdditionalSaveData(StructurePieceSerializationContext context, CompoundTag tag) {
		tag.putString("Complex", complex.id());
		tag.putLong("Seed", seed);
		tag.store("Transform", PlacementTransform.CODEC, transform);
	}

	@Override
	public void postProcess(WorldGenLevel level, StructureManager structureManager, ChunkGenerator generator, RandomSource random,
			BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
		BlockBuffer buffer = BuildCache.get(complex, seed);
		TerrainAdapter adapter = new TerrainAdapter(level, buffer, transform, random);
		adapter.adaptTerrain(chunkBox);
		adapter.placeBlocks(chunkBox, 0, buffer.sizeY, null);
	}
}
