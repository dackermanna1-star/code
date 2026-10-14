package net.abyssaldescent.dungeon.build.forgotten;

import net.abyssaldescent.dungeon.build.BlockSink;
import net.abyssaldescent.dungeon.build.Shapes;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.util.Seeds;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The crypt cathedral of the Hollow Warden (floor 5). A ring of heavy pillars gives cover from soul volleys, sarcophagi
 * along the side walls release the dead in the second phase, and the Warden waits on a raised throne at the far end.
 */
final class HollowWardenArena {
	private final ForgottenHallsStyle style;
	private final BlockSink sink;
	private final Room room;
	private final RandomSource r;
	private final Box in;
	private final int cx;
	private final int cz;
	private final int y0;

	HollowWardenArena(ForgottenHallsStyle style, BlockSink sink, Room room, RandomSource r) {
		this.style = style;
		this.sink = sink;
		this.room = room;
		this.r = r;
		this.in = room.interior();
		this.cx = in.centerX();
		this.cz = in.centerZ();
		this.y0 = in.minY();
	}

	void build() {
		style.cornerColumns(sink, room);
		gallery();
		pillars();
		throne();
		sarcophagi();
		lighting();
		style.dressing(sink, room, r, 0.5F);
	}

	/** A decorative balcony ring two thirds of the way up the walls. */
	private void gallery() {
		int gy = y0 + 8;
		for (int x = in.minX(); x <= in.maxX(); x++) {
			for (int z = in.minZ(); z <= in.maxZ(); z++) {
				int edge = Math.min(Math.min(x - in.minX(), in.maxX() - x), Math.min(z - in.minZ(), in.maxZ() - z));
				if (edge == 0) {
					sink.set(x, gy, z, Shapes.slab(Blocks.DEEPSLATE_TILE_SLAB, true));
				} else if (edge == 1) {
					sink.set(x, gy, z, Shapes.slab(Blocks.DEEPSLATE_TILE_SLAB, true));
					sink.set(x, gy + 1, z, Blocks.DEEPSLATE_TILE_WALL.defaultBlockState());
				}
			}
		}
		// Supporting brackets under the balcony.
		for (int x = in.minX() + 2; x < in.maxX() - 1; x += 4) {
			sink.set(x, gy - 1, in.minZ(), Shapes.stair(Blocks.DEEPSLATE_TILE_STAIRS, Direction.NORTH, true));
			sink.set(x, gy - 1, in.maxZ(), Shapes.stair(Blocks.DEEPSLATE_TILE_STAIRS, Direction.SOUTH, true));
		}
		for (int z = in.minZ() + 2; z < in.maxZ() - 1; z += 4) {
			sink.set(in.minX(), gy - 1, z, Shapes.stair(Blocks.DEEPSLATE_TILE_STAIRS, Direction.WEST, true));
			sink.set(in.maxX(), gy - 1, z, Shapes.stair(Blocks.DEEPSLATE_TILE_STAIRS, Direction.EAST, true));
		}
	}

	private void pillars() {
		for (int k = 0; k < 8; k++) {
			double angle = Math.toRadians(22.5 + k * 45);
			int px = cx + (int) Math.round(10 * Math.cos(angle));
			int pz = cz + (int) Math.round(10 * Math.sin(angle));
			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					boolean edge = dx != 0 || dz != 0;
					for (int y = y0; y <= in.maxY(); y++) {
						BlockState state;
						int rel = y - y0;
						if (rel == 0) {
							state = Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
						} else if (y == in.maxY() || rel == 7) {
							state = Blocks.CHISELED_TUFF_BRICKS.defaultBlockState();
						} else if (!edge) {
							state = Blocks.POLISHED_TUFF.defaultBlockState();
						} else if (dx != 0 && dz != 0) {
							state = Blocks.POLISHED_TUFF.defaultBlockState();
						} else {
							state = style.wallPalette().pick(px + dx, y, pz + dz);
						}
						sink.set(px + dx, y, pz + dz, state);
					}
				}
			}
			// Flared plinth.
			for (Direction d : Direction.Plane.HORIZONTAL) {
				for (int w = -1; w <= 1; w++) {
					Direction side = d.getClockWise();
					int x = px + d.getStepX() * 2 + side.getStepX() * w;
					int z = pz + d.getStepZ() * 2 + side.getStepZ() * w;
					sink.set(x, y0, z, Shapes.stair(Blocks.TUFF_BRICK_STAIRS, d.getOpposite(), false));
				}
				// Soul torches facing the centre on the inner faces.
				int tx = px + d.getStepX() * 2;
				int tz = pz + d.getStepZ() * 2;
				int toCenterX = cx - px;
				int toCenterZ = cz - pz;
				if (d.getStepX() * toCenterX + d.getStepZ() * toCenterZ > 0) {
					sink.set(tx, y0 + 4, tz, Shapes.wallTorch(Blocks.SOUL_WALL_TORCH, d));
				}
			}
		}
	}

	private void throne() {
		int back = in.minZ();
		// Two-step dais.
		for (int x = cx - 5; x <= cx + 5; x++) {
			for (int z = back; z <= back + 4; z++) {
				int fromFront = back + 4 - z;
				boolean upper = Math.abs(x - cx) <= 3 && z <= back + 2;
				if (z == back + 4) {
					sink.set(x, y0, z, Shapes.stair(Blocks.POLISHED_TUFF_STAIRS, Direction.NORTH, false));
				} else {
					sink.set(x, y0, z, Blocks.POLISHED_TUFF.defaultBlockState());
				}
				if (upper) {
					sink.set(x, y0 + 1, z, z == back + 2 ? Shapes.stair(Blocks.POLISHED_TUFF_STAIRS, Direction.NORTH, false)
						: Blocks.CHISELED_TUFF_BRICKS.defaultBlockState());
				}
				if (fromFront < 0) {
					sink.set(x, y0, z, BlockSink.AIR);
				}
			}
		}
		// The throne itself.
		int ty = y0 + 2;
		sink.set(cx, ty, back + 1, Shapes.stair(Blocks.DEEPSLATE_BRICK_STAIRS, Direction.NORTH, false));
		sink.set(cx - 1, ty, back + 1, Shapes.stair(Blocks.DEEPSLATE_BRICK_STAIRS, Direction.EAST, false));
		sink.set(cx + 1, ty, back + 1, Shapes.stair(Blocks.DEEPSLATE_BRICK_STAIRS, Direction.WEST, false));
		for (int y = ty; y <= ty + 4; y++) {
			sink.set(cx, y, back, y == ty + 4 ? Blocks.CHISELED_DEEPSLATE.defaultBlockState() : Blocks.POLISHED_DEEPSLATE.defaultBlockState());
		}
		sink.set(cx, ty + 5, back, Shapes.skull(0));
		sink.set(cx - 1, ty + 3, back, Shapes.stair(Blocks.DEEPSLATE_BRICK_STAIRS, Direction.EAST, true));
		sink.set(cx + 1, ty + 3, back, Shapes.stair(Blocks.DEEPSLATE_BRICK_STAIRS, Direction.WEST, true));
		sink.set(cx, ty + 1, back, ModBlocks.RUNE_STONE.defaultBlockState());
		// Braziers on the dais corners.
		sink.set(cx - 4, y0 + 1, back + 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		sink.set(cx + 4, y0 + 1, back + 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		// Banners of bone either side of the throne wall.
		for (int s = -1; s <= 1; s += 2) {
			for (int y = y0 + 3; y <= y0 + 7; y++) {
				sink.set(cx + s * 3, y, back - 1, Blocks.BONE_BLOCK.defaultBlockState());
			}
			sink.set(cx + s * 3, y0 + 7, back, Shapes.wallSkull(Direction.SOUTH));
		}
	}

	private void sarcophagi() {
		for (Fixture fixture : room.fixtures()) {
			if (fixture.type() != Fixture.Type.MINION_SPAWN) {
				continue;
			}
			int x = fixture.pos().getX();
			int z = fixture.pos().getZ();
			for (int dz = -1; dz <= 1; dz++) {
				sink.set(x, y0, z + dz, (dz == 0 ? Blocks.POLISHED_DEEPSLATE : Blocks.DEEPSLATE_TILES).defaultBlockState());
				sink.set(x, y0 + 1, z + dz, Shapes.slab(Blocks.DEEPSLATE_TILE_SLAB, false));
			}
			Direction wall = fixture.facing().getOpposite();
			sink.set(x + wall.getStepX(), y0, z, Blocks.CHISELED_TUFF.defaultBlockState());
			sink.set(x + wall.getStepX(), y0 + 1, z, Shapes.candles(Blocks.CANDLE, 1 + r.nextInt(3)));
			for (int y = y0 + 2; y <= y0 + 5; y++) {
				sink.set(x + wall.getStepX() * 2, y, z, Blocks.CHISELED_TUFF_BRICKS.defaultBlockState());
			}
		}
	}

	private void lighting() {
		int ceil = in.maxY() + 1;
		int[][] chandeliers = {{cx - 7, cz - 6}, {cx + 7, cz - 6}, {cx - 7, cz + 7}, {cx + 7, cz + 7}};
		for (int[] c : chandeliers) {
			Shapes.chandelier(sink, c[0], ceil, c[1], 4, Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
		}
		Shapes.chandelier(sink, cx, ceil, cz, 2, Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
		// Braziers guarding the entrance.
		sink.set(cx - 4, y0, in.maxZ() - 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		sink.set(cx + 4, y0, in.maxZ() - 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		// Hanging moss drifting down from the vault.
		for (int x = in.minX() + 2; x < in.maxX() - 1; x++) {
			for (int z = in.minZ() + 2; z < in.maxZ() - 1; z++) {
				if (Seeds.hash01(room.seed(), x, 31, z) < 0.025F) {
					Shapes.hangingMoss(sink, x, in.maxY(), z, 1 + Seeds.hashInt(room.seed(), x, 32, z, 4));
				}
			}
		}
	}
}
