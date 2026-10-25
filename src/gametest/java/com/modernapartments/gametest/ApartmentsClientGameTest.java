package com.modernapartments.gametest;

import com.modernapartments.block.ApartmentDoorBlock;
import com.modernapartments.block.CeilingLampBlock;
import com.modernapartments.block.DecorBlock;
import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.TallFurnitureBlock;
import com.modernapartments.block.TwoPartFurnitureBlock;
import com.modernapartments.registry.ModBlocks;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.screenshot.TestScreenshotOptions;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

public class ApartmentsClientGameTest implements FabricClientGameTest {
	private static final int COLUMNS = 10;
	private static final int SPACING = 2;
	private static final int ROW_SPACING = 8;
	private static final int FLOOR_Y = -61;

	@Override
	public void runTest(ClientGameTestContext context) {
		String mode = System.getProperty("modernapartments.test", "showroom");
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			world.getServer().runCommand("time set noon");
			world.getServer().runCommand("weather clear");
			context.runOnClient(client -> client.options.hideGui = true);
			if (mode.contains("showroom")) {
				showroom(context, world);
			}
		}
	}

	private void showroom(ClientGameTestContext context, TestSingleplayerContext world) {
		List<Block> blocks = ModBlocks.ALL.stream().filter(b -> b.getClass() != Block.class
			&& !(b instanceof net.minecraft.world.level.block.TransparentBlock)
			&& !(b instanceof net.minecraft.world.level.block.RotatedPillarBlock)
			&& !(b instanceof com.modernapartments.block.FacingCubeBlock)
			&& !(b instanceof com.modernapartments.block.LightPanelBlock)).toList();
		int rows = (blocks.size() + COLUMNS - 1) / COLUMNS;
		world.getServer().runOnServer(server -> {
			ServerLevel level = server.overworld();
			for (int x = -6; x < COLUMNS * SPACING + 6; x++) {
				for (int z = -6; z < rows * ROW_SPACING + 12; z++) {
					level.setBlock(new BlockPos(x, FLOOR_Y, z), Blocks.SMOOTH_QUARTZ.defaultBlockState(), 2);
				}
			}
			for (int i = 0; i < blocks.size(); i++) {
				BlockPos pos = new BlockPos((i % COLUMNS) * SPACING, FLOOR_Y + 1, (i / COLUMNS) * ROW_SPACING);
				place(level, pos, blocks.get(i));
			}
		});
		for (int r = 0; r < rows; r++) {
			int z = r * ROW_SPACING + 8;
			world.getServer().runCommand(String.format("tp @a %d %d %d 180 22", (COLUMNS - 1) * SPACING / 2, FLOOR_Y + 5, z));
			context.waitTicks(5);
			world.getClientWorld().waitForChunksRender();
			context.takeScreenshot(TestScreenshotOptions.of("showroom_" + r).withSize(1600, 900));
		}
	}

	private static void place(ServerLevel level, BlockPos pos, Block block) {
		BlockState s = block.defaultBlockState();
		Direction facing = Direction.SOUTH;
		if (s.hasProperty(FurnitureBlock.FACING)) {
			s = s.setValue(FurnitureBlock.FACING, facing);
		}
		String id = BuiltInRegistries.BLOCK.getKey(block).getPath();
		if (block instanceof FurnitureBlock f && f.isWallMounted()) {
			level.setBlock(pos.north(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
			level.setBlock(pos.north().above(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
			pos = pos.above();
		}
		if (block instanceof CeilingLampBlock || (block instanceof DecorBlock && (id.startsWith("ceiling") || id.equals("smoke_detector")
			|| id.equals("sprinkler") || id.equals("security_camera_dome") || id.equals("punching_bag")))) {
			pos = pos.above(2);
			level.setBlock(pos.above(), Blocks.WHITE_CONCRETE.defaultBlockState(), 2);
		}
		if (block instanceof TallFurnitureBlock || block instanceof ElevatorDoorBlock) {
			level.setBlock(pos, s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.LOWER), 2 | 16);
			level.setBlock(pos.above(), s.setValue(TallFurnitureBlock.HALF, DoubleBlockHalf.UPPER), 2 | 16);
		} else if (block instanceof ApartmentDoorBlock) {
			s = s.setValue(DoorBlock.FACING, facing);
			level.setBlock(pos, s.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER), 2 | 16);
			level.setBlock(pos.above(), s.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER), 2 | 16);
		} else if (block instanceof TwoPartFurnitureBlock) {
			level.setBlock(pos, s.setValue(TwoPartFurnitureBlock.PART, BedPart.FOOT), 2 | 16);
			level.setBlock(pos.relative(facing), s.setValue(TwoPartFurnitureBlock.PART, BedPart.HEAD), 2 | 16);
		} else {
			level.setBlock(pos, s, 2 | 16);
		}
	}
}
