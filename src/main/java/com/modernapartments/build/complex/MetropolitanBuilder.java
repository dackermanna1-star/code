package com.modernapartments.build.complex;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.Inits;
import com.modernapartments.build.interior.Amenities;
import com.modernapartments.build.interior.Cores;
import com.modernapartments.build.interior.Corridors;
import com.modernapartments.build.interior.Furnish;
import com.modernapartments.build.interior.InteriorStyle;
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
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * The Metropolitan: a luxury high-rise. Underground garage, a double-height marble lobby with concierge,
 * an amenity level opening onto a podium pool deck, fifteen floors of glass-walled residences with
 * balconies, a penthouse floor with terraces and a rooftop sky lounge under an illuminated crown.
 */
public final class MetropolitanBuilder extends ComplexBase {
	// levels (slab y)
	private static final int P1 = 0;
	private static final int G = 6;
	private static final int G_H = 9;
	private static final int L2 = 15;
	private static final int H = 5;
	private static final int TYP = 20;
	private static final int FLOORS = 15;
	private static final int PH = TYP + FLOORS * H;
	private static final int PH_H = 6;
	private static final int ROOF = PH + PH_H;
	// plan
	private static final int OW = 5;
	private static final int OE = 58;
	private static final int ON = 12;
	private static final int OS = 44;
	private static final int TX0 = 7;
	private static final int TX1 = 56;
	private static final int ZF = 14;
	private static final int D = 12;
	private static final int ZB = 31;
	private static final int CZ0 = 27;
	private static final int CZ1 = 29;
	private static final int PZ1 = 55;
	private static final int ELEV_X = 28;
	private static final int STAIR_W = 7;
	private static final int STAIR_E = 52;

	private static final Cores.ElevatorStyle ELEVATORS = new Cores.ElevatorStyle(2, 3, 3, ModBlocks.get("elevator_wall"),
		ModBlocks.get("white_marble"));

	private UnitLook look;
	private UnitBuilder.Facade glass;
	private Corridors.Style hall;
	private final List<Runnable> furnishLater = new ArrayList<>();

	@Override
	protected ComplexType type() {
		return ComplexType.METROPOLITAN;
	}

	@Override
	protected void generate() {
		glass = new UnitBuilder.Facade(b("drywall_white"), b("metal_panel_bronze"), b("facade_panel_charcoal"), b("curtain_wall_gray"),
			b("metal_panel_bronze"), 3, UnitBuilder.WindowStyle.TALL, true, true);
		look = new UnitLook(glass, new Theme[] {Theme.LUXURY, Theme.LUXURY, Theme.MODERN, Theme.CLASSIC}, b("drywall_white"),
			ModBlocks.DOORS.get(ModBlocks.DoorStyle.WALNUT), Blocks.DARK_OAK_WALL_SIGN, DyeColor.YELLOW, true);
		hall = new Corridors.Style(b("hardwood_walnut"), ModBlocks.RUNNER_RUGS.get(0), ModBlocks.CEILING_FINISH, ModBlocks.CEILING_DOWNLIGHT,
			ModBlocks.WALL_SCONCE);
		site();
		garage();
		groundFloor();
		amenityLevel();
		for (int f = 0; f < FLOORS; f++) {
			residential(f + 3, TYP + f * H, H, false);
		}
		residential(18, PH, PH_H, true);
		roof();
		cores();
		furnishLater.forEach(Runnable::run);
		for (int y0 = L2; y0 < ROOF; y0 += y0 >= PH ? PH_H : H) {
			envelope(OW, ON, OE, OS, y0, y0 >= PH ? PH_H : H, b("metal_panel_bronze"), b("facade_panel_charcoal"), b("drywall_white"));
		}
		poolDeck();
		decorateCorridors();
		buf.addMarker("entrance", 31, G + 1, 6, "main entrance");
	}

	// ================================================================================== site
	private void site() {
		// sidewalk with street trees and lamps, entrance plaza
		pave(0, 0, 63, 3, b("sidewalk"));
		pave(0, 4, 63, 11, b("pavers_gray"));
		pave(26, 4, 37, 11, b("travertine"));
		for (int x = 4; x < 60; x += 8) {
			c.set(x, G, 1, Blocks.COARSE_DIRT);
			Landscape.tree(c, x, G + 1, 1, Landscape.Tree.OAK, r);
		}
		for (int x = 0; x < 64; x += 12) {
			Landscape.lampPost(c, x, G + 1, 3);
		}
		// planters flanking the entrance with benches and bollards along the curb
		for (int[] p : new int[][] {{12, 7}, {19, 7}, {44, 7}, {51, 7}}) {
			c.fill(p[0] - 1, G + 1, p[1] - 1, p[0] + 1, G + 1, p[1] + 1, b("limestone"));
			c.set(p[0], G + 1, p[1], Blocks.GRASS_BLOCK);
			Landscape.tree(c, p[0], G + 2, p[1], p[0] < 30 ? Landscape.Tree.CHERRY : Landscape.Tree.BIRCH, r);
			c.put(p[0], G + 1, p[1] + 2, ModBlocks.PARK_BENCH, Direction.NORTH);
		}
		for (int x = 24; x <= 39; x += 3) {
			c.set(x, G + 1, 4, ModBlocks.BOLLARD_LIGHT);
		}
		// monument sign
		c.fill(7, G + 1, 10, 9, G + 2, 10, b("limestone"));
		Signage.sign(c, 8, G + 2, 9, Direction.NORTH, Blocks.DARK_OAK_WALL_SIGN, DyeColor.YELLOW, "THE", "METROPOLITAN",
			"1200 Park Avenue", "Residences");
		// side and rear landscaping
		Landscape.lawn(c, 0, 12, 4, 59, G, r, 0.05);
		Landscape.lawn(c, 0, 56, 58, 59, G, r, 0.08);
		Landscape.hedge(c, 1, 14, 1, 54, G + 1, 1, Blocks.AZALEA_LEAVES);
		for (int z = 16; z < 56; z += 9) {
			Landscape.tree(c, 3, G + 1, z, Landscape.randomTree(r), r);
		}
		for (int x = 8; x < 58; x += 10) {
			Landscape.tree(c, x, G + 1, 58, Landscape.Tree.SPRUCE, r);
		}
		Landscape.lawn(c, 59, 23, 63, 59, G, r, 0.05);
		garageRamp();
	}

	/** Ramp from the street down to the garage along the east side of the lot. */
	private void garageRamp() {
		Block wall = b("concrete_panel_gray");
		for (int z = 4; z <= 22; z++) {
			double surface = Math.max(1.0, 7.0 - 0.5 * Math.max(0, z - 5));
			int k = (int) Math.floor(surface);
			for (int x = 59; x <= 62; x++) {
				c.fill(x, 0, z, x, G + 6, z, Blocks.AIR);
				c.fill(x, 0, z, x, Math.max(0, k - 1), z, b("polished_concrete"));
				if (surface - k > 0.25) {
					c.set(x, k, z, Blocks.SMOOTH_STONE_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.BOTTOM));
				}
				if (z > 4 && z < 22 && k > 1) {
					c.set(x, k - 1, z, b("asphalt"));
				}
			}
			c.fill(63, 0, z, 63, G + 1, z, wall);
			if (z >= 12) {
				c.fill(58, 0, z, 58, G, z, wall);
			} else {
				c.fill(58, 0, z, 58, G + 1, z, wall);
			}
		}
		c.fill(59, G, 23, 62, G + 1, 23, wall);
		c.wallSign(60, G + 1, 3, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
			Inits.sign(DyeColor.WHITE, true, false, "RESIDENT", "PARKING", "Clearance 2.5m", "->"));
		c.fill(59, 0, 4, 62, 0, 4, b("asphalt"));
	}

	// ================================================================================== garage
	private void garage() {
		Block wall = b("concrete_panel_gray");
		c.fill(OW, P1, ON, OE, P1, PZ1, b("polished_concrete"));
		c.walls(OW, P1 + 1, ON, OE, G - 1, PZ1, wall.defaultBlockState());
		c.clear(OW + 1, P1 + 1, ON + 1, OE - 1, G - 1, PZ1 - 1);
		c.fill(OW, G, ON, OE, G, PZ1, b("polished_concrete"));
		c.fill(OE, P1 + 1, 17, OE, G - 1, 21, Blocks.AIR);
		// stall rows: along the north wall, back-to-back rows around the cores, along the south wall
		Landscape.parkingRow(c.frame(6, P1, 13, 51, 5, Direction.NORTH, false), 17, 3, true);
		Landscape.parkingRow(c.frame(6, P1, 50, 51, 5, Direction.SOUTH, true), 17, 4, true);
		for (int x0 : new int[] {13, 37}) {
			Landscape.parkingRow(c.frame(x0, P1, 24, 12, 5, Direction.SOUTH, true), 4, 0, false);
			Landscape.parkingRow(c.frame(x0, P1, 36, 12, 5, Direction.NORTH, false), 4, 0, false);
		}
		// pedestrian zone in front of the elevators
		c.fill(25, P1, 25, 37, P1, 29, b("large_tile_dark"));
		for (int x = 25; x <= 37; x += 4) {
			c.set(x, P1 + 1, 25, ModBlocks.BOLLARD_LIGHT);
		}
		// columns and lights
		for (int x = 15; x < 57; x += 9) {
			for (int z : new int[] {23, 41}) {
				c.fill(x, P1 + 1, z, x, G - 1, z, b("garage_column"));
			}
		}
		for (int x = 9; x < 57; x += 6) {
			for (int z = 16; z < PZ1; z += 6) {
				c.set(x, G - 1, z, ModBlocks.GARAGE_LIGHT);
			}
		}
		for (int x = 10; x < 56; x += 12) {
			c.put(x, P1 + 1, 46, ModBlocks.SPEED_BUMP, Direction.EAST);
		}
		c.put(57, P1 + 1, 19, ModBlocks.get("parking_arrow"), Direction.WEST);
		Signage.wayfinding(c, 31, P1 + 3, 24, Direction.NORTH, "P1", "Elevators", "to Lobby", "& Residences");
		c.put(26, P1 + 1, 29, ModBlocks.TRASH_BIN, Direction.EAST);
		c.put(36, P1 + 1, 29, ModBlocks.RECYCLING_BIN, Direction.WEST);
		buf.addMarker("amenity", 31, P1 + 1, 21, "garage");
	}

	// ================================================================================== ground floor
	private void groundFloor() {
		int y0 = G;
		int side = 5;
		Block marble = b("white_marble");
		Block limestone = b("limestone");
		c.fill(OW, y0, ON, OE, y0, PZ1, b("polished_concrete"));
		c.walls(OW, y0 + 1, ON, OE, y0 + G_H - 1, PZ1, limestone.defaultBlockState());
		// plenum above the single-height rooms around the lobby
		c.fill(OW + 1, y0 + side + 1, ON + 2, 16, y0 + G_H - 1, PZ1 - 1, b("concrete_panel_gray"));
		c.fill(47, y0 + side + 1, ON + 2, OE - 1, y0 + G_H - 1, PZ1 - 1, b("concrete_panel_gray"));
		c.fill(17, y0 + side + 1, 31, 46, y0 + G_H - 1, PZ1 - 1, b("concrete_panel_gray"));
		// rooms
		Canvas lobby = c.frame(18, y0, 14, 28, 16, Direction.NORTH, false);
		Amenities.shell(lobby, 28, 16, G_H - 1, marble, b("drywall_greige"), ModBlocks.CEILING_FINISH);
		Canvas leasing = c.frame(6, y0, 14, 12, 11, Direction.EAST, false);
		Amenities.shell(leasing, 12, 11, side, b("herringbone_oak"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Canvas cafe = c.frame(47, y0, 14, 12, 11, Direction.WEST, false);
		Amenities.shell(cafe, 12, 11, side, b("herringbone_oak"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Canvas mail = c.frame(18, y0, 31, 8, 9, Direction.NORTH, false);
		Amenities.shell(mail, 8, 9, side, b("terrazzo"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Canvas spa = c.frame(37, y0, 31, 9, 9, Direction.NORTH, false);
		Amenities.shell(spa, 9, 9, side, b("mosaic_tile"), b("subway_tile"), ModBlocks.CEILING_FINISH);
		Canvas bikes = c.frame(6, y0, 42, 21, 13, Direction.NORTH, false);
		Amenities.shell(bikes, 21, 13, side, b("polished_concrete"), b("concrete_panel_gray"), b("acoustic_ceiling"));
		Canvas storage = c.frame(37, y0, 42, 21, 13, Direction.NORTH, false);
		Amenities.shell(storage, 21, 13, side, b("polished_concrete"), b("concrete_panel_gray"), b("acoustic_ceiling"));
		Canvas trash = c.frame(28, y0, 36, 8, 19, Direction.NORTH, false);
		Amenities.shell(trash, 8, 19, side, b("polished_concrete"), b("concrete_panel_gray"), b("acoustic_ceiling"));
		// halls to the stairs and the rear rooms
		Corridors.corridor(c, 6, CZ0, 16, CZ1, y0, side, hall);
		Corridors.corridor(c, 13, 30, 16, 40, y0, side, hall);
		Corridors.corridor(c, 47, CZ0, 57, CZ1, y0, side, hall);
		Corridors.corridor(c, 47, 30, 50, 40, y0, side, hall);
		c.fill(6, y0 + 1, 26, 16, y0 + side, 26, b("drywall_white"));
		c.fill(47, y0 + 1, 26, 57, y0 + side, 26, b("drywall_white"));
		c.fill(12, y0 + 1, 30, 12, y0 + side, 41, b("drywall_white"));
		c.fill(51, y0 + 1, 30, 51, y0 + side, 41, b("drywall_white"));
		// storefront: limestone piers in the outer plane, glass in the inner plane
		for (int x = OW; x <= OE; x++) {
			boolean pier = ((x - OW) % 6 == 0 || x == OE) && (x < 30 || x > 33);
			c.fill(x, y0 + 1, ON, x, y0 + G_H - 1, ON, pier ? limestone : Blocks.AIR);
			c.set(x, y0, ON, limestone);
			if (x > OW && x < OE) {
				boolean roomFront = x <= 16 || x >= 47;
				c.fill(x, y0 + 1, ON + 1, x, y0 + (roomFront ? side - 1 : G_H - 2), ON + 1, pier ? limestone : b("curtain_wall_gray"));
				c.fill(x, y0 + (roomFront ? side : G_H - 1), ON + 1, x, y0 + G_H - 1, ON + 1, limestone);
			}
		}
		// doors
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		Block woodDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.WALNUT);
		c.door(31, y0 + 1, ON + 1, glassDoor, Direction.SOUTH, DoorHingeSide.RIGHT, false);
		c.door(32, y0 + 1, ON + 1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.put(33, y0 + 2, ON, ModBlocks.INTERCOM, Direction.NORTH);
		c.put(30, y0 + 2, ON, ModBlocks.KEYCARD_READER, Direction.NORTH);
		c.door(17, y0 + 1, 20, glassDoor, Direction.WEST, DoorHingeSide.LEFT, false);
		c.door(46, y0 + 1, 20, glassDoor, Direction.EAST, DoorHingeSide.LEFT, false);
		c.door(17, y0 + 1, 28, woodDoor, Direction.WEST, DoorHingeSide.LEFT, true);
		c.door(46, y0 + 1, 28, woodDoor, Direction.EAST, DoorHingeSide.LEFT, true);
		c.door(22, y0 + 1, 30, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(41, y0 + 1, 30, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(14, y0 + 1, 41, woodDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(48, y0 + 1, 41, woodDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(27, y0 + 1, 48, ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL), Direction.EAST, DoorHingeSide.LEFT, false);
		c.door(36, y0 + 1, 48, ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL), Direction.WEST, DoorHingeSide.LEFT, false);
		// canopy over the entrance
		c.fill(27, y0 + 5, 8, 36, y0 + 5, 11, b("metal_panel_bronze"));
		for (int x = 28; x <= 35; x += 2) {
			c.set(x, y0 + 4, 9, ModBlocks.CEILING_DOWNLIGHT);
		}
		for (int x : new int[] {27, 36}) {
			c.fill(x, y0 + 1, 8, x, y0 + 4, 8, b("mullion_black"));
		}
		furnishLater.add(() -> {
			Amenities.lobby(lobby, 28, 16, G_H - 1, r, Theme.LUXURY, ModBlocks.RECEPTION_DESK_MARBLE, "THE METROPOLITAN",
				"DIRECTORY", "P1  Garage", "L   Lobby, Mail", "2   Pool, Gym", "3-17 Residences", "PH  Penthouses", "R   Sky Lounge");
			Amenities.leasing(leasing, 12, 11, side, r, Theme.LUXURY);
			Amenities.clubLounge(cafe, 12, 11, side, r, Theme.LUXURY);
			Amenities.mailRoom(mail, 8, 9, side, r);
			Amenities.dogSpa(spa, 9, 9, side, r);
			Amenities.bikeRoom(bikes, 21, 13, side, r);
			Amenities.storageRoom(storage, 21, 13, side, r);
			trashRoom(trash, 8, 19, side);
			Corridors.decorate(c, 6, CZ0, 16, CZ1, y0, side, hall, r);
			Corridors.decorate(c, 47, CZ0, 57, CZ1, y0, side, hall, r);
			buf.addMarker("amenity", 31, y0 + 1, 20, "lobby");
			marker(leasing, 12, 11, "leasing office");
			marker(cafe, 12, 11, "resident cafe");
			marker(mail, 8, 9, "mail room");
			marker(spa, 9, 9, "dog spa");
			marker(bikes, 21, 13, "bike storage");
			marker(storage, 21, 13, "storage");
			marker(trash, 8, 19, "trash room");
		});
	}

	// ================================================================================== amenity level
	private void amenityLevel() {
		int y0 = L2;
		int h = H - 1;
		slabAndCorridor(y0, h);
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		Object[][] rooms = {
			{"fitness", TX0, ZF, 19, Direction.SOUTH, Direction.WEST},
			{"screening", 27, ZF, 10, Direction.SOUTH, null},
			{"studio", 38, ZF, 19, Direction.SOUTH, Direction.EAST},
			{"games", 14, ZB, 12, Direction.NORTH, null},
			{"cowork", 37, ZB, 13, Direction.NORTH, null},
		};
		for (Object[] room : rooms) {
			String name = (String) room[0];
			int x0 = (Integer) room[1];
			int z0 = (Integer) room[2];
			int w = (Integer) room[3];
			Direction front = (Direction) room[4];
			Direction sideExterior = (Direction) room[5];
			Canvas f = c.frame(x0, y0, z0, w, D, front, front == Direction.SOUTH);
			boolean carpet = name.equals("screening");
			Block floor = name.equals("fitness") || name.equals("studio") ? b("rubber_flooring") : b("hardwood_gray");
			Amenities.shell(f, w, D, h, carpet ? b("hardwood_walnut") : floor, b("drywall_white"),
				carpet ? b("acoustic_ceiling") : ModBlocks.CEILING_FINISH);
			if (carpet) {
				f.fill(0, 1, 0, w - 1, 1, D - 1, Blocks.GRAY_CARPET);
			}
			f.door(w / 2, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
			glazeRoom(f, glass, w, D, h, front == Direction.NORTH, sideExterior != null && f.dir(Direction.WEST) == sideExterior,
				sideExterior != null && f.dir(Direction.EAST) == sideExterior);
			furnishLater.add(() -> {
				switch (name) {
					case "fitness" -> Amenities.fitness(f, w, D, h, r);
					case "screening" -> Amenities.mediaRoom(f, w, D, h, r);
					case "studio" -> yogaStudio(f, w, D, h);
					case "games" -> Amenities.gameRoom(f, w, D, h, r);
					default -> Amenities.cowork(f, w, D, h, r);
				}
				marker(f, w, D, switch (name) {
					case "fitness" -> "fitness center";
					case "screening" -> "screening room";
					case "studio" -> "yoga & spin studio";
					case "games" -> "game room";
					default -> "co-working";
				});
			});
		}
	}

	// ================================================================================== residential floors
	private void slabAndCorridor(int y0, int h) {
		c.fill(OW, y0, ON, OE, y0, OS, b("polished_concrete"));
		Corridors.corridor(c, TX0, CZ0, TX1, CZ1, y0, h, hall);
		// windows at both corridor ends
		for (int x : new int[] {OW, OW + 1, OE - 1, OE}) {
			c.fill(x, y0 + 1, CZ0, x, y0 + h - 1, CZ1, b("curtain_wall_gray"));
			c.fill(x, y0 + h, CZ0, x, y0 + h, CZ1, b("facade_panel_charcoal"));
		}
		c.fill(OW + 1, y0, CZ0, OW + 1, y0, CZ1, b("hardwood_walnut"));
		c.fill(OE - 1, y0, CZ0, OE - 1, y0, CZ1, b("hardwood_walnut"));
	}

	private void residential(int floor, int y0, int height, boolean penthouse) {
		int h = height - 1;
		slabAndCorridor(y0, h);
		UnitBuilder.Balcony balcony = new UnitBuilder.Balcony(2, b("travertine"), ModBlocks.GLASS_RAILING);
		UnitBuilder.Balcony terrace = new UnitBuilder.Balcony(3, b("travertine"), ModBlocks.GLASS_RAILING);
		List<Slot> slots = new ArrayList<>();
		if (penthouse) {
			slots.add(Slot.of(TX0, ZF, 25, D, Direction.SOUTH, true, Type.PENTHOUSE, 10, Direction.NORTH, Direction.WEST));
			slots.add(Slot.of(33, ZF, 24, D, Direction.SOUTH, false, Type.PENTHOUSE, 11, Direction.NORTH, Direction.EAST));
		} else {
			slots.add(Slot.of(TX0, ZF, 19, D, Direction.SOUTH, true, Type.TWO_BED, 0, Direction.NORTH, Direction.WEST));
			slots.add(Slot.of(27, ZF, 10, D, Direction.SOUTH, false, Type.STUDIO, 1, Direction.NORTH));
			slots.add(Slot.of(38, ZF, 19, D, Direction.SOUTH, false, Type.TWO_BED, 2, Direction.NORTH, Direction.EAST));
		}
		slots.add(Slot.of(14, ZB, 12, D, Direction.NORTH, false, Type.ONE_BED, 3, Direction.SOUTH));
		slots.add(Slot.of(37, ZB, 13, D, Direction.NORTH, true, Type.ONE_BED, 4, Direction.SOUTH));
		// close the gaps between the back units and the cores
		c.fill(13, y0 + 1, 31, 13, y0 + h, 43, b("drywall_white"));
		c.fill(26, y0 + 1, 31, 26, y0 + h, 43, b("drywall_white"));
		c.fill(36, y0 + 1, 31, 36, y0 + h, 43, b("drywall_white"));
		c.fill(50, y0 + 1, 31, 50, y0 + h, 43, b("drywall_white"));
		for (int i = 0; i < slots.size(); i++) {
			Slot s = slots.get(i);
			String number = penthouse ? "PH" + (i + 1) : String.format("%d%02d", floor, i + 1);
			unit(s, y0, h, floor, number, look, penthouse && i < 2 ? terrace : balcony);
		}
		// fill behind the stair cores and the elevator bank up to the facade
		c.fill(TX0, y0 + 1, 41, 12, y0 + h, 42, b("drywall_white"));
		c.fill(51, y0 + 1, 41, TX1, y0 + h, 42, b("drywall_white"));
		c.fill(27, y0 + 1, 35, 35, y0 + h, 42, b("drywall_white"));
	}

	// ================================================================================== roof
	private void roof() {
		int y0 = ROOF;
		c.fill(OW, y0, ON, OE, y0, OS, b("concrete_panel_gray"));
		c.fill(OW + 1, y0, ON + 1, OE - 1, y0, 30, b("pavers_charcoal"));
		c.fill(OW + 1, y0, 14, OE - 1, y0, 25, b("pool_deck"));
		// parapet with glass railing in front, solid around the mechanical yard
		for (int x = OW; x <= OE; x++) {
			c.set(x, y0 + 1, OS, b("facade_panel_charcoal"));
			c.set(x, y0 + 2, OS, b("facade_panel_charcoal"));
		}
		for (int z = ON; z <= OS; z++) {
			c.set(OW, y0 + 1, z, z <= 30 ? ModBlocks.GLASS_RAILING : b("facade_panel_charcoal"));
			c.set(OE, y0 + 1, z, z <= 30 ? ModBlocks.GLASS_RAILING : b("facade_panel_charcoal"));
		}
		// illuminated crown: glass screen along the street edge carrying the name in block letters
		c.fill(OW, y0 + 1, ON, OE, y0 + 7, ON, b("curtain_wall_gray"));
		Signage.centredLetters(c, 31, y0 + 2, ON - 1, Direction.WEST, "METROPOLITAN", Blocks.OCHRE_FROGLIGHT);
		// sky lounge: glass pavilion in the middle of the deck
		Canvas lounge = c.frame(20, y0, 15, 24, 9, Direction.SOUTH, true);
		Amenities.shell(lounge, 24, 9, 4, b("herringbone_oak"), b("curtain_wall_gray"), ModBlocks.CEILING_FINISH_WOOD);
		lounge.fill(-1, 5, -1, 24, 5, 9, b("metal_panel_bronze"));
		lounge.door(11, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.RIGHT, false);
		lounge.door(12, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.LEFT, false);
		lounge.door(11, 1, 9, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.NORTH, DoorHingeSide.LEFT, false);
		// mechanical yard: rooftop units behind a screen
		for (int x = 15; x <= 47; x += 6) {
			if (x >= 25 && x <= 37) {
				continue;
			}
			hvac(x, y0 + 1, 36);
		}
		c.fill(TX0, y0 + 1, 32, TX1, y0 + 3, 32, b("metal_panel_graphite"));
		c.fill(13, y0 + 1, 32, 16, y0 + 3, 32, Blocks.AIR);
		c.fill(47, y0 + 1, 32, 50, y0 + 3, 32, Blocks.AIR);
		furnishLater.add(() -> {
			Amenities.wideLounge(lounge, 24, 9, 4, r, Theme.LUXURY, new String[] {"SKY LOUNGE", "Residents & guests", "Deck open till 11pm"},
				Amenities.Bay.BAR, Amenities.Bay.VIEW);
			roofDeck(y0);
		});
	}

	private void roofDeck(int y0) {
		// lounge sets and fire pits on the street-side deck, grills by the stairs
		Furnish.balcony(c, r, 8, 15, 17, 23, Direction.NORTH, true);
		Furnish.balcony(c, r, 46, 15, 55, 23, Direction.NORTH, true);
		Landscape.firePit(c, 15, y0 + 1, 27);
		Landscape.firePit(c, 48, y0 + 1, 27);
		for (int x = 8; x <= 55; x += 47) {
			c.put(x, y0 + 1, 13, ModBlocks.PLANTER_BOX, Direction.SOUTH);
		}
		for (int x = 21; x <= 42; x += 7) {
			c.put(x, y0 + 1, 13, ModBlocks.PLANTER_BOX, Direction.SOUTH);
			c.put(x, y0 + 1, 26, ModBlocks.UMBRELLAS.get(x % ModBlocks.UMBRELLAS.size()), Direction.SOUTH);
		}
		Landscape.stringLights(c, 20, 27, 43, 27, y0 + 1);
		buf.addMarker("amenity", 31, y0 + 1, 28, "roof deck");
	}

	// ================================================================================== cores
	private void cores() {
		List<Cores.Floor> floors = new ArrayList<>();
		floors.add(new Cores.Floor(P1, G - P1, "P1"));
		floors.add(new Cores.Floor(G, G_H, "L"));
		floors.add(new Cores.Floor(L2, H, "2"));
		for (int f = 0; f < FLOORS; f++) {
			floors.add(new Cores.Floor(TYP + f * H, H, String.valueOf(f + 3)));
		}
		floors.add(new Cores.Floor(PH, PH_H, "PH"));
		floors.add(new Cores.Floor(ROOF, H, "R"));
		Cores.StairStyle stairs = Cores.StairStyle.concrete();
		Cores.stairCore(c.frame(STAIR_W, 0, ZB, Cores.STAIR_WIDTH, Cores.stairDepth(G_H), Direction.NORTH, false), stairs, floors, "STAIR A");
		Cores.stairCore(c.frame(STAIR_E, 0, ZB, Cores.STAIR_WIDTH, Cores.stairDepth(G_H), Direction.NORTH, false), stairs, floors, "STAIR B");
		Cores.elevatorBank(c.frame(ELEV_X, 0, ZB, Cores.elevatorWidth(ELEVATORS) - 2, 3, Direction.NORTH, false), ELEVATORS, floors);
		// elevator lobby details on the residential floors
		for (Cores.Floor f : floors) {
			if (f.y0() >= TYP && f.y0() < ROOF) {
				Signage.wayfinding(c, 31, f.y0() + 2, CZ1, Direction.NORTH, "FLOOR " + f.label(),
					"<- " + f.label() + "01  " + f.label() + "04", f.label() + "02  " + f.label() + "05 ->", f.label() + "03 ->");
			}
		}
	}

	private void decorateCorridors() {
		for (int y0 = L2; y0 < ROOF; y0 += y0 >= PH ? PH_H : H) {
			int h = (y0 >= PH ? PH_H : H) - 1;
			Corridors.decorate(c, TX0, CZ0, TX1, CZ1, y0, h, hall, r);
			c.put(TX0, y0 + 1, CZ0, ModBlocks.TALL_PLANTS.get(Math.floorMod(y0, ModBlocks.TALL_PLANTS.size())), Direction.EAST);
			c.put(TX1, y0 + 1, CZ0, ModBlocks.TALL_PLANTS.get(Math.floorMod(y0 + 1, ModBlocks.TALL_PLANTS.size())), Direction.WEST);
		}
	}

	// ================================================================================== pool deck
	private void poolDeck() {
		int y0 = L2;
		Canvas deck = c.translate(OW + 1, y0, OS + 1);
		Landscape.poolDeck(deck, OE - OW - 1, PZ1 - OS - 1, r, b("pool_deck"));
		for (int x = OW; x <= OE; x++) {
			c.set(x, y0, PZ1, b("limestone"));
			c.set(x, y0 + 1, PZ1, ModBlocks.GLASS_RAILING);
		}
		for (int z = OS + 1; z <= PZ1; z++) {
			c.set(OW, y0, z, b("limestone"));
			c.set(OW, y0 + 1, z, ModBlocks.GLASS_RAILING);
			c.set(OE, y0, z, b("limestone"));
			c.set(OE, y0 + 1, z, ModBlocks.GLASS_RAILING);
		}
	}
}
