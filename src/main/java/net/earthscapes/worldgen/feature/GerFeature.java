package net.earthscapes.worldgen.feature;

import com.mojang.serialization.Codec;
import net.earthscapes.Earthscapes;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.FurnaceBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * A ger, the round felt tent of Mongolian herders: white felt walls over a lattice, a domed roof
 * rising to the toono crown ring, an orange-painted door facing south, a stove in the middle and
 * a few belongings inside.
 */
public class GerFeature extends Feature<NoneFeatureConfiguration> {
	public static final ResourceKey<LootTable> LOOT = ResourceKey.create(Registries.LOOT_TABLE, Earthscapes.id("chests/ger"));
	private static final int R = 3;

	public GerFeature(Codec<NoneFeatureConfiguration> codec) {
		super(codec);
	}

	@Override
	public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> context) {
		WorldGenLevel level = context.level();
		BlockPos origin = context.origin();
		RandomSource random = context.random();
		// demand nearly flat, dry, grassy ground
		int min = Integer.MAX_VALUE;
		int max = Integer.MIN_VALUE;
		for (int dx = -R; dx <= R; dx++) {
			for (int dz = -R; dz <= R; dz++) {
				int h = level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, origin.getX() + dx, origin.getZ() + dz);
				if (!level.getFluidState(new BlockPos(origin.getX() + dx, h, origin.getZ() + dz)).isEmpty()) {
					return false; // water
				}
				min = Math.min(min, h);
				max = Math.max(max, h);
			}
		}
		if (max - min > 1) {
			return false;
		}
		int floorY = min - 1;
		Direction door = Direction.SOUTH;
		BlockState felt = Blocks.WHITE_WOOL.defaultBlockState();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int dx = -R - 1; dx <= R + 1; dx++) {
			for (int dz = -R - 1; dz <= R + 1; dz++) {
				double d = Math.sqrt(dx * dx + dz * dz);
				int x = origin.getX() + dx;
				int z = origin.getZ() + dz;
				if (d <= R + 0.5) {
					// level floor and foundation
					for (int y = floorY - 2; y < floorY; y++) {
						this.setBlock(level, pos.set(x, y, z), Blocks.DIRT.defaultBlockState());
					}
					this.setBlock(level, pos.set(x, floorY, z), d < R - 0.4 ? Blocks.SPRUCE_PLANKS.defaultBlockState() : Blocks.GRASS_BLOCK.defaultBlockState());
					for (int y = floorY + 1; y <= floorY + 6; y++) {
						this.setBlock(level, pos.set(x, y, z), Blocks.AIR.defaultBlockState());
					}
				}
				if (d >= R - 0.4 && d < R + 0.5) {
					this.setBlock(level, pos.set(x, floorY + 1, z), felt);
					this.setBlock(level, pos.set(x, floorY + 2, z), felt);
				}
				// domed roof
				if (d < R + 0.5) {
					int roofY = d >= R - 0.4 ? floorY + 3 : d >= R - 1.4 ? floorY + 4 : floorY + 5;
					if (d < 0.8) {
						this.setBlock(level, pos.set(x, floorY + 5, z), Blocks.SPRUCE_TRAPDOOR.defaultBlockState());
					} else {
						this.setBlock(level, pos.set(x, roofY, z), felt);
					}
					if (d >= R - 0.4) {
						this.setBlock(level, pos.set(x, floorY + 4, z), Blocks.AIR.defaultBlockState());
					}
				}
			}
		}
		// rope bands around the felt
		for (int dx = -R; dx <= R; dx++) {
			for (int dz = -R; dz <= R; dz++) {
				double d = Math.sqrt(dx * dx + dz * dz);
				if (d >= R - 0.4 && d < R + 0.5) {
					this.setBlock(level, pos.set(origin.getX() + dx, floorY + 2, origin.getZ() + dz), Blocks.LIGHT_GRAY_WOOL.defaultBlockState());
				}
			}
		}
		// door
		BlockPos doorPos = origin.relative(door, R).atY(floorY + 1);
		BlockState doorState = Blocks.ACACIA_DOOR.defaultBlockState().setValue(DoorBlock.FACING, door.getOpposite());
		this.setBlock(level, doorPos, doorState.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER));
		this.setBlock(level, doorPos.above(), doorState.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER));
		this.setBlock(level, doorPos.above(2), Blocks.ORANGE_WOOL.defaultBlockState());
		this.setBlock(level, doorPos.relative(door), Blocks.AIR.defaultBlockState());
		this.setBlock(level, doorPos.relative(door).above(), Blocks.AIR.defaultBlockState());
		// interior: central stove with its two supporting posts, carpet, bed, chest
		BlockPos centre = origin.atY(floorY + 1);
		this.setBlock(level, centre, Blocks.FURNACE.defaultBlockState().setValue(FurnaceBlock.FACING, door));
		this.setBlock(level, centre.above(), Blocks.SPRUCE_FENCE.defaultBlockState());
		this.setBlock(level, centre.above(2), Blocks.SPRUCE_FENCE.defaultBlockState());
		this.setBlock(level, centre.above(3), Blocks.SPRUCE_FENCE.defaultBlockState());
		for (int dx = -1; dx <= 1; dx++) {
			for (int dz = 1; dz <= 2; dz++) {
				if (random.nextFloat() < 0.9F) {
					this.setBlock(level, centre.offset(dx, 0, dz), Blocks.RED_CARPET.defaultBlockState());
				}
			}
		}
		BlockPos bedFoot = centre.offset(-2, 0, -1);
		BlockState bed = Blocks.ORANGE_BED.defaultBlockState().setValue(BedBlock.FACING, Direction.NORTH);
		this.setBlock(level, bedFoot, bed.setValue(BedBlock.PART, BedPart.FOOT));
		this.setBlock(level, bedFoot.north(), bed.setValue(BedBlock.PART, BedPart.HEAD));
		BlockPos chest = centre.offset(2, 0, -1);
		this.setBlock(level, chest, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, Direction.WEST));
		RandomizableContainer.setBlockEntityLootTable(level, random, chest, LOOT);
		this.setBlock(level, centre.offset(1, 0, -2), Blocks.BARREL.defaultBlockState());
		return true;
	}

	@Override
	protected void setBlock(net.minecraft.world.level.LevelWriter level, BlockPos pos, BlockState state) {
		level.setBlock(pos, state, Block.UPDATE_CLIENTS);
	}
}
