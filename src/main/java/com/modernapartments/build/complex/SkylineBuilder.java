package com.modernapartments.build.complex;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.Inits;
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
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * The Skyline Towers: a 35-storey blue-glass skyscraper. A central core with four high-speed elevators
 * and two fire stairs sits inside a racetrack corridor, so every residence is a corner home with glass on
 * two sides. A three-storey lobby, an amenity floor, a double-height sky garden with a spa halfway up,
 * penthouses, a glass sky lounge and an open observation deck under a lantern crown and spire.
 */
public final class SkylineBuilder extends ComplexBase {
	// levels
	private static final int P1 = 0;
	private static final int G = 6;
	private static final int G_H = 10;
	private static final int L2 = 16;
	private static final int H = 5;
	private static final int TYP = 21;
	private static final int GARDEN_FLOOR = 18;
	private static final int GARDEN_H = 8;
	private static final int TOP_FLOOR = 33;
	private static final int PH_H = 6;
	private static final int SKY_H = 6;
	// plan
	private static final int OW = 7;
	private static final int OE = 52;
	private static final int ON = 5;
	private static final int OS = 51;
	private static final int X0 = 9;
	private static final int X1 = 50;
	private static final int ZF = 7;
	private static final int D = 12;
	private static final int ZB = 38;
	private static final int NC0 = 20;
	private static final int NC1 = 22;
	private static final int SC0 = 34;
	private static final int SC1 = 36;
	private static final int CORE_X0 = 12;
	private static final int CORE_X1 = 47;
	private static final int CORE_Z0 = 23;
	private static final int CORE_Z1 = 33;

	private static final Cores.ElevatorStyle ELEVATORS = new Cores.ElevatorStyle(2, 3, 3, ModBlocks.get("elevator_wall"),
		ModBlocks.get("walnut_cladding"));

	private UnitBuilder.Facade glass;
	private UnitLook look;
	private Corridors.Style hall;
	private final List<Runnable> furnishLater = new ArrayList<>();
	private final List<Cores.Floor> floors = new ArrayList<>();

	@Override
	protected ComplexType type() {
		return ComplexType.SKYLINE;
	}

	private static int y0(int floor) {
		if (floor <= GARDEN_FLOOR) {
			return TYP + (floor - 3) * H;
		}
		return TYP + (GARDEN_FLOOR - 3) * H + GARDEN_H + (floor - GARDEN_FLOOR - 1) * H;
	}

	@Override
	protected void generate() {
		glass = new UnitBuilder.Facade(b("drywall_white"), b("mullion_silver"), b("curtain_wall_gray"), b("curtain_wall_blue"),
			b("mullion_silver"), 2, UnitBuilder.WindowStyle.TALL, true, true);
		look = new UnitLook(glass, new Theme[] {Theme.MODERN, Theme.MODERN, Theme.LUXURY, Theme.INDUSTRIAL}, b("drywall_white"),
			ModBlocks.DOORS.get(ModBlocks.DoorStyle.CHARCOAL), Blocks.BIRCH_WALL_SIGN, DyeColor.BLACK, false);
		hall = new Corridors.Style(b("large_tile_light"), null, ModBlocks.CEILING_FINISH, ModBlocks.CEILING_LED_PANEL,
			ModBlocks.WALL_SCONCE);
		int ph = y0(TOP_FLOOR) + H;
		int sky = ph + PH_H;
		int roof = sky + SKY_H;
		floors.add(new Cores.Floor(P1, G - P1, "P1"));
		floors.add(new Cores.Floor(G, G_H, "L"));
		floors.add(new Cores.Floor(L2, H, "2"));
		for (int f = 3; f <= TOP_FLOOR; f++) {
			floors.add(new Cores.Floor(y0(f), f == GARDEN_FLOOR ? GARDEN_H : H, f == GARDEN_FLOOR ? "SKY" : String.valueOf(f)));
		}
		floors.add(new Cores.Floor(ph, PH_H, "PH"));
		floors.add(new Cores.Floor(sky, SKY_H, "35"));
		floors.add(new Cores.Floor(roof, H, "R"));

		site();
		garage();
		lobby();
		plate(L2, H - 1);
		amenityFloor(L2);
		for (int f = 3; f <= TOP_FLOOR; f++) {
			if (f == GARDEN_FLOOR) {
				skyGarden(y0(f));
			} else {
				plate(y0(f), H - 1);
				typical(f, y0(f), H - 1, false);
			}
		}
		plate(ph, PH_H - 1);
		typical(34, ph, PH_H - 1, true);
		skyLounge(sky);
		roof(roof);
		cores();
		furnishLater.forEach(Runnable::run);
		for (Cores.Floor f : floors) {
			if (f.y0() >= L2 && f.y0() < roof) {
				envelope(OW, ON, OE, OS, f.y0(), f.height(), b("mullion_silver"), b("curtain_wall_gray"), b("drywall_white"));
				Corridors.decorate(c, X0, NC0, X1, NC1, f.y0(), f.height() - 1, hall, r);
				Corridors.decorate(c, X0, SC0, X1, SC1, f.y0(), f.height() - 1, hall, r);
			}
		}
		buf.addMarker("entrance", 29, G + 1, 1, "main entrance");
	}

	// ================================================================================== site & garage
	private void site() {
		pave(0, 0, 59, 4, b("pavers_sand"));
		pave(0, 0, 59, 0, b("sidewalk"));
		pave(26, 1, 33, 4, b("white_marble"));
		for (int x = 3; x < 57; x += 9) {
			if (x > 22 && x < 37) {
				continue;
			}
			c.fill(x - 1, G + 1, 2, x + 1, G + 1, 3, b("limestone"));
			c.fill(x - 1, G + 1, 2, x + 1, G + 1, 3, Blocks.GRASS_BLOCK);
			Landscape.tree(c, x, G + 2, 2, Landscape.Tree.BIRCH, r);
		}
		for (int x = 24; x <= 35; x += 11) {
			Landscape.lampPost(c, x, G + 1, 1);
		}
		// fountain plaza on the east side
		c.fill(54, G, 8, 58, G, 14, b("limestone"));
		c.fill(55, G, 9, 57, G, 13, Blocks.WATER);
		c.fill(54, G + 1, 8, 58, G + 1, 8, Blocks.SMOOTH_QUARTZ_SLAB);
		c.fill(54, G + 1, 14, 58, G + 1, 14, Blocks.SMOOTH_QUARTZ_SLAB);
		for (int z = 16; z < 50; z += 6) {
			c.put(56, G + 1, z, ModBlocks.PARK_BENCH, Direction.WEST);
			Landscape.tree(c, 58, G + 1, z + 3, Landscape.randomTree(r), r);
		}
		Landscape.lawn(c, 53, 15, 59, 59, G, r, 0.06);
		Landscape.lawn(c, 0, 52, 59, 59, G, r, 0.06);
		Landscape.dogPark(c.translate(10, G, 54), 14, 4, r, Direction.NORTH);
		Landscape.bbq(c.translate(34, G, 54), 14, 4, r);
		Signage.sign(c, 27, G + 2, 2, Direction.NORTH, Blocks.DARK_OAK_WALL_SIGN, DyeColor.LIGHT_BLUE, "SKYLINE", "TOWERS",
			"One Skyline Plaza", "");
		c.fill(26, G + 1, 3, 28, G + 2, 3, b("black_marble"));
		garageRamp();
	}

	private void garageRamp() {
		Block wall = b("concrete_panel_gray");
		for (int z = 1; z <= 20; z++) {
			double surface = Math.max(1.0, 7.0 - 0.5 * Math.max(0, z - 2));
			int k = (int) Math.floor(surface);
			for (int x = 1; x <= 4; x++) {
				c.fill(x, 0, z, x, G + 8, z, Blocks.AIR);
				c.fill(x, 0, z, x, Math.max(0, k - 1), z, b("asphalt"));
				if (surface - k > 0.25) {
					c.set(x, k, z, Blocks.SMOOTH_STONE_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.BOTTOM));
				}
			}
			c.fill(0, 0, z, 0, G + 1, z, wall);
			c.fill(5, 0, z, 5, G + 1, z, wall);
		}
		c.fill(1, G, 21, 4, G + 1, 21, wall);
		c.wallSign(2, G + 1, 0, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH, Inits.sign(DyeColor.WHITE, true, false, "PARKING", "Residents", "& Guests", ""));
	}

	private void garage() {
		Block wall = b("concrete_panel_gray");
		int x0 = 5;
		int x1 = 54;
		int z0 = 3;
		int z1 = 56;
		c.fill(x0, P1, z0, x1, P1, z1, b("polished_concrete"));
		c.walls(x0, P1 + 1, z0, x1, G - 1, z1, wall.defaultBlockState());
		c.clear(x0 + 1, P1 + 1, z0 + 1, x1 - 1, G - 1, z1 - 1);
		c.fill(x0, G, z0, x1, G, z1, b("polished_concrete"));
		c.fill(x0, P1 + 1, 16, x0, 4, 20, Blocks.AIR);
		Landscape.parkingRow(c.frame(9, P1, 4, 42, 5, Direction.NORTH, false), 14, 3, true);
		Landscape.parkingRow(c.frame(9, P1, 51, 42, 5, Direction.SOUTH, true), 14, 3, true);
		Landscape.parkingRow(c.frame(13, P1, 14, 33, 5, Direction.SOUTH, true), 11, 0, false);
		Landscape.parkingRow(c.frame(13, P1, 41, 33, 5, Direction.NORTH, false), 11, 0, false);
		for (int x = 10; x < 54; x += 6) {
			for (int z = 7; z < 56; z += 6) {
				c.set(x, G - 1, z, ModBlocks.GARAGE_LIGHT);
			}
		}
		c.fill(X0, P1, NC0, X1, P1, SC1, b("large_tile_dark"));
		Signage.wayfinding(c, 29, P1 + 3, NC0 - 1 + 1, Direction.SOUTH, "P1", "Elevators", "Lobby & Residences", "");
		buf.addMarker("amenity", 29, P1 + 1, 11, "garage");
	}

	// ================================================================================== floor plate
	/** Slab, racetrack corridor around the core, a solid core block and the corridor end windows. */
	private void plate(int y0, int h) {
		c.fill(OW, y0, ON, OE, y0, OS, b("polished_concrete"));
		Corridors.corridor(c, X0, NC0, X1, NC1, y0, h, hall);
		Corridors.corridor(c, X0, SC0, X1, SC1, y0, h, hall);
		Corridors.corridor(c, X0, CORE_Z0, 11, CORE_Z1, y0, h, hall);
		Corridors.corridor(c, 48, CORE_Z0, X1, CORE_Z1, y0, h, hall);
		c.fill(CORE_X0, y0 + 1, CORE_Z0, CORE_X1, y0 + h, CORE_Z1, b("drywall_greige"));
		for (int x : new int[] {OW, OW + 1, OE - 1, OE}) {
			c.fill(x, y0 + 1, NC0, x, y0 + h - 1, SC1, b("curtain_wall_blue"));
			c.fill(x, y0 + h, NC0, x, y0 + h, SC1, b("curtain_wall_gray"));
		}
		c.fill(OW + 1, y0, NC0, OW + 1, y0, SC1, b("large_tile_light"));
		c.fill(OE - 1, y0, NC0, OE - 1, y0, SC1, b("large_tile_light"));
	}

	private void typical(int floor, int y0, int h, boolean penthouse) {
		UnitBuilder.Balcony balcony = new UnitBuilder.Balcony(2, b("pavers_gray"), ModBlocks.GLASS_RAILING);
		List<Slot> slots = new ArrayList<>();
		if (penthouse) {
			slots.add(Slot.of(X0, ZF, 42, D, Direction.SOUTH, true, Type.PENTHOUSE, 20, Direction.NORTH, Direction.WEST, Direction.EAST));
			slots.add(Slot.of(X0, ZB, 42, D, Direction.NORTH, false, Type.PENTHOUSE, 21, Direction.SOUTH, Direction.WEST, Direction.EAST));
		} else {
			boolean upper = floor > GARDEN_FLOOR;
			slots.add(Slot.of(X0, ZF, 20, D, Direction.SOUTH, true, Type.TWO_BED, upper ? 4 : 0, Direction.NORTH, Direction.WEST));
			slots.add(Slot.of(30, ZF, 21, D, Direction.SOUTH, false, Type.TWO_BED, upper ? 5 : 1, Direction.NORTH, Direction.EAST));
			slots.add(Slot.of(X0, ZB, 20, D, Direction.NORTH, false, Type.TWO_BED, upper ? 6 : 2, Direction.SOUTH, Direction.WEST));
			slots.add(Slot.of(30, ZB, 21, D, Direction.NORTH, true, Type.TWO_BED, upper ? 7 : 3, Direction.SOUTH, Direction.EAST));
		}
		for (int i = 0; i < slots.size(); i++) {
			String number = penthouse ? "PH" + (i + 1) : String.format("%d%02d", floor, i + 1);
			unit(slots.get(i), y0, h, floor, number, look, penthouse ? new UnitBuilder.Balcony(3, b("travertine"), ModBlocks.GLASS_RAILING)
				: (floor % 2 == 0 ? balcony : null));
		}
	}

	// ================================================================================== lobby & amenities
	private void lobby() {
		int y0 = G;
		int h = G_H - 1;
		plate(y0, 5);
		c.fill(OW, y0 + 6, ON, OE, y0 + G_H - 1, OS, b("concrete_panel_gray"));
		// grand lobby across the front of the plate, three storeys tall
		Canvas lobby = c.frame(X0, y0, ZF, X1 - X0 + 1, NC1 - ZF + 1, Direction.NORTH, false);
		int lw = X1 - X0 + 1;
		int ld = NC1 - ZF + 1;
		Amenities.shell(lobby, lw, ld, h, b("terrazzo"), b("walnut_cladding"), ModBlocks.CEILING_FINISH);
		// curtain wall on the front and the two returns
		for (int x = OW; x <= OE; x++) {
			c.fill(x, y0 + 1, ON, x, y0 + h - 1, ON, (x - OW) % 4 == 0 ? b("mullion_silver") : b("curtain_wall_blue"));
			c.fill(x, y0 + 1, ON + 1, x, y0 + h - 1, ON + 1, Blocks.AIR);
			c.set(x, y0 + h, ON, b("mullion_silver"));
			c.set(x, y0 + h, ON + 1, b("mullion_silver"));
			c.set(x, y0, ON + 1, b("terrazzo"));
		}
		for (int z = ON; z <= NC1; z++) {
			for (int x : new int[] {OW, OE}) {
				c.fill(x, y0 + 1, z, x, y0 + h - 1, z, (z - ON) % 4 == 0 ? b("mullion_silver") : b("curtain_wall_blue"));
			}
			for (int x : new int[] {OW + 1, OE - 1}) {
				c.fill(x, y0 + 1, z, x, y0 + h - 1, z, Blocks.AIR);
				c.set(x, y0, z, b("terrazzo"));
			}
		}
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		c.fill(28, y0 + 1, ON, 31, y0 + 2, ON + 1, Blocks.AIR);
		c.door(29, y0 + 1, ON, glassDoor, Direction.SOUTH, DoorHingeSide.RIGHT, false);
		c.door(30, y0 + 1, ON, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.put(31, y0 + 2, ON - 1, ModBlocks.INTERCOM, Direction.NORTH);
		c.put(28, y0 + 2, ON - 1, ModBlocks.KEYCARD_READER, Direction.NORTH);
		// open the lobby onto the racetrack legs leading to the south side
		c.fill(X0, y0 + 1, NC1 + 1, 11, y0 + 4, NC1 + 1, Blocks.AIR);
		c.fill(48, y0 + 1, NC1 + 1, X1, y0 + 4, NC1 + 1, Blocks.AIR);
		// canopy
		c.fill(25, y0 + 5, 1, 34, y0 + 5, ON - 1, b("mullion_silver"));
		for (int x = 26; x <= 33; x += 2) {
			c.set(x, y0 + 4, 2, ModBlocks.CEILING_DOWNLIGHT);
		}
		// water feature and trees inside
		for (int fx : new int[] {14, 40}) {
			c.fill(fx, y0 + 1, 11, fx + 5, y0 + 1, 14, b("black_marble"));
			c.fill(fx + 1, y0 + 1, 12, fx + 4, y0 + 1, 13, Blocks.WATER);
		}
		for (int x : new int[] {12, 21, 38, 47}) {
			c.set(x, y0, 9, Blocks.GRASS_BLOCK);
			Landscape.tree(c, x, y0 + 1, 9, Landscape.Tree.FLOWERING, r);
		}
		// rooms on the south side
		Canvas leasing = c.frame(X0, y0, ZB, 20, D, Direction.NORTH, false);
		Amenities.shell(leasing, 20, D, 5, b("herringbone_oak"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		leasing.door(10, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		glazeRoom(leasing, glass, 20, D, 5, false, true, false);
		Canvas mail = c.frame(30, y0, ZB, 21, D, Direction.NORTH, true);
		Amenities.shell(mail, 21, D, 5, b("terrazzo"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		mail.door(10, 1, -1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		glazeRoom(mail, glass, 21, D, 5, false, false, true);
		furnishLater.add(() -> {
			Amenities.lobby(lobby, lw, ld, h, r, Theme.MODERN, ModBlocks.RECEPTION_DESK_WALNUT, "SKYLINE TOWERS",
				"DIRECTORY", "P1  Garage", "L   Lobby, Mail", "2   Fitness", "3-33 Residences", "SKY Garden, Spa", "PH  Penthouses",
				"35  Sky Lounge");
			Amenities.leasing(leasing, 20, D, 5, r, Theme.MODERN);
			Amenities.mailRoom(mail, 21, D, 5, r);
			buf.addMarker("amenity", 29, y0 + 1, 14, "lobby");
			marker(leasing, 20, D, "leasing office");
			marker(mail, 21, D, "mail & packages");
		});
	}

	private void amenityFloor(int y0) {
		int h = H - 1;
		Object[][] rooms = {
			{"fitness", X0, ZF, 20, Direction.SOUTH, true, Direction.WEST},
			{"studio", 30, ZF, 21, Direction.SOUTH, false, Direction.EAST},
			{"lounge", X0, ZB, 20, Direction.NORTH, false, Direction.WEST},
			{"cowork", 30, ZB, 21, Direction.NORTH, true, Direction.EAST},
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
			Block floor = name.equals("fitness") || name.equals("studio") ? b("rubber_flooring") : b("hardwood_gray");
			Amenities.shell(f, w, D, h, floor, b("drywall_white"), ModBlocks.CEILING_FINISH);
			f.door(w / 2, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.LEFT, false);
			glazeRoom(f, glass, w, D, h, false, f.dir(Direction.WEST) == side, f.dir(Direction.EAST) == side);
			furnishLater.add(() -> {
				switch (name) {
					case "fitness" -> Amenities.fitness(f, w, D, h, r);
					case "studio" -> yogaStudio(f, w, D, h);
					case "lounge" -> Amenities.clubLounge(f, w, D, h, r, Theme.MODERN);
					default -> Amenities.cowork(f, w, D, h, r);
				}
				marker(f, w, D, switch (name) {
					case "fitness" -> "fitness center";
					case "studio" -> "yoga studio";
					case "lounge" -> "resident lounge";
					default -> "co-working";
				});
			});
		}
	}

	/** Double-height sky garden and spa halfway up the tower. */
	private void skyGarden(int y0) {
		int h = GARDEN_H - 1;
		plate(y0, h);
		Object[][] rooms = {
			{"garden", X0, ZF, 20, Direction.SOUTH, true, Direction.WEST},
			{"spa", 30, ZF, 21, Direction.SOUTH, false, Direction.EAST},
			{"library", X0, ZB, 20, Direction.NORTH, false, Direction.WEST},
			{"games", 30, ZB, 21, Direction.NORTH, true, Direction.EAST},
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
				case "garden" -> b("pavers_sand");
				case "spa" -> b("travertine");
				default -> b("herringbone_oak");
			};
			Amenities.shell(f, w, D, h, floor, name.equals("garden") ? b("green_wall") : b("drywall_white"), ModBlocks.CEILING_FINISH);
			f.door(w / 2, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.LEFT, false);
			glazeRoom(f, glass, w, D, h, false, f.dir(Direction.WEST) == side, f.dir(Direction.EAST) == side);
			furnishLater.add(() -> {
				switch (name) {
					case "garden" -> garden(f, w, D, h);
					case "spa" -> spa(f, w, D, h);
					case "library" -> Amenities.wideLounge(f, w, D, h, r, Theme.CLASSIC, new String[] {"SKY LIBRARY", "Quiet reading", "Return books here"},
						Amenities.Bay.LIBRARY, Amenities.Bay.FIRESIDE);
					default -> Amenities.gameRoom(f, w, D, h, r);
				}
				marker(f, w, D, switch (name) {
					case "garden" -> "sky garden";
					case "spa" -> "sky spa";
					case "library" -> "sky library";
					default -> "sky game room";
				});
			});
		}
	}

	private void garden(Canvas f, int w, int d, int h) {
		for (int x = 1; x < w - 1; x += 5) {
			for (int z = 2; z < d - 1; z += 5) {
				f.fill(x - 1, 0, z - 1, x + 1, 0, z + 1, Blocks.GRASS_BLOCK);
				Landscape.tree(f, x, 1, z, x % 2 == 0 ? Landscape.Tree.CHERRY : Landscape.Tree.FLOWERING, r);
				for (Direction dir : Direction.Plane.HORIZONTAL) {
					f.set(x + dir.getStepX(), 1, z + dir.getStepZ(), Blocks.MOSS_CARPET);
				}
			}
		}
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.FAMILY);
		for (int x = 0; x < w; x++) {
			for (int z = 0; z < d; z++) {
				net.minecraft.world.level.block.state.BlockState s = f.get(x, 1, z);
				if (s != null && !s.isAir() && !s.is(Blocks.MOSS_CARPET)) {
					g.use(x, z);
				}
			}
		}
		for (int z = 1; z < d - 1; z += 3) {
			Furnish.placeIfFree(g, new int[] {w - 1, z}, ModBlocks.PARK_BENCH, Direction.WEST);
		}
		Amenities.finish(g, false);
	}

	private void spa(Canvas f, int w, int d, int h) {
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.LUXURY);
		for (int i = 0; i < 2; i++) {
			int x0 = 2 + i * 7;
			int z0 = d - 5;
			if (x0 + 3 >= w) {
				break;
			}
			f.fill(x0 - 1, 1, z0 - 1, x0 + 3, 1, z0 + 3, b("pool_coping"));
			f.fill(x0, 1, z0, x0 + 2, 1, z0 + 2, Blocks.WATER);
			for (int x = x0 - 1; x <= x0 + 3; x++) {
				for (int z = z0 - 1; z <= z0 + 3; z++) {
					g.use(x, z);
				}
			}
			f.put(x0 + 1, 2, z0 - 1, ModBlocks.HOT_TUB_JET, Direction.SOUTH);
		}
		for (int x = 1; x < w - 1; x += 3) {
			if (g.free(x, 1) && g.free(x, 2)) {
				RoomGrid.Tx tx = g.begin();
				g.use(x, 1);
				g.use(x, 2);
				if (g.commitIfConnected(tx)) {
					f.twoPart(x, 1, 2, ModBlocks.POOL_LOUNGER, Direction.NORTH);
				}
			}
		}
		Furnish.placeIfFree(g, new int[] {w - 1, d / 2}, ModBlocks.TOWEL_CART, Direction.WEST);
		Amenities.finish(g, true);
	}

	// ================================================================================== top of the tower
	private void skyLounge(int y0) {
		int h = SKY_H - 1;
		plate(y0, h);
		Canvas front = c.frame(X0, y0, ZF, X1 - X0 + 1, D, Direction.SOUTH, true);
		Canvas back = c.frame(X0, y0, ZB, X1 - X0 + 1, D, Direction.NORTH, false);
		int w = X1 - X0 + 1;
		for (Canvas f : new Canvas[] {front, back}) {
			Amenities.shell(f, w, D, h, b("herringbone_oak"), b("drywall_white"), ModBlocks.CEILING_FINISH_WOOD);
			f.door(w / 2 - 1, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.RIGHT, false);
			f.door(w / 2, 1, -1, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.SOUTH, DoorHingeSide.LEFT, false);
			glazeRoom(f, glass, w, D, h, false, true, true);
		}
		furnishLater.add(() -> {
			Amenities.wideLounge(front, w, D, h, r, Theme.LUXURY, new String[] {"SKY LOUNGE", "Level 35", "Residents & guests"},
				Amenities.Bay.FIRESIDE, Amenities.Bay.DINING, Amenities.Bay.VIEW, Amenities.Bay.LIBRARY);
			Amenities.wideLounge(back, w, D, h, r, Theme.LUXURY, new String[] {"SKY BAR", "Level 35", "Open 4pm - midnight"},
				Amenities.Bay.BAR, Amenities.Bay.CAFE, Amenities.Bay.GAME, Amenities.Bay.FIRESIDE);
			marker(front, w, D, "sky lounge");
			marker(back, w, D, "sky bar");
		});
	}

	private void roof(int y0) {
		c.fill(OW, y0, ON, OE, y0, OS, b("pool_deck"));
		for (int x = OW; x <= OE; x++) {
			c.set(x, y0 + 1, ON, ModBlocks.GLASS_RAILING);
			c.set(x, y0 + 1, OS, ModBlocks.GLASS_RAILING);
		}
		for (int z = ON; z <= OS; z++) {
			c.set(OW, y0 + 1, z, ModBlocks.GLASS_RAILING);
			c.set(OE, y0 + 1, z, ModBlocks.GLASS_RAILING);
		}
		// glass lantern over the core with the name and a spire
		int lx0 = CORE_X0 + 2;
		int lx1 = CORE_X1 - 2;
		c.fill(lx0, y0 + 1, 16, lx1, y0 + 6, 40, b("curtain_wall_blue"));
		c.fill(lx0 + 1, y0 + 1, 17, lx1 - 1, y0 + 5, 39, Blocks.AIR);
		c.fill(lx0, y0 + 6, 16, lx1, y0 + 6, 40, b("mullion_silver"));
		for (int z : new int[] {20, 36}) {
			c.door(lx1, y0 + 1, z, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), Direction.EAST, DoorHingeSide.LEFT, false);
		}
		c.fill(lx0 + 1, y0, 17, lx1 - 1, y0, 39, b("terrazzo"));
		Signage.centredLetters(c, 29, y0 + 1, 15, Direction.WEST, "SKYLINE", Blocks.SEA_LANTERN);
		for (int y = y0 + 7; y < buf.sizeY; y++) {
			c.set(29, y, 28, y == buf.sizeY - 1 ? Blocks.LIGHTNING_ROD : Blocks.IRON_BARS);
		}
		// observation deck: telescopes (lamp posts as stand-ins are avoided), benches and planters
		for (int x = OW + 3; x < OE - 2; x += 6) {
			c.put(x, y0 + 1, ON + 2, ModBlocks.PARK_BENCH, Direction.NORTH);
			c.put(x, y0 + 1, OS - 2, ModBlocks.PARK_BENCH, Direction.SOUTH);
			c.put(x + 3, y0 + 1, ON + 2, ModBlocks.PLANTER_BOX, Direction.NORTH);
			c.put(x + 3, y0 + 1, OS - 2, ModBlocks.PLANTER_BOX, Direction.NORTH);
		}
		for (int z = 10; z < 48; z += 8) {
			c.put(OW + 2, y0 + 1, z, ModBlocks.LOUNGE_CHAIR, Direction.WEST);
			c.put(OE - 2, y0 + 1, z, ModBlocks.LOUNGE_CHAIR, Direction.EAST);
		}
		Landscape.firePit(c, 10, y0 + 1, 10);
		Landscape.firePit(c, 49, y0 + 1, 46);
		buf.addMarker("amenity", 20, y0 + 1, ON + 3, "observation deck");
	}

	// ================================================================================== cores
	private void cores() {
		Cores.StairStyle stairs = Cores.StairStyle.concrete();
		int depth = CORE_Z1 - CORE_Z0 - 1;
		Cores.stairCore(c.frame(13, 0, CORE_Z0 + 1, Cores.STAIR_WIDTH, depth, Direction.NORTH, false), stairs, floors, "STAIR A");
		Cores.stairCore(c.frame(42, 0, CORE_Z0 + 1, Cores.STAIR_WIDTH, depth, Direction.SOUTH, true), stairs, floors, "STAIR B");
		List<Cores.Floor> stops = new ArrayList<>(floors.subList(0, floors.size() - 1));
		Cores.elevatorBank(c.frame(21, 0, CORE_Z0 + 1, 7, 3, Direction.NORTH, false), ELEVATORS, stops);
		Cores.elevatorBank(c.frame(31, 0, CORE_Z1 - 3, 7, 3, Direction.SOUTH, true), ELEVATORS, stops);
		for (Cores.Floor f : stops) {
			if (f.y0() >= TYP) {
				Signage.wayfinding(c, 29, f.y0() + 2, NC0 + 2, Direction.NORTH, "FLOOR " + f.label(), "High-speed elevators",
					"Sky Garden: SKY", "Sky Lounge: 35");
			}
		}
	}
}
