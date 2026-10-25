package com.modernapartments.build.complex;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.interior.Amenities;
import com.modernapartments.build.interior.Cores;
import com.modernapartments.build.interior.Corridors;
import com.modernapartments.build.interior.Furnish;
import com.modernapartments.build.interior.InteriorStyle.Theme;
import com.modernapartments.build.interior.Landscape;
import com.modernapartments.build.interior.RoomGrid;
import com.modernapartments.build.interior.Signage;
import com.modernapartments.build.interior.UnitBuilder;
import com.modernapartments.build.interior.UnitBuilder.Type;
import com.modernapartments.registry.ModBlocks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;

/**
 * The Urban Lofts: a converted brick warehouse. Three storeys of double-height lofts with mezzanine
 * bedrooms, exposed brick, steel beams and tall factory windows above a ground floor of creative shared
 * space: a gallery lobby, a café, a maker space, a boxing gym and co-working. A roof deck with a timber
 * water tower and string lights crowns the building.
 */
public final class UrbanLoftsBuilder extends ComplexBase {
	private static final int G = 1;
	private static final int G_H = 6;
	private static final int H = 9;
	private static final int FLOORS = 3;
	private static final int ROOF = G + G_H + FLOORS * H;
	private static final int OW = 4;
	private static final int OE = 67;
	private static final int ON = 6;
	private static final int OS = 46;
	private static final int X0 = 6;
	private static final int X1 = 65;
	private static final int ZF = 8;
	private static final int D = 16;
	private static final int CZ0 = 25;
	private static final int CZ1 = 27;
	private static final int ZB = 29;

	private UnitBuilder.Facade loftFacade;
	private Corridors.Style hall;
	private final List<Runnable> furnishLater = new ArrayList<>();
	private final List<Cores.Floor> floors = new ArrayList<>();

	@Override
	protected ComplexType type() {
		return ComplexType.URBAN_LOFTS;
	}

	@Override
	protected void generate() {
		loftFacade = new UnitBuilder.Facade(b("brick_exposed"), b("brick_red"), b("brick_charcoal"), b("factory_window"), null, 0,
			UnitBuilder.WindowStyle.TALL, false, false);
		hall = new Corridors.Style(b("polished_concrete"), ModBlocks.RUNNER_RUGS.get(2), ModBlocks.CEILING_FINISH_WOOD, ModBlocks.GARAGE_LIGHT,
			ModBlocks.WALL_SCONCE);
		floors.add(new Cores.Floor(G, G_H, "L"));
		for (int f = 0; f < FLOORS; f++) {
			floors.add(new Cores.Floor(G + G_H + f * H, H, String.valueOf(f + 2)));
		}
		floors.add(new Cores.Floor(ROOF, 5, "R"));
		site();
		groundFloor();
		for (int f = 0; f < FLOORS; f++) {
			loftFloor(f + 2, G + G_H + f * H);
		}
		roof();
		cores();
		furnishLater.forEach(Runnable::run);
		for (Cores.Floor f : floors.subList(0, floors.size() - 1)) {
			envelope(OW, ON, OE, OS, f.y0(), f.height(), b("brick_red"), b("brick_charcoal"), b("brick_exposed"));
		}
		buf.addMarker("entrance", 35, G + 1, 3, "main entrance");
	}

	// ================================================================================== plate
	private void plate(int y0, int h) {
		c.fill(OW, y0, ON, OE, y0, OS, b("polished_concrete"));
		Corridors.corridor(c, X0, CZ0, X1, CZ1, y0, h, hall);
		// exposed beams over the corridor and windows at both ends
		for (int x = X0 + 2; x < X1; x += 4) {
			c.fill(x, y0 + h, CZ0, x, y0 + h, CZ1, ModBlocks.STEEL_BEAM.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
		}
		for (int x : new int[] {OW, OW + 1, OE - 1, OE}) {
			c.fill(x, y0 + 1, CZ0, x, y0 + h - 1, CZ1, b("factory_window"));
			c.fill(x, y0 + h, CZ0, x, y0 + h, CZ1, b("brick_charcoal"));
		}
		c.fill(OW + 1, y0, CZ0, OW + 1, y0, CZ1, b("polished_concrete"));
		c.fill(OE - 1, y0, CZ0, OE - 1, y0, CZ1, b("polished_concrete"));
		// solid fill behind the stairs and the elevator
		int stairEnd = ZB + Cores.stairDepth(H);
		c.fill(X0, y0 + 1, stairEnd + 1, 10, y0 + h, OS - 2, b("brick_exposed"));
		c.fill(61, y0 + 1, stairEnd + 1, X1, y0 + h, OS - 2, b("brick_exposed"));
		c.fill(26, y0 + 1, ZB + 4, 30, y0 + h, OS - 2, b("brick_exposed"));
	}

	// ================================================================================== lofts
	private void loftFloor(int floor, int y0) {
		int h = H - 1;
		plate(y0, h);
		UnitLook look = new UnitLook(loftFacade, new Theme[] {Theme.INDUSTRIAL, Theme.INDUSTRIAL, Theme.MODERN}, b("brick_exposed"),
			ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL), Blocks.SPRUCE_WALL_SIGN, DyeColor.WHITE, true);
		UnitBuilder.Balcony juliet = new UnitBuilder.Balcony(1, b("metal_panel_graphite"), ModBlocks.METAL_RAILING);
		List<Slot> slots = List.of(
			Slot.of(X0, ZF, 14, D, Direction.SOUTH, true, Type.LOFT, 1, Direction.NORTH, Direction.WEST),
			Slot.of(21, ZF, 14, D, Direction.SOUTH, false, Type.LOFT, 2, Direction.NORTH),
			Slot.of(36, ZF, 14, D, Direction.SOUTH, true, Type.LOFT, 3, Direction.NORTH),
			Slot.of(51, ZF, 15, D, Direction.SOUTH, false, Type.LOFT, 4, Direction.NORTH, Direction.EAST),
			Slot.of(12, ZB, 13, D, Direction.NORTH, false, Type.LOFT, 5, Direction.SOUTH),
			Slot.of(32, ZB, 13, D, Direction.NORTH, true, Type.LOFT, 6, Direction.SOUTH),
			Slot.of(46, ZB, 14, D, Direction.NORTH, false, Type.LOFT, 7, Direction.SOUTH));
		for (int i = 0; i < slots.size(); i++) {
			Slot s = slots.get(i);
			String number = String.format("%d%02d", floor, i + 1);
			unit(s, y0, h, floor, number, look, (s.stack() + floor) % 2 == 0 ? juliet : null);
		}
	}

	// ================================================================================== ground floor
	private void groundFloor() {
		int y0 = G;
		int h = G_H - 1;
		plate(y0, h);
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		UnitBuilder.Facade storefront = new UnitBuilder.Facade(b("brick_exposed"), b("brick_red"), b("brick_charcoal"), b("factory_window"),
			b("metal_panel_graphite"), 3, UnitBuilder.WindowStyle.TALL, false, true);
		Object[][] rooms = {
			{"cafe", X0, ZF, 14, Direction.SOUTH, true, Direction.WEST},
			{"lobby", 21, ZF, 29, Direction.SOUTH, true, null},
			{"maker", 51, ZF, 15, Direction.SOUTH, true, Direction.EAST},
			{"boxing", 12, ZB, 13, Direction.NORTH, false, null},
			{"cowork", 32, ZB, 13, Direction.NORTH, false, null},
			{"mail", 46, ZB, 14, Direction.NORTH, false, null},
		};
		for (Object[] room : rooms) {
			String name = (String) room[0];
			int x0 = (Integer) room[1];
			int z0 = (Integer) room[2];
			int w = (Integer) room[3];
			Direction front = (Direction) room[4];
			boolean mirror = (Boolean) room[5];
			Direction side = (Direction) room[6];
			Canvas f = c.frame(x0, y0, z0, w, D, front, mirror);
			Block floor = switch (name) {
				case "boxing" -> b("rubber_flooring");
				case "cafe", "lobby" -> b("hardwood_walnut");
				default -> b("polished_concrete");
			};
			Amenities.shell(f, w, D, h, floor, b("brick_exposed"), ModBlocks.CEILING_FINISH_WOOD);
			for (int z = 2; z < D; z += 4) {
				f.fill(0, h, z, w - 1, h, z, ModBlocks.STEEL_BEAM.defaultBlockState()
					.setValue(RotatedPillarBlock.AXIS, f.dir(Direction.EAST).getAxis()));
			}
			f.door(w / 2, 1, -1, name.equals("boxing") || name.equals("mail") ? ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL) : glassDoor,
				Direction.SOUTH, DoorHingeSide.LEFT, name.equals("lobby"));
			boolean street = front == Direction.SOUTH;
			glazeRoom(f, storefront, w, D, h, street && !name.equals("maker"), side != null && f.dir(Direction.WEST) == side,
				side != null && f.dir(Direction.EAST) == side);
			furnishLater.add(() -> {
				switch (name) {
					case "cafe" -> cafe(f, w, D, h);
					case "lobby" -> Amenities.lobby(f, w, D, h, r, Theme.INDUSTRIAL, ModBlocks.RECEPTION_DESK_WALNUT, "URBAN LOFTS",
						"DIRECTORY", "L  Gallery, Cafe", "L  Maker, Boxing", "2-4 Lofts", "R  Roof Deck");
					case "maker" -> makerSpace(f, w, D, h);
					case "boxing" -> Amenities.boxingGym(f, w, D, h, r);
					case "cowork" -> Amenities.cowork(f, w, D, h, r);
					default -> Amenities.mailRoom(f, w, D, h, r);
				}
				marker(f, w, D, switch (name) {
					case "cafe" -> "loft cafe";
					case "lobby" -> "gallery lobby";
					case "maker" -> "maker space";
					case "boxing" -> "boxing gym";
					case "cowork" -> "co-working";
					default -> "mail & bikes";
				});
			});
		}
		c.put(37, y0 + 2, ON, ModBlocks.INTERCOM, Direction.NORTH);
		c.put(34, y0 + 2, ON, ModBlocks.KEYCARD_READER, Direction.NORTH);
		// steel loading-dock canopy along the street
		c.fill(20, y0 + h, 2, 51, y0 + h, ON - 1, b("metal_panel_graphite"));
		for (int x = 22; x <= 49; x += 9) {
			c.set(x, y0 + h - 1, 3, ModBlocks.GARAGE_LIGHT);
			c.fill(x, y0 + 1, 2, x, y0 + h - 1, 2, ModBlocks.STEEL_BEAM.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y));
		}
	}

	private void cafe(Canvas f, int w, int d, int h) {
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.INDUSTRIAL);
		List<int[]> run = Furnish.kitchenRun(g, Direction.NORTH, new ArrayList<>(g.side(Direction.NORTH).subList(0, Math.min(w, 7))));
		if (run.size() >= 4) {
			Furnish.island(g, Direction.NORTH, run, 3);
		}
		for (int z = 6; z < d - 2; z += 3) {
			for (int x = 1; x < w - 1; x += 4) {
				if (Furnish.placeIfFree(g, new int[] {x, z}, ModBlocks.DINING_TABLES.get(ModBlocks.TableStyle.BLACK), Direction.NORTH)) {
					Furnish.placeIfFree(g, new int[] {x - 1, z}, ModBlocks.DINING_CHAIRS.get(ModBlocks.ChairStyle.OAK), Direction.EAST);
					Furnish.placeIfFree(g, new int[] {x + 1, z}, ModBlocks.DINING_CHAIRS.get(ModBlocks.ChairStyle.OAK), Direction.WEST);
				}
			}
		}
		Furnish.wallItem(g, w - 1, 2, Direction.EAST, 2, ModBlocks.WHITEBOARD);
		Amenities.finish(g, true);
		for (int x = 2; x < w - 1; x += 3) {
			f.set(x, h, 3, ModBlocks.PENDANT_LIGHT_BLACK);
		}
	}

	private void makerSpace(Canvas f, int w, int d, int h) {
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.INDUSTRIAL);
		for (int z = 2; z < d - 2; z += 3) {
			for (int x = 2; x < w - 2; x += 4) {
				if (Furnish.placeIfFree(g, new int[] {x, z}, ModBlocks.DESK_WALNUT, Direction.SOUTH)) {
					Furnish.placeIfFree(g, new int[] {x + 1, z}, ModBlocks.DESK_WALNUT, Direction.SOUTH);
					Furnish.placeIfFree(g, new int[] {x, z + 1}, ModBlocks.BAR_STOOL_BLACK, Direction.NORTH);
					g.flush();
					Furnish.tabletop(g, x, 2, z, x % 3 == 0 ? ModBlocks.PRINTER : ModBlocks.LAPTOP, Direction.SOUTH, ModBlocks.DESK_WALNUT);
				}
			}
		}
		for (int z = 1; z < d - 1; z += 2) {
			Furnish.wallItem(g, 0, z, Direction.WEST, 2, ModBlocks.WALL_SHELF);
		}
		for (int x = 2; x < w - 2; x += 2) {
			Furnish.wallItem(g, x, d - 1, Direction.SOUTH, 2, ModBlocks.WHITEBOARD);
		}
		Amenities.finish(g, false);
		Signage.wayfinding(f, w / 2 + 2, 2, 0, Direction.SOUTH, "MAKER SPACE", "3D printing, tools", "& workbenches");
	}

	// ================================================================================== roof
	private void roof() {
		int y0 = ROOF;
		c.fill(OW, y0, ON, OE, y0, OS, b("concrete_panel_gray"));
		c.walls(OW, y0 + 1, ON, OE, y0 + 2, OS, b("brick_red").defaultBlockState());
		// cornice
		for (int x = OW - 1; x <= OE + 1; x++) {
			c.set(x, y0 + 2, ON - 1, Blocks.STONE_BRICK_SLAB);
			c.set(x, y0 + 2, OS + 1, Blocks.STONE_BRICK_SLAB);
		}
		for (int z = ON; z <= OS; z++) {
			c.set(OW - 1, y0 + 2, z, Blocks.STONE_BRICK_SLAB);
			c.set(OE + 1, y0 + 2, z, Blocks.STONE_BRICK_SLAB);
		}
		// name in warm lights on the street parapet
		c.fill(13, y0 + 2, ON, 57, y0 + 7, ON, b("brick_charcoal"));
		Signage.centredLetters(c, 35, y0 + 2, ON - 1, Direction.WEST, "URBAN LOFTS", Blocks.SHROOMLIGHT);
		// deck with string lights, seating and grills
		c.fill(14, y0, 9, 57, y0, 22, Blocks.SPRUCE_PLANKS);
		Furnish.balcony(c, r, 15, 10, 24, 16, Direction.NORTH, true);
		Furnish.balcony(c, r, 47, 10, 56, 16, Direction.NORTH, true);
		for (int x = 28; x <= 44; x += 4) {
			c.put(x, y0 + 1, 12, ModBlocks.PICNIC_TABLE, Direction.EAST);
		}
		c.put(27, y0 + 1, 19, ModBlocks.BBQ_GRILL, Direction.NORTH);
		c.put(45, y0 + 1, 19, ModBlocks.BBQ_GRILL, Direction.NORTH);
		Landscape.stringLights(c, 15, 18, 56, 18, y0 + 1);
		Landscape.firePit(c, 36, y0 + 1, 19);
		buf.addMarker("amenity", 36, y0 + 1, 15, "roof deck");
		// timber water tower on steel legs
		int tx = 50;
		int tz = 36;
		for (int[] leg : new int[][] {{0, 0}, {4, 0}, {0, 4}, {4, 4}}) {
			c.fill(tx + leg[0], y0 + 1, tz + leg[1], tx + leg[0], y0 + 5, tz + leg[1],
				ModBlocks.STEEL_BEAM.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y));
		}
		c.fill(tx, y0 + 6, tz, tx + 4, y0 + 6, tz + 4, Blocks.SPRUCE_SLAB);
		for (int y = y0 + 7; y <= y0 + 11; y++) {
			c.walls(tx, y, tz, tx + 4, y, tz + 4, Blocks.SPRUCE_PLANKS.defaultBlockState());
			if (y == y0 + 8 || y == y0 + 10) {
				c.walls(tx, y, tz, tx + 4, y, tz + 4, Blocks.STRIPPED_DARK_OAK_WOOD.defaultBlockState());
			}
		}
		c.fill(tx + 1, y0 + 12, tz + 1, tx + 3, y0 + 12, tz + 3, Blocks.SPRUCE_SLAB);
		c.set(tx + 2, y0 + 13, tz + 2, Blocks.SPRUCE_FENCE);
		// skylights and rooftop units
		for (int x = 14; x < 44; x += 8) {
			c.fill(x, y0, 33, x + 2, y0, 37, Blocks.GLASS);
		}
		hvac(14, y0 + 1, 40);
	}

	// ================================================================================== cores
	private void cores() {
		Cores.StairStyle stairs = Cores.StairStyle.brick();
		int depth = Cores.stairDepth(H);
		Cores.stairCore(c.frame(X0, 0, ZB, Cores.STAIR_WIDTH, depth, Direction.NORTH, false), stairs, floors, "STAIR A");
		Cores.stairCore(c.frame(61, 0, ZB, Cores.STAIR_WIDTH, depth, Direction.NORTH, false), stairs, floors, "STAIR B");
		Cores.elevatorBank(c.frame(27, 0, ZB, 3, 3, Direction.NORTH, false),
			new Cores.ElevatorStyle(1, 3, 3, ModBlocks.get("metal_panel_graphite"), ModBlocks.get("brick_exposed")), floors);
		for (Cores.Floor f : floors) {
			if (f.y0() > G && f.y0() < ROOF) {
				Signage.sign(c, 25, f.y0() + 2, CZ1, Direction.NORTH, Blocks.SPRUCE_WALL_SIGN, DyeColor.WHITE, "LOFTS " + f.label() + "01-"
					+ f.label() + "07", "Freight elevator", "Roof deck: R", "");
			}
		}
	}

	// ================================================================================== site
	private void site() {
		int g = groundY;
		pave(0, 0, 71, 5, b("sidewalk"));
		pave(20, 1, 51, 5, b("pavers_charcoal"));
		for (int x = 2; x < 70; x += 8) {
			if (x >= 20 && x <= 51) {
				continue;
			}
			c.set(x, g, 1, Blocks.COARSE_DIRT);
			Landscape.tree(c, x, g + 1, 1, Landscape.Tree.BIRCH, r);
		}
		Landscape.lampsAlong(c, 0, 4, 70, 4, g + 1, 14);
		for (int x = 54; x <= 64; x += 2) {
			c.put(x, g + 1, 3, ModBlocks.BIKE_RACK, Direction.NORTH);
		}
		// café terrace on the sidewalk
		for (int x = 7; x <= 16; x += 3) {
			c.put(x, g + 1, 3, ModBlocks.PICNIC_TABLE, Direction.EAST);
		}
		c.put(6, g + 1, 2, ModBlocks.UMBRELLAS.get(0), Direction.NORTH);
		c.put(17, g + 1, 2, ModBlocks.UMBRELLAS.get(1), Direction.NORTH);
		// rear yard: parking, picnic tables, planters
		pave(0, 47, 71, 55, b("asphalt"));
		Landscape.parkingRow(c.frame(6, g, 50, 39, 5, Direction.SOUTH, true), 13, 4, false);
		Landscape.lawn(c, 48, 47, 71, 55, g, r, 0.06);
		Landscape.bbq(c.translate(50, g, 48), 18, 6, r);
		Landscape.lawn(c, 0, 6, 3, 46, g, r, 0.04);
		Landscape.lawn(c, 68, 6, 71, 46, g, r, 0.04);
		for (int z = 10; z < 45; z += 8) {
			Landscape.tree(c, 1, g + 1, z, Landscape.Tree.OAK, r);
			Landscape.tree(c, 70, g + 1, z, Landscape.Tree.OAK, r);
		}
		Signage.sign(c, 20, g + 2, 2, Direction.NORTH, Blocks.SPRUCE_WALL_SIGN, DyeColor.ORANGE, "URBAN LOFTS", "Est. 1921", "88 Foundry St",
			"Lofts for lease");
		c.fill(19, g + 1, 3, 21, g + 2, 3, b("brick_charcoal"));
	}
}
