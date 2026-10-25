package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.Inits;
import com.modernapartments.registry.ModBlocks;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;

/**
 * Vertical circulation: switchback stair cores and elevator banks. Both are authored in their own frame
 * (x across, z away from the corridor, the corridor wall at z = -1) and stacked over a list of floors.
 */
public final class Cores {
	private Cores() {
	}

	/** One storey served by a core: floor slab at {@code y0}, next slab at {@code y0 + height}. */
	public record Floor(int y0, int height, String label, boolean door) {
		public Floor(int y0, int height, String label) {
			this(y0, height, label, true);
		}
	}

	/** Materials of a stair core. */
	public record StairStyle(Block stair, Block landing, Block wall, Block door) {
		public static StairStyle concrete() {
			return new StairStyle(Blocks.POLISHED_ANDESITE_STAIRS, Blocks.POLISHED_ANDESITE, ModBlocks.get("concrete_panel_gray"),
				ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL));
		}

		public static StairStyle brick() {
			return new StairStyle(Blocks.DARK_OAK_STAIRS, ModBlocks.get("polished_concrete"), ModBlocks.get("brick_exposed"),
				ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL));
		}
	}

	public static final int STAIR_WIDTH = 5;

	/** Interior depth of a stair core serving floors up to {@code maxHeight} tall. */
	public static int stairDepth(int maxHeight) {
		return 4 + (maxHeight + 1) / 2;
	}

	/**
	 * Switchback stair: x 0..4 (lane A x 0-1 up, centre wall x 2, lane B x 3-4 up), z 0..depth-1, landing at
	 * z 0-1 with the corridor door at x 2. The topmost floor in the list is the last landing; stairs rise from
	 * every other floor to the next. Walls are drawn around the whole core.
	 */
	public static void stairCore(Canvas c, StairStyle style, List<Floor> floors, String name) {
		int depth = 0;
		for (Floor f : floors) {
			depth = Math.max(depth, stairDepth(f.height()));
		}
		Floor top = floors.get(floors.size() - 1);
		int yMin = floors.get(0).y0();
		int yMax = top.y0() + top.height();
		// shaft walls
		c.fill(-1, yMin, -1, STAIR_WIDTH, yMax, -1, style.wall());
		c.fill(-1, yMin, depth, STAIR_WIDTH, yMax, depth, style.wall());
		c.fill(-1, yMin, -1, -1, yMax, depth, style.wall());
		c.fill(STAIR_WIDTH, yMin, -1, STAIR_WIDTH, yMax, depth, style.wall());
		c.clear(0, yMin + 1, 0, STAIR_WIDTH - 1, yMax - 1, depth - 1);
		c.fill(0, yMax, 0, STAIR_WIDTH - 1, yMax, depth - 1, style.landing());
		for (int i = 0; i < floors.size(); i++) {
			Floor f = floors.get(i);
			int y0 = f.y0();
			// landing slab at this floor
			c.fill(0, y0, 0, STAIR_WIDTH - 1, y0, 1, style.landing());
			if (i > 0) {
				// landing extension where the lower flight arrives short of the landing
				Floor below = floors.get(i - 1);
				int a = (below.height() + 1) / 2;
				int b = below.height() - a;
				if (a > b) {
					c.fill(3, y0, 2, 4, y0, 1 + a - b, style.landing());
				}
			} else {
				c.fill(0, y0, 0, STAIR_WIDTH - 1, y0, depth - 1, style.landing());
			}
			if (f.door()) {
				c.door(2, y0 + 1, -1, style.door(), Direction.SOUTH, DoorHingeSide.LEFT, false);
				c.put(2, y0 + Math.min(3, f.height() - 1), -2, ModBlocks.EXIT_SIGN, Direction.NORTH);
				c.wallSign(0, y0 + 2, 0, Blocks.SPRUCE_WALL_SIGN, Direction.EAST,
					Inits.sign(DyeColor.WHITE, true, false, name, "Floor " + f.label(), "", "Exit at Lobby"));
			}
			c.put(4, y0 + Math.min(3, f.height() - 1), 0, ModBlocks.WALL_SCONCE, Direction.SOUTH);
			if (i == floors.size() - 1) {
				continue;
			}
			int h = f.height();
			int a = (h + 1) / 2;
			int b = h - a;
			// centre wall between the flights
			c.fill(2, y0 + 1, 2, 2, y0 + h, 1 + a, style.wall());
			// flight A: up towards the back
			for (int k = 0; k < a; k++) {
				for (int x = 0; x <= 1; x++) {
					c.stairs(x, y0 + 1 + k, 2 + k, style.stair(), Direction.SOUTH, false);
				}
			}
			// half landing at the back
			c.fill(0, y0 + a, 2 + a, STAIR_WIDTH - 1, y0 + a, depth - 1, style.landing());
			c.put(0, y0 + a + Math.min(3, h - 2), depth - 1, ModBlocks.WALL_SCONCE, Direction.NORTH);
			// flight B: up towards the front
			for (int k = 0; k < b; k++) {
				for (int x = 3; x <= 4; x++) {
					c.stairs(x, y0 + a + 1 + k, 1 + a - k, style.stair(), Direction.NORTH, false);
				}
			}
		}
	}

	/** Elevator bank materials and size. */
	public record ElevatorStyle(int cars, int cabW, int cabD, Block shaftWall, Block lobbyWall) {
	}

	/** Width of a bank including the outer walls. */
	public static int elevatorWidth(ElevatorStyle s) {
		return s.cars() * (s.cabW() + 1) + 1;
	}

	/**
	 * Elevator bank: cars side by side, cab k interior x from k*(cabW+1) to k*(cabW+1)+cabW-1, z 0..cabD-1,
	 * sliding doors in the front wall (z = -1) facing the lobby. A cab floor (with its label) is placed at
	 * every floor in {@code stops}; the shaft is walled from the lowest to the highest stop.
	 */
	public static void elevatorBank(Canvas c, ElevatorStyle s, List<Floor> stops) {
		int width = elevatorWidth(s) - 1;
		Floor top = stops.get(stops.size() - 1);
		int yMin = stops.get(0).y0();
		int yMax = top.y0() + top.height();
		c.fill(-1, yMin, -1, width - 1, yMax, -1, s.lobbyWall());
		c.fill(-1, yMin, s.cabD(), width - 1, yMax, s.cabD(), s.shaftWall());
		for (int k = 0; k <= s.cars(); k++) {
			int wx = k * (s.cabW() + 1) - 1;
			c.fill(wx, yMin, 0, wx, yMax, s.cabD() - 1, s.shaftWall());
		}
		c.fill(-1, yMax, -1, width - 1, yMax, s.cabD(), s.shaftWall());
		// open shaft between stops: building slabs of floors the cars skip are removed
		for (int k = 0; k < s.cars(); k++) {
			int x0 = k * (s.cabW() + 1);
			c.clear(x0, yMin, 0, x0 + s.cabW() - 1, yMax - 1, s.cabD() - 1);
		}
		for (Floor f : stops) {
			int y0 = f.y0();
			int h = f.height() - 1;
			for (int k = 0; k < s.cars(); k++) {
				int x0 = k * (s.cabW() + 1);
				int x1 = x0 + s.cabW() - 1;
				c.fill(x0, y0, 0, x1, y0, s.cabD() - 1, ModBlocks.ELEVATOR_FLOOR);
				for (int x = x0; x <= x1; x++) {
					for (int z = 0; z < s.cabD(); z++) {
						c.init(x, y0, z, Inits.elevatorFloor(f.label()));
					}
				}
				c.clear(x0, y0 + 1, 0, x1, y0 + h - 1, s.cabD() - 1);
				c.fill(x0, y0 + h, 0, x1, y0 + h, s.cabD() - 1, ModBlocks.CEILING_LED_PANEL);
				if (!f.door()) {
					continue;
				}
				int dx = x0 + (s.cabW() - 2) / 2;
				c.elevatorDoors(dx, y0 + 1, -1, Direction.NORTH);
				c.put(x1, y0 + 2, s.cabD() - 1, ModBlocks.ELEVATOR_PANEL, Direction.WEST);
				c.put(dx + 2, y0 + 2, -2, ModBlocks.ELEVATOR_CALL_BUTTON, Direction.NORTH);
				if (h >= 4) {
					c.wallSign(dx, y0 + 3, -2, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
						Inits.sign(DyeColor.ORANGE, true, false, "", f.label(), "", ""));
				}
			}
		}
	}
}
