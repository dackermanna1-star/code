package com.modernapartments.build;

import com.modernapartments.block.SofaBlock;
import com.modernapartments.block.TableBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.FenceBlock;
import net.minecraft.world.level.block.IronBarsBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/**
 * Computes neighbour-dependent block states (panes, railings, fences, sofas, tables) inside a finished
 * buffer, so buildings can be placed without triggering any neighbour updates in the world.
 */
public final class ConnectionResolver {
	private ConnectionResolver() {
	}

	public static void resolve(BlockBuffer buf) {
		for (int y = 0; y < buf.sizeY; y++) {
			for (int z = 0; z < buf.sizeZ; z++) {
				for (int x = 0; x < buf.sizeX; x++) {
					BlockState s = buf.get(x, y, z);
					if (s == null || s.isAir()) {
						continue;
					}
					BlockState resolved = resolve(buf, x, y, z, s);
					if (resolved != s) {
						buf.set(x, y, z, resolved);
					}
				}
			}
		}
	}

	private static BlockState resolve(BlockBuffer buf, int x, int y, int z, BlockState s) {
		if (s.getBlock() instanceof IronBarsBlock bars) {
			for (Direction d : Direction.Plane.HORIZONTAL) {
				BlockState n = neighbor(buf, x, y, z, d);
				boolean sturdy = n != null && n.isFaceSturdy(EmptyBlockGetter.INSTANCE, BlockPos.ZERO, d.getOpposite());
				s = s.setValue(property(d), n != null && bars.attachsTo(n, sturdy));
			}
			return s;
		}
		if (s.getBlock() instanceof FenceBlock fence) {
			for (Direction d : Direction.Plane.HORIZONTAL) {
				BlockState n = neighbor(buf, x, y, z, d);
				boolean sturdy = n != null && n.isFaceSturdy(EmptyBlockGetter.INSTANCE, BlockPos.ZERO, d.getOpposite());
				s = s.setValue(property(d), n != null && fence.connectsTo(n, sturdy, d.getOpposite()));
			}
			return s;
		}
		if (s.getBlock() instanceof SofaBlock) {
			return s.setValue(com.modernapartments.block.ModProperties.SOFA_SHAPE, SofaBlock.computeShape(
				s.getValue(SofaBlock.FACING), new BlockPos(x, y, z), p -> {
					BlockState n = buf.get(p.getX(), p.getY(), p.getZ());
					return n == null ? Canvas.AIR : n;
				}));
		}
		if (s.getBlock() instanceof TableBlock) {
			for (Direction d : Direction.Plane.HORIZONTAL) {
				BlockState n = neighbor(buf, x, y, z, d);
				s = s.setValue(TableBlock.property(d), n != null && n.is(s.getBlock()));
			}
			return s;
		}
		return s;
	}

	private static BlockState neighbor(BlockBuffer buf, int x, int y, int z, Direction d) {
		return buf.get(x + d.getStepX(), y, z + d.getStepZ());
	}

	private static BooleanProperty property(Direction d) {
		return switch (d) {
			case NORTH -> BlockStateProperties.NORTH;
			case EAST -> BlockStateProperties.EAST;
			case SOUTH -> BlockStateProperties.SOUTH;
			default -> BlockStateProperties.WEST;
		};
	}
}
