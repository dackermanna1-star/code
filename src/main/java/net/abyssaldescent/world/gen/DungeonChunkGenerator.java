package net.abyssaldescent.world.gen;

import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import net.abyssaldescent.dungeon.build.FloorPainter;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.world.DungeonCoords;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.NoiseColumn;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.blending.Blender;

/**
 * Generates the dungeon dimension. Terrain is empty void; floors are painted during the decoration step, where
 * block entities can be created, using the deterministic {@link FloorLayout} for the chunk's run slot and floor.
 */
public final class DungeonChunkGenerator extends ChunkGenerator {
	public static final MapCodec<DungeonChunkGenerator> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		BiomeSource.CODEC.fieldOf("biome_source").forGetter(ChunkGenerator::getBiomeSource)
	).apply(instance, instance.stable(DungeonChunkGenerator::new)));

	public DungeonChunkGenerator(BiomeSource biomeSource) {
		super(biomeSource);
	}

	@Override
	protected MapCodec<? extends ChunkGenerator> codec() {
		return CODEC;
	}

	@Override
	public void applyBiomeDecoration(WorldGenLevel level, ChunkAccess chunk, StructureManager structureManager) {
		ChunkPos pos = chunk.getPos();
		int slot = DungeonCoords.slotOfChunk(pos);
		int floor = DungeonCoords.floorOfChunk(pos);
		if (!FloorLayouts.isGeneratedFloor(slot, floor)) {
			return;
		}
		FloorLayout layout = FloorLayouts.get(level.getSeed(), slot, floor);
		FloorPainter.paintChunk(level, pos, layout);
	}

	@Override
	public void applyCarvers(WorldGenRegion region, long seed, RandomState randomState, BiomeManager biomeManager, StructureManager structureManager,
		ChunkAccess chunk) {
	}

	@Override
	public void buildSurface(WorldGenRegion region, StructureManager structureManager, RandomState randomState, ChunkAccess chunk) {
	}

	@Override
	public void spawnOriginalMobs(WorldGenRegion region) {
	}

	@Override
	public int getGenDepth() {
		return 256;
	}

	@Override
	public CompletableFuture<ChunkAccess> fillFromNoise(Blender blender, RandomState randomState, StructureManager structureManager, ChunkAccess chunk) {
		return CompletableFuture.completedFuture(chunk);
	}

	@Override
	public int getSeaLevel() {
		return 0;
	}

	@Override
	public int getMinY() {
		return 0;
	}

	@Override
	public int getBaseHeight(int x, int z, Heightmap.Types type, LevelHeightAccessor level, RandomState randomState) {
		return DungeonCoords.FLOOR_Y;
	}

	@Override
	public NoiseColumn getBaseColumn(int x, int z, LevelHeightAccessor level, RandomState randomState) {
		BlockState[] states = new BlockState[level.getHeight()];
		Arrays.fill(states, Blocks.AIR.defaultBlockState());
		return new NoiseColumn(level.getMinY(), states);
	}

	@Override
	public void addDebugScreenInfo(List<String> lines, RandomState randomState, BlockPos pos) {
		int slot = DungeonCoords.slotOf(pos.getX());
		int floor = DungeonCoords.floorOf(pos.getZ());
		lines.add("Abyssal Descent: slot " + slot + ", floor " + floor);
	}

	/** Exposed for debugging commands. */
	public static String describeRoom(FloorLayout layout, BlockPos pos) {
		Room room = layout.roomAt(pos);
		return room == null ? "corridor/void" : room.type() + " #" + room.id();
	}
}
