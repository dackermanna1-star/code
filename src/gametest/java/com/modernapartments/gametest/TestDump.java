package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.CarpetBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.state.BlockState;

/** Character maps of buffer layers for debugging layouts from test logs. */
final class TestDump {
	private TestDump() {
	}

	/** Lists the blocks in a small box (debugging). */
	static void list(BlockBuffer buf, int x0, int z0, int x1, int z1, int y) {
		for (int z = z0; z <= z1; z++) {
			for (int x = x0; x <= x1; x++) {
				BlockState s = buf.get(x, y, z);
				if (s != null && !s.isAir()) {
					System.out.println("[map] " + x + "," + y + "," + z + " " + s);
				}
			}
		}
	}

	/** Prints a character map of one buffer layer (for debugging layouts in the log). */
	static void dump(com.modernapartments.build.BlockBuffer buf, int x0, int z0, int x1, int z1, int y) {
		for (int z = z0; z <= z1; z++) {
			StringBuilder line = new StringBuilder("[map] ");
			for (int x = x0; x <= x1; x++) {
				BlockState s = buf.get(x, y, z);
				BlockState below = buf.get(x, y - 1, z);
				char ch;
				if (s == null) {
					ch = below == null ? ' ' : '_';
				} else if (s.isAir()) {
					ch = below == null || below.isAir() ? 'v' : '.';
				} else if (s.getBlock() instanceof DoorBlock) {
					ch = 'D';
				} else if (s.getBlock() instanceof BedBlock) {
					ch = 'b';
				} else if (s.getBlock() instanceof CarpetBlock) {
					ch = 'r';
				} else if (s.isCollisionShapeFullBlock(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)) {
					ch = '#';
				} else if (s.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO).isEmpty()) {
					ch = ',';
				} else {
					ch = 'f';
				}
				line.append(ch);
			}
			System.out.println(line);
		}
	}

}
