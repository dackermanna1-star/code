package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.registry.ModBlocks;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/** Common corridors: floors, ceilings, lighting, life-safety devices and wall decor. */
public final class Corridors {
	private Corridors() {
	}

	/** Corridor finishes. {@code runner} is an optional runner rug laid along the centre line. */
	public record Style(Block floor, @Nullable Block runner, Block ceiling, Block light, Block sconce) {
	}

	/**
	 * Corridor box x0..x1 / z0..z1 (inclusive interior) with floor at y0 and ceiling layer at y0 + h.
	 * Walls belong to whatever lines the corridor (units, cores) and are not drawn here.
	 */
	public static void corridor(Canvas c, int x0, int z0, int x1, int z1, int y0, int h, Style s) {
		c.fill(x0, y0, z0, x1, y0, z1, s.floor());
		c.clear(x0, y0 + 1, z0, x1, y0 + h - 1, z1);
		c.fill(x0, y0 + h, z0, x1, y0 + h, z1, s.ceiling());
		boolean alongX = x1 - x0 >= z1 - z0;
		int len = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
		int mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
		for (int i = 1; i < len - 1; i++) {
			int x = alongX ? x0 + i : mid;
			int z = alongX ? mid : z0 + i;
			if (i % 4 == 2) {
				c.set(x, y0 + h, z, s.light());
			} else if (i % 12 == 8) {
				c.set(x, y0 + h, z, ModBlocks.SMOKE_DETECTOR);
			} else if (i % 6 == 0) {
				c.set(x, y0 + h, z, ModBlocks.SPRINKLER);
			}
			if (s.runner() != null && i > 0 && i < len - 1) {
				c.put(x, y0 + 1, z, s.runner(), alongX ? Direction.EAST : Direction.SOUTH);
			}
		}
	}

	/**
	 * Sconces and art on the corridor's long walls wherever the wall is plain (no door, sign or device),
	 * plus a fire extinguisher every so often. Call after units and cores have been drawn.
	 */
	public static void decorate(Canvas c, int x0, int z0, int x1, int z1, int y0, int h, Style s, RandomSource r) {
		boolean alongX = x1 - x0 >= z1 - z0;
		int len = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
		int sconceY = y0 + Math.min(3, h - 1);
		for (int side = 0; side < 2; side++) {
			Direction toWall = alongX ? (side == 0 ? Direction.NORTH : Direction.SOUTH) : (side == 0 ? Direction.WEST : Direction.EAST);
			int lastDecor = -10;
			boolean extinguisher = false;
			for (int i = 1; i < len - 1; i++) {
				int x = alongX ? x0 + i : (side == 0 ? x0 : x1);
				int z = alongX ? (side == 0 ? z0 : z1) : z0 + i;
				int wx = x + toWall.getStepX();
				int wz = z + toWall.getStepZ();
				if (!plainWall(c, wx, y0, wz) || !plainWall(c, wx - (alongX ? 1 : 0), y0, wz - (alongX ? 0 : 1))
					|| !plainWall(c, wx + (alongX ? 1 : 0), y0, wz + (alongX ? 0 : 1))) {
					continue;
				}
				if (!c.isAirOrUnset(x, y0 + 2, z) || !c.isAirOrUnset(x, sconceY, z)) {
					continue;
				}
				if (i - lastDecor < 4) {
					continue;
				}
				Direction facing = toWall.getOpposite();
				if (!extinguisher && i > len / 3) {
					c.put(x, y0 + 2, z, ModBlocks.FIRE_EXTINGUISHER, facing);
					extinguisher = true;
				} else if (r.nextInt(3) == 0 && h >= 4) {
					c.put(x, y0 + 2, z, ModBlocks.ART.get(r.nextInt(ModBlocks.ART.size())), facing);
				} else {
					c.put(x, sconceY, z, s.sconce(), facing);
				}
				lastDecor = i;
			}
		}
	}

	private static boolean plainWall(Canvas c, int x, int y0, int z) {
		for (int y = y0 + 1; y <= y0 + 3; y++) {
			BlockState s = c.get(x, y, z);
			if (s == null || s.isAir() || s.getBlock() instanceof DoorBlock || s.getBlock() instanceof WallSignBlock
				|| !s.isCollisionShapeFullBlock(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, net.minecraft.core.BlockPos.ZERO)) {
				return false;
			}
		}
		return true;
	}
}
