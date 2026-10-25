package com.modernapartments.build.complex;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.interior.Amenities;
import com.modernapartments.build.interior.Cores;
import com.modernapartments.build.interior.Corridors;
import com.modernapartments.build.interior.Furnish;
import com.modernapartments.build.interior.InteriorStyle.Theme;
import com.modernapartments.build.interior.Landscape;
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
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.FarmBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;

/**
 * The Parkside Residences: a six-storey brick and panel mid-rise wrapped in a U around a garden
 * courtyard. Family amenities (kids' club, fitness, lounge opening onto the courtyard), ground-floor homes
 * with patios, a rooftop terrace, and a park with playground, community garden, dog park, splash pad and
 * surface parking.
 */
public final class ParksideBuilder extends ComplexBase {
	private static final int G = 1;
	private static final int G_H = 5;
	private static final int H = 4;
	private static final int FLOORS = 5;
	private static final int ROOF = G + G_H + FLOORS * H;
	// front wing (along the street)
	private static final int FRONT_Z = 8;
	private static final int D = 11;
	private static final int FC0 = 20;
	private static final int FC1 = 22;
	private static final int BACK_Z = 24;
	// side wings
	private static final int WEST_UNITS_X = 8;
	private static final int WC0 = 20;
	private static final int WC1 = 22;
	private static final int WEST_INNER_X = 24;
	private static final int EAST_INNER_X = 61;
	private static final int EC0 = 73;
	private static final int EC1 = 75;
	private static final int EAST_UNITS_X = 77;
	private static final int WING_Z0 = 37;
	private static final int WING_Z1 = 70;
	private static final int X0 = 8;
	private static final int X1 = 87;

	private static final Cores.ElevatorStyle ELEVATORS = new Cores.ElevatorStyle(2, 3, 3, ModBlocks.get("elevator_wall"),
		ModBlocks.get("drywall_greige"));

	private UnitLook brick;
	private UnitLook panel;
	private Corridors.Style hall;
	private final List<Runnable> furnishLater = new ArrayList<>();
	private final List<Cores.Floor> floors = new ArrayList<>();

	@Override
	protected ComplexType type() {
		return ComplexType.PARKSIDE;
	}

	private static int y0(int floor) {
		return floor == 1 ? G : G + G_H + (floor - 2) * H;
	}

	@Override
	protected void generate() {
		Theme[] themes = {Theme.FAMILY, Theme.FAMILY, Theme.MODERN, Theme.CLASSIC};
		UnitBuilder.Facade brickFacade = new UnitBuilder.Facade(b("drywall_white"), b("brick_red"), b("brick_red"), b("window_glass"),
			b("mullion_black"), 2, UnitBuilder.WindowStyle.STANDARD, false, false);
		UnitBuilder.Facade panelFacade = new UnitBuilder.Facade(b("drywall_white"), b("facade_panel_gray"), b("facade_panel_charcoal"),
			b("window_glass"), b("mullion_black"), 2, UnitBuilder.WindowStyle.STANDARD, false, false);
		brick = new UnitLook(brickFacade, themes, b("drywall_white"), ModBlocks.DOORS.get(ModBlocks.DoorStyle.OAK), Blocks.BIRCH_WALL_SIGN,
			DyeColor.BLACK, false);
		panel = new UnitLook(panelFacade, themes, b("drywall_white"), ModBlocks.DOORS.get(ModBlocks.DoorStyle.OAK), Blocks.BIRCH_WALL_SIGN,
			DyeColor.BLACK, false);
		hall = new Corridors.Style(b("hardwood_light"), ModBlocks.RUNNER_RUGS.get(1), ModBlocks.CEILING_FINISH, ModBlocks.CEILING_DOWNLIGHT,
			ModBlocks.WALL_SCONCE);
		for (int f = 1; f <= FLOORS + 1; f++) {
			floors.add(new Cores.Floor(y0(f), f == 1 ? G_H : H, f == 1 ? "L" : String.valueOf(f)));
		}
		floors.add(new Cores.Floor(ROOF, H, "R"));
		site();
		for (int f = 1; f <= FLOORS + 1; f++) {
			storey(f);
		}
		roof();
		cores();
		furnishLater.forEach(Runnable::run);
		for (Cores.Floor f : floors.subList(0, floors.size() - 1)) {
			Block brick = b("brick_red");
			Block lining = b("drywall_white");
			facade(6, 6, 89, 6, Direction.SOUTH, f.y0(), f.height(), brick, brick, lining);
			facade(6, 6, 6, 72, Direction.EAST, f.y0(), f.height(), brick, brick, lining);
			facade(89, 6, 89, 72, Direction.WEST, f.y0(), f.height(), brick, brick, lining);
			facade(36, 36, 59, 36, Direction.NORTH, f.y0(), f.height(), brick, brick, lining);
			facade(36, 36, 36, 72, Direction.WEST, f.y0(), f.height(), brick, brick, lining);
			facade(59, 36, 59, 72, Direction.EAST, f.y0(), f.height(), brick, brick, lining);
			facade(6, 72, 36, 72, Direction.NORTH, f.y0(), f.height(), brick, brick, lining);
			facade(59, 72, 89, 72, Direction.NORTH, f.y0(), f.height(), brick, brick, lining);
		}
		buf.addMarker("entrance", 48, G + 1, 1, "main entrance");
	}

	// ================================================================================== storeys
	private void storey(int floor) {
		int y0 = y0(floor);
		int height = floor == 1 ? G_H : H;
		int h = height - 1;
		// slabs for the three wings
		c.fill(6, y0, 6, 89, y0, 36, b("polished_concrete"));
		c.fill(6, y0, 36, 36, y0, 72, b("polished_concrete"));
		c.fill(59, y0, 36, 89, y0, 72, b("polished_concrete"));
		// U-shaped corridor with windows at the wing ends
		Corridors.corridor(c, X0, FC0, X1, FC1, y0, h, hall);
		Corridors.corridor(c, WC0, FC1 + 1, WC1, WING_Z1, y0, h, hall);
		Corridors.corridor(c, EC0, FC1 + 1, EC1, WING_Z1, y0, h, hall);
		for (int[] end : new int[][] {{WC0, WC1}, {EC0, EC1}}) {
			c.fill(end[0], y0, 71, end[1], y0, 71, b("hardwood_light"));
			if (floor == 1) {
				c.fill(end[0], y0 + 1, 71, end[1], y0 + h, 72, b("brick_red"));
				c.door(end[0] + 1, y0 + 1, 72, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.LEFT, false);
				c.fill(end[0] + 1, y0 + 1, 71, end[0] + 1, y0 + 2, 71, Blocks.AIR);
				c.set(end[0] + 1, y0 + 3, 73, ModBlocks.CEILING_DOWNLIGHT);
			} else {
				c.fill(end[0], y0 + 1, 71, end[1], y0 + h - 1, 72, b("window_glass"));
				c.fill(end[0], y0 + h, 71, end[1], y0 + h, 72, b("brick_red"));
			}
		}
		int stackBase = floor == 1 ? 100 : 0;
		List<Slot> slots = new ArrayList<>();
		// side wings: two homes on each side of each corridor
		for (int side = 0; side < 2; side++) {
			boolean west = side == 0;
			int outerX = west ? WEST_UNITS_X : EAST_UNITS_X;
			int innerX = west ? WEST_INNER_X : EAST_INNER_X;
			Direction outerFront = west ? Direction.EAST : Direction.WEST;
			Direction innerFront = west ? Direction.WEST : Direction.EAST;
			Direction outerSide = west ? Direction.WEST : Direction.EAST;
			Direction innerSide = west ? Direction.EAST : Direction.WEST;
			int s = side * 4;
			slots.add(Slot.of(outerX, WING_Z0, 19, D, outerFront, false, Type.TWO_BED, stackBase + 10 + s, outerSide));
			slots.add(Slot.of(outerX, 57, 14, D, outerFront, true, Type.ONE_BED, stackBase + 11 + s, outerSide, Direction.SOUTH));
			slots.add(Slot.of(innerX, WING_Z0, 19, D, innerFront, true, Type.TWO_BED, stackBase + 12 + s, innerSide));
			slots.add(Slot.of(innerX, 57, 14, D, innerFront, false, Type.ONE_BED, stackBase + 13 + s, innerSide, Direction.SOUTH));
		}
		// demising walls between the two homes of each wing side
		for (int x : new int[] {WEST_UNITS_X, WEST_INNER_X, EAST_INNER_X, EAST_UNITS_X}) {
			c.fill(x - 1, y0 + 1, 56, x + D, y0 + h, 56, b("drywall_white"));
		}
		if (floor == 1) {
			groundFront(y0, h);
		} else {
			slots.add(Slot.of(X0, FRONT_Z, 19, D, Direction.SOUTH, true, Type.TWO_BED, 1, Direction.NORTH, Direction.WEST));
			slots.add(Slot.of(28, FRONT_Z, 12, D, Direction.SOUTH, false, Type.ONE_BED, 2, Direction.NORTH));
			slots.add(Slot.of(41, FRONT_Z, 14, D, Direction.SOUTH, true, floor % 2 == 0 ? Type.ONE_BED : Type.STUDIO, 3, Direction.NORTH));
			slots.add(Slot.of(56, FRONT_Z, 12, D, Direction.SOUTH, false, Type.ONE_BED, 4, Direction.NORTH));
			slots.add(Slot.of(69, FRONT_Z, 19, D, Direction.SOUTH, false, Type.TWO_BED, 5, Direction.NORTH, Direction.EAST));
			slots.add(Slot.of(47, BACK_Z, 12, D, Direction.NORTH, false, Type.ONE_BED, 6, Direction.SOUTH));
			cornerRooms(floor, y0, h);
		}
		c.fill(38, y0 + 1, 28, 44, y0 + h, 35, b("drywall_white"));
		c.fill(36, y0 + 1, 23, 36, y0 + h, 35, b("drywall_white"));
		c.fill(8, y0 + 1, 23, 18, y0 + h, 36, b("drywall_white"));
		c.fill(77, y0 + 1, 23, 87, y0 + h, 36, b("drywall_white"));
		UnitBuilder.Balcony balcony = new UnitBuilder.Balcony(2, b("pavers_gray"), ModBlocks.METAL_RAILING);
		UnitBuilder.Balcony patio = new UnitBuilder.Balcony(2, b("pavers_sand"), Blocks.DARK_OAK_FENCE);
		for (int i = 0; i < slots.size(); i++) {
			Slot s = slots.get(i);
			UnitLook look = (s.stack() % 3 == 1) ? panel : brick;
			String number = String.format("%d%02d", floor, i + 1);
			UnitBuilder.Balcony b = floor == 1 ? patio : (s.stack() % 2 == 0 || floor % 2 == 0 ? balcony : null);
			unit(s, y0, h, floor, number, look, b);
		}
	}

	/** Ground floor of the front wing: fitness, leasing, lobby, mail room, kids' club and the courtyard lounge. */
	private void groundFront(int y0, int h) {
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		UnitBuilder.Facade store = new UnitBuilder.Facade(b("drywall_white"), b("brick_charcoal"), b("brick_charcoal"), b("window_glass"),
			b("mullion_black"), 2, UnitBuilder.WindowStyle.TALL, false, true);
		Object[][] rooms = {
			{"fitness", X0, 19, true, false},
			{"leasing", 28, 12, false, false},
			{"lobby", 41, 14, false, false},
			{"mail", 56, 12, false, false},
			{"kids", 69, 19, false, true},
		};
		for (Object[] room : rooms) {
			String name = (String) room[0];
			int x0 = (Integer) room[1];
			int w = (Integer) room[2];
			boolean west = (Boolean) room[3];
			boolean east = (Boolean) room[4];
			Canvas f = c.frame(x0, y0, FRONT_Z, w, D, Direction.SOUTH, true);
			Block floor = switch (name) {
				case "fitness" -> b("rubber_flooring");
				case "kids" -> b("rubber_safety_surface");
				case "lobby" -> b("large_tile_light");
				default -> b("hardwood_light");
			};
			Amenities.shell(f, w, D, h, floor, b("drywall_white"), ModBlocks.CEILING_FINISH);
			f.door(w / 2, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, name.equals("lobby"));
			if (name.equals("lobby")) {
				f.door(w / 2 + 1, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.RIGHT, true);
			}
			glazeRoom(f, store, w, D, h, name.equals("lobby"), west, east);
			furnishLater.add(() -> {
				switch (name) {
					case "fitness" -> Amenities.fitness(f, w, D, h, r);
					case "leasing" -> Amenities.leasing(f, w, D, h, r, Theme.FAMILY);
					case "lobby" -> Amenities.lobby(f, w, D, h, r, Theme.FAMILY, ModBlocks.RECEPTION_DESK_WALNUT, "PARKSIDE",
						"DIRECTORY", "L  Lobby, Gym", "L  Kids' Club", "2-6 Residences", "3  Dog Spa", "4  Game Room", "5  Screening",
						"R  Roof Terrace");
					case "mail" -> Amenities.mailRoom(f, w, D, h, r);
					default -> Amenities.kidsRoom(f, w, D, h, r);
				}
				marker(f, w, D, switch (name) {
					case "fitness" -> "fitness center";
					case "leasing" -> "leasing office";
					case "lobby" -> "lobby";
					case "mail" -> "mail room";
					default -> "kids' club";
				});
			});
		}
		// entrance: intercom, keycard reader, canopy and the building name above the doors
		c.put(50, y0 + 2, 6, ModBlocks.INTERCOM, Direction.NORTH);
		c.put(47, y0 + 2, 6, ModBlocks.KEYCARD_READER, Direction.NORTH);
		c.fill(44, y0 + h, 3, 51, y0 + h, 5, b("metal_panel_graphite"));
		for (int x = 45; x <= 50; x += 5) {
			c.set(x, y0 + h - 1, 4, ModBlocks.CEILING_DOWNLIGHT);
		}
		// lounge on the courtyard side
		Canvas lounge = c.frame(47, y0, BACK_Z, 12, D, Direction.NORTH, false);
		Amenities.shell(lounge, 12, D, h, b("hardwood_light"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		lounge.door(6, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		glazeRoom(lounge, store, 12, D, h, true, false, false);
		// corner rooms: bike room and storage
		Canvas bikes = c.frame(WEST_INNER_X, y0, BACK_Z, 12, D, Direction.WEST, false);
		Amenities.shell(bikes, 12, D, h, b("polished_concrete"), b("concrete_panel_gray"), b("acoustic_ceiling"));
		bikes.door(5, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL), Direction.SOUTH, DoorHingeSide.LEFT, false);
		Canvas storage = c.frame(EAST_INNER_X, y0, BACK_Z, 12, D, Direction.EAST, false);
		Amenities.shell(storage, 12, D, h, b("polished_concrete"), b("concrete_panel_gray"), b("acoustic_ceiling"));
		storage.door(5, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL), Direction.SOUTH, DoorHingeSide.LEFT, false);
		furnishLater.add(() -> {
			Amenities.clubLounge(lounge, 12, D, h, r, Theme.FAMILY);
			Amenities.bikeRoom(bikes, 12, D, h, r);
			Amenities.storageRoom(storage, 12, D, h, r);
			marker(lounge, 12, D, "courtyard lounge");
			marker(bikes, 12, D, "bike room");
			marker(storage, 12, D, "storage");
		});
	}

	/**
	 * Upper-floor rooms in the wing corners: laundry on even floors and a study lounge on odd floors; opposite,
	 * resident storage, a dog spa, a game room or a screening room depending on the floor.
	 */
	private void cornerRooms(int floor, int y0, int h) {
		Canvas west = c.frame(WEST_INNER_X, y0, BACK_Z, 12, D, Direction.WEST, false);
		Amenities.shell(west, 12, D, h, b("large_tile_light"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		west.door(5, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.WHITE), Direction.SOUTH, DoorHingeSide.LEFT, true);
		String program = switch (floor) {
			case 3 -> "dog spa";
			case 4 -> "game room";
			case 5 -> "screening room";
			default -> "storage";
		};
		boolean storage = program.equals("storage");
		Canvas east = c.frame(EAST_INNER_X, y0, BACK_Z, 12, D, Direction.EAST, false);
		Block floorBlock = storage ? b("polished_concrete") : program.equals("dog spa") ? b("large_tile_light") : b("hardwood_walnut");
		Amenities.shell(east, 12, D, h, floorBlock, storage ? b("concrete_panel_gray") : b("drywall_greige"),
			storage ? b("acoustic_ceiling") : ModBlocks.CEILING_FINISH);
		east.door(5, 1, -1, ModBlocks.DOORS.get(storage ? ModBlocks.DoorStyle.STEEL : ModBlocks.DoorStyle.WHITE), Direction.SOUTH,
			DoorHingeSide.LEFT, false);
		furnishLater.add(() -> {
			if (floor % 2 == 0) {
				Amenities.laundryRoom(west, 12, D, h, r);
				marker(west, 12, D, "laundry floor " + floor);
			} else {
				Amenities.cowork(west, 12, D, h, r);
				marker(west, 12, D, "study lounge floor " + floor);
			}
			switch (program) {
				case "dog spa" -> Amenities.dogSpa(east, 12, D, h, r);
				case "game room" -> Amenities.gameRoom(east, 12, D, h, r);
				case "screening room" -> Amenities.mediaRoom(east, 12, D, h, r);
				default -> Amenities.storageRoom(east, 12, D, h, r);
			}
			marker(east, 12, D, program + " floor " + floor);
		});
	}

	// ================================================================================== roof
	private void roof() {
		int y0 = ROOF;
		c.fill(6, y0, 6, 89, y0, 36, b("concrete_panel_gray"));
		c.fill(6, y0, 36, 36, y0, 72, b("concrete_panel_gray"));
		c.fill(59, y0, 36, 89, y0, 72, b("concrete_panel_gray"));
		// parapets
		for (int[] box : new int[][] {{6, 6, 89, 36}, {6, 36, 36, 72}, {59, 36, 89, 72}}) {
			c.walls(box[0], y0 + 1, box[1], box[2], y0 + 1, box[3], b("brick_red").defaultBlockState());
		}
		c.fill(37, y0 + 1, 36, 58, y0 + 1, 36, b("brick_red"));
		c.fill(7, y0 + 1, 36, 35, y0 + 1, 36, Blocks.AIR);
		c.fill(60, y0 + 1, 36, 88, y0 + 1, 36, Blocks.AIR);
		// roof terrace over the front wing: deck, pergola-style string lights, seating and grills
		c.fill(28, y0, 7, 67, y0, 18, b("pavers_sand"));
		for (int x = 28; x <= 67; x++) {
			c.set(x, y0 + 1, 6, ModBlocks.METAL_RAILING);
		}
		Furnish.balcony(c, r, 29, 8, 38, 13, Direction.NORTH, true);
		Furnish.balcony(c, r, 57, 8, 66, 13, Direction.NORTH, true);
		for (int x = 41; x <= 54; x += 4) {
			c.put(x, y0 + 1, 9, ModBlocks.PICNIC_TABLE, Direction.EAST);
			c.put(x, y0 + 1, 15, ModBlocks.PLANTER_BOX, Direction.NORTH);
		}
		c.put(40, y0 + 1, 13, ModBlocks.BBQ_GRILL, Direction.SOUTH);
		c.put(55, y0 + 1, 13, ModBlocks.BBQ_GRILL, Direction.SOUTH);
		Landscape.stringLights(c, 39, 11, 56, 11, y0 + 1);
		// name on the parapet above the entrance
		c.fill(30, y0 + 1, 6, 65, y0 + 6, 6, b("brick_charcoal"));
		Signage.centredLetters(c, 47, y0 + 2, 5, Direction.WEST, "PARKSIDE", Blocks.VERDANT_FROGLIGHT);
		// rooftop units on the wings
		for (int z = 42; z < 68; z += 8) {
			hvac(10, y0 + 1, z);
			hvac(80, y0 + 1, z);
		}
		buf.addMarker("amenity", 47, y0 + 1, 12, "roof terrace");
	}

	// ================================================================================== cores
	private void cores() {
		Cores.StairStyle stairs = Cores.StairStyle.concrete();
		int depth = Cores.stairDepth(G_H);
		Cores.stairCore(c.frame(12, 0, 26, Cores.STAIR_WIDTH, depth, Direction.EAST, false), stairs, floors, "STAIR A");
		Cores.stairCore(c.frame(77, 0, 26, Cores.STAIR_WIDTH, depth, Direction.WEST, false), stairs, floors, "STAIR B");
		Cores.elevatorBank(c.frame(38, 0, BACK_Z, 7, 3, Direction.NORTH, false), ELEVATORS, floors);
		for (Cores.Floor f : floors) {
			if (f.y0() > G && f.y0() < ROOF) {
				Signage.wayfinding(c, 41, f.y0() + 2, FC1, Direction.NORTH, "FLOOR " + f.label(), "<- West wing", "East wing ->",
					"Laundry: even floors");
			}
		}
		// roof vestibule around the elevator doors
		int y0 = ROOF;
		c.fill(36, y0 + 1, 19, 46, y0 + H - 1, 19, b("window_glass"));
		c.fill(36, y0 + 1, 19, 36, y0 + H - 1, 23, b("window_glass"));
		c.fill(46, y0 + 1, 19, 46, y0 + H - 1, 23, b("window_glass"));
		c.fill(36, y0 + H, 19, 46, y0 + H, 23, b("metal_panel_graphite"));
		c.fill(37, y0, 20, 45, y0, 22, b("large_tile_light"));
		c.door(41, y0 + 1, 19, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.NORTH, DoorHingeSide.LEFT, false);
	}

	// ================================================================================== site
	private void site() {
		int g = groundY;
		// street frontage: sidewalk, tree lawn, entrance walk
		pave(0, 0, 95, 2, b("sidewalk"));
		Landscape.lawn(c, 0, 3, 95, 5, g, r, 0.04);
		pave(44, 0, 51, 5, b("pavers_charcoal"));
		for (int x = 4; x < 92; x += 10) {
			if (x > 40 && x < 55) {
				continue;
			}
			Landscape.tree(c, x, g + 1, 4, Landscape.Tree.OAK, r);
		}
		Landscape.lampsAlong(c, 2, 2, 92, 2, g + 1, 15);
		c.fill(38, g + 1, 4, 40, g + 2, 4, b("brick_charcoal"));
		Signage.sign(c, 39, g + 2, 3, Direction.NORTH, Blocks.DARK_OAK_WALL_SIGN, DyeColor.LIME, "PARKSIDE", "RESIDENCES",
			"400 Garden Way", "Now Leasing");
		// side lawns
		Landscape.lawn(c, 0, 6, 5, 83, g, r, 0.06);
		for (int z = 10; z < 72; z += 9) {
			Landscape.tree(c, 2, g + 1, z, Landscape.randomTree(r), r);
		}
		// courtyard garden: paths, lawn, splash pad, grills, seating and string lights
		int cx0 = 37;
		int cx1 = 58;
		Landscape.lawn(c, cx0, 37, cx1, 72, g, r, 0.05);
		pave(46, 37, 49, 83, b("pavers_sand"));
		pave(cx0, 52, cx1, 54, b("pavers_sand"));
		Landscape.flowerBed(c, 40, 39, 44, 40, g, r);
		Landscape.flowerBed(c, 51, 39, 55, 40, g, r);
		c.fill(50, g, 57, 55, g, 62, b("pool_deck"));
		c.fill(51, g, 58, 54, g, 61, Blocks.WATER);
		// spray posts on two corners, running
		for (int[] p : new int[][] {{50, 57}, {55, 62}}) {
			c.tall(p[0], g + 1, p[1], ModBlocks.OUTDOOR_SHOWER, p[1] == 57 ? Direction.SOUTH : Direction.NORTH);
			for (int y = g + 1; y <= g + 2; y++) {
				c.set(p[0], y, p[1], c.get(p[0], y, p[1]).setValue(com.modernapartments.block.ModProperties.ON, true));
			}
		}
		c.marker("amenity", 49, g + 1, 59, "splash pad");
		Landscape.bbq(c.translate(40, g, 57), 6, 6, r);
		for (int z = 42; z < 70; z += 7) {
			c.put(45, g + 1, z, ModBlocks.PARK_BENCH, Direction.EAST);
			c.put(50, g + 1, z, ModBlocks.PARK_BENCH, Direction.WEST);
		}
		for (int[] t : new int[][] {{42, 46}, {53, 46}, {53, 67}}) {
			Landscape.tree(c, t[0], g + 1, t[1], Landscape.Tree.CHERRY, r);
		}
		Landscape.firePit(c, 42, g + 1, 67);
		Landscape.stringLights(c, 40, 50, 55, 50, g + 1);
		buf.addMarker("amenity", 47, g + 1, 45, "courtyard");
		// park along the back: playground, community garden, dog park, parking
		Landscape.lawn(c, 0, 73, 58, 83, g, r, 0.08);
		Landscape.playground(c.translate(8, g, 75), 14, 7, r);
		c.marker("amenity", 14, g + 1, 77, "playground");
		communityGarden(26, 75, 43, 81);
		Landscape.dogPark(c.translate(52, g, 76), 5, 5, r, Direction.WEST);
		Landscape.parkingRow(c.frame(60, g, 74, 30, 5, Direction.NORTH, false), 10, 4, false);
		pave(60, 79, 95, 83, b("asphalt"));
		pave(90, 0, 95, 78, b("asphalt"));
		for (int z = 8; z < 72; z += 4) {
			c.put(90, g, z, ModBlocks.get("parking_line"), Direction.EAST);
		}
		Landscape.lampsAlong(c, 60, 78, 88, 78, g + 1, 14);
	}

	private void communityGarden(int x0, int z0, int x1, int z1) {
		int g = groundY;
		Block[] crops = {Blocks.WHEAT, Blocks.CARROTS, Blocks.POTATOES, Blocks.BEETROOTS};
		for (int x = x0; x <= x1; x += 4) {
			for (int z = z0; z <= z1 - 1; z += 4) {
				c.fill(x - 1, g, z - 1, x + 2, g, z + 2, Blocks.SPRUCE_PLANKS);
				CropBlock crop = (CropBlock) crops[Math.floorMod(x + z, crops.length)];
				for (int dx = 0; dx <= 1; dx++) {
					for (int dz = 0; dz <= 1; dz++) {
						c.set(x + dx, g, z + dz, Blocks.FARMLAND.defaultBlockState().setValue(FarmBlock.MOISTURE, 7));
						c.set(x + dx, g + 1, z + dz, crop.getStateForAge(Math.max(0, crop.getMaxAge() - r.nextInt(3))));
					}
				}
			}
		}
		c.set(x1, g, z0 - 2, Blocks.WATER);
		c.marker("amenity", x0 - 2, g + 1, z0 - 1, "community garden");
	}
}
