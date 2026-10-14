package net.abyssaldescent.dungeon.build;

import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CandleBlock;
import net.minecraft.world.level.block.ChainBlock;
import net.minecraft.world.level.block.HangingMossBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.SkullBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallSkullBlock;
import net.minecraft.world.level.block.WallTorchBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;

/** Small reusable architectural pieces shared by all zone styles. */
public final class Shapes {
	private Shapes() {
	}

	public static BlockState stair(Block block, Direction facing, boolean upsideDown) {
		return block.defaultBlockState().setValue(StairBlock.FACING, facing).setValue(StairBlock.HALF, upsideDown ? Half.TOP : Half.BOTTOM);
	}

	public static BlockState slab(Block block, boolean top) {
		return block.defaultBlockState().setValue(SlabBlock.TYPE, top ? SlabType.TOP : SlabType.BOTTOM);
	}

	public static BlockState candles(Block candle, int count) {
		return candle.defaultBlockState().setValue(CandleBlock.CANDLES, Math.max(1, Math.min(4, count))).setValue(CandleBlock.LIT, true);
	}

	public static BlockState skull(int rotation) {
		return Blocks.SKELETON_SKULL.defaultBlockState().setValue(SkullBlock.ROTATION, rotation & 15);
	}

	public static BlockState wallSkull(Direction facing) {
		return Blocks.SKELETON_WALL_SKULL.defaultBlockState().setValue(WallSkullBlock.FACING, facing);
	}

	/** Skull rotation index that makes a floor skull look in the given direction. */
	public static int rotationFacing(Direction dir) {
		return switch (dir) {
			case SOUTH -> 0;
			case WEST -> 4;
			case NORTH -> 8;
			default -> 12;
		};
	}

	public static BlockState wallTorch(Block wallTorch, Direction facing) {
		return wallTorch.defaultBlockState().setValue(WallTorchBlock.FACING, facing);
	}

	public static BlockState hangingLantern(Block lantern) {
		return lantern.defaultBlockState().setValue(LanternBlock.HANGING, true);
	}

	public static BlockState standingLantern(Block lantern) {
		return lantern.defaultBlockState().setValue(LanternBlock.HANGING, false);
	}

	/** Chain hanging from the block below {@code ceilingY} with a lantern at the end. */
	public static void hangLantern(BlockSink sink, int x, int ceilingY, int z, int chainLength, Block lantern) {
		BlockState chain = Blocks.IRON_CHAIN.defaultBlockState().setValue(ChainBlock.AXIS, Direction.Axis.Y);
		int y = ceilingY - 1;
		for (int i = 0; i < chainLength; i++, y--) {
			sink.set(x, y, z, chain);
		}
		sink.set(x, y, z, hangingLantern(lantern));
	}

	/**
	 * A four-armed chandelier: chain from the ceiling to a hub post, iron-bar arms, a lantern hanging under each arm and a
	 * candle cluster on top of the hub.
	 */
	public static void chandelier(BlockSink sink, int x, int ceilingY, int z, int drop, Block hub, Block lantern, Block candle) {
		BlockState chain = Blocks.IRON_CHAIN.defaultBlockState().setValue(ChainBlock.AXIS, Direction.Axis.Y);
		int hubY = ceilingY - 1 - drop;
		for (int y = ceilingY - 1; y > hubY + 1; y--) {
			sink.set(x, y, z, chain);
		}
		sink.set(x, hubY + 1, z, candles(candle, 3));
		sink.set(x, hubY, z, hub.defaultBlockState());
		for (Direction d : Direction.Plane.HORIZONTAL) {
			sink.set(x + d.getStepX(), hubY, z + d.getStepZ(), Blocks.IRON_BARS.defaultBlockState());
			sink.set(x + d.getStepX(), hubY - 1, z + d.getStepZ(), hangingLantern(lantern));
		}
	}

	/** One-block pillar from y0 to y1 with distinct base and capital blocks. */
	public static void pillar(BlockSink sink, int x, int z, int y0, int y1, BlockState base, BlockState body, BlockState cap) {
		for (int y = y0; y <= y1; y++) {
			sink.set(x, y, z, y == y0 ? base : y == y1 ? cap : body);
		}
	}

	public static void hangingMoss(BlockSink sink, int x, int topY, int z, int length) {
		for (int i = 0; i < length; i++) {
			boolean tip = i == length - 1;
			sink.set(x, topY - i, z, Blocks.PALE_HANGING_MOSS.defaultBlockState().setValue(HangingMossBlock.TIP, tip));
		}
	}
}
