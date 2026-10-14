package net.abyssaldescent.dungeon.build;

import net.abyssaldescent.block.ReliquaryBlockEntity;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Corridor;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.world.DungeonCoords;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Visual identity of a zone: materials for the rock mass, shells and decoration. Subclasses implement the zone-specific
 * room archetypes; the base class handles the parts every zone shares (carving, fixtures).
 */
public abstract class ZoneStyle {
	protected static final int Y0 = DungeonCoords.FLOOR_Y;

	/** Rock mass surrounding the floor; only visible through broken secret walls. */
	public abstract BlockState mass(int x, int y, int z);

	public abstract void paintRoomShell(BlockSink sink, Room room, FloorLayout layout);

	public abstract void paintCorridorShell(BlockSink sink, Corridor corridor, FloorLayout layout);

	public abstract void decorateRoom(BlockSink sink, Room room, FloorLayout layout);

	public abstract void decorateCorridor(BlockSink sink, Corridor corridor, FloorLayout layout);

	/** Block used for crumbling (secret) walls in this zone. */
	public BlockState crumblingWall() {
		return ModBlocks.CRUMBLING_STONE_BRICKS.defaultBlockState();
	}

	public void carveRoom(BlockSink sink, Room room) {
		sink.fill(room.interior(), BlockSink.AIR);
	}

	public void carveCorridor(BlockSink sink, Corridor corridor) {
		for (Box segment : corridor.segments()) {
			sink.fill(segment, BlockSink.AIR);
		}
	}

	public void placeFixture(BlockSink sink, Fixture fixture, FloorLayout layout) {
		int x = fixture.pos().getX();
		int y = fixture.pos().getY();
		int z = fixture.pos().getZ();
		switch (fixture.type()) {
			case RIFT -> {
				for (int dx = -1; dx <= 1; dx++) {
					for (int dz = -1; dz <= 1; dz++) {
						sink.set(x + dx, y, z + dz, ModBlocks.DESCENT_RIFT.defaultBlockState());
					}
				}
			}
			case RELIQUARY -> {
				sink.set(x, y, z, facing(ModBlocks.RELIQUARY.defaultBlockState(), fixture.facing()));
				LootTier tier = LootTier.byId(fixture.data());
				int floor = layout.floor();
				sink.configure(x, y, z, be -> {
					if (be instanceof ReliquaryBlockEntity reliquary) {
						reliquary.setup(tier, floor);
					}
				});
			}
			case URN -> sink.set(x, y, z, ModBlocks.BURIAL_URN.defaultBlockState());
			case SPIKE_TRAP -> sink.set(x, y, z, ModBlocks.SPIKE_TRAP.defaultBlockState());
			case DART_TRAP -> sink.set(x, y, z, facing(ModBlocks.DART_TRAP.defaultBlockState(), fixture.facing()));
			case CRUMBLING_WALL -> sink.set(x, y, z, crumblingWall());
			case ALTAR_OF_TRIALS -> sink.set(x, y, z, facing(ModBlocks.ALTAR_OF_TRIALS.defaultBlockState(), Direction.SOUTH));
			case CURSED_IDOL -> sink.set(x, y, z, facing(ModBlocks.CURSED_IDOL.defaultBlockState(), Direction.SOUTH));
			default -> {
			}
		}
	}

	protected static BlockState facing(BlockState state, Direction facing) {
		return state.hasProperty(HorizontalDirectionalBlock.FACING) ? state.setValue(HorizontalDirectionalBlock.FACING, facing) : state;
	}
}
