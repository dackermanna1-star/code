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
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;

/**
 * The Courtyard Apartments: a garden-style community of three lap-sided buildings with hip roofs and a
 * balcony or patio for every home, arranged around a resort pool deck, a turf lawn with cornhole and
 * lounge seating, and a clubhouse with leasing, fitness and a resident lounge. Parking along the street,
 * a dog park, playground and grilling pavilion out back.
 */
public final class CourtyardBuilder extends ComplexBase {
	private static final int H = 4;
	private static final int D = 11;
	private static final int DEPTH = 2 * D + 5;

	private Corridors.Style hall;
	private final List<Runnable> furnishLater = new ArrayList<>();

	/** One residential building: a straight double-loaded bar in its own frame. */
	private record Bar(String name, Canvas frame, int length, int floors, Block siding, int stackBase, char letter) {
	}

	@Override
	protected ComplexType type() {
		return ComplexType.COURTYARD;
	}

	@Override
	protected void generate() {
		int g = groundY;
		hall = new Corridors.Style(b("hardwood_gray"), ModBlocks.RUNNER_RUGS.get(2), ModBlocks.CEILING_FINISH, ModBlocks.CEILING_DOWNLIGHT,
			ModBlocks.WALL_SCONCE);
		site();
		List<Bar> bars = List.of(
			new Bar("BUILDING A", c.frame(6, g, 18, 62, DEPTH, Direction.WEST, false), 62, 4, b("lap_siding_white"), 0, 'A'),
			new Bar("BUILDING B", c.frame(79, g, 18, 62, DEPTH, Direction.EAST, false), 62, 4, b("lap_siding_sage"), 20, 'B'),
			new Bar("BUILDING C", c.frame(40, g, 70, 32, DEPTH, Direction.SOUTH, false), 32, 3, b("lap_siding_navy"), 40, 'C'));
		for (Bar bar : bars) {
			building(bar);
		}
		clubhouse();
		furnishLater.forEach(Runnable::run);
		buf.addMarker("entrance", 55, g + 1, 4, "parking lot");
	}

	// ================================================================================== residential buildings
	private void building(Bar bar) {
		Canvas f = bar.frame();
		int len = bar.length();
		int stairDepth = Cores.stairDepth(H);
		List<Cores.Floor> floors = new ArrayList<>();
		for (int i = 0; i < bar.floors(); i++) {
			floors.add(new Cores.Floor(i * H, H, i == 0 ? "1" : String.valueOf(i + 1)));
		}
		UnitBuilder.Facade upper = new UnitBuilder.Facade(b("drywall_white"), bar.siding(), bar.siding(), b("window_glass"),
			null, 0, UnitBuilder.WindowStyle.STANDARD, false, false);
		UnitBuilder.Facade base = new UnitBuilder.Facade(b("drywall_white"), b("brick_tan"), b("limestone"), b("window_glass"),
			null, 0, UnitBuilder.WindowStyle.STANDARD, false, false);
		Theme[] themes = {Theme.FAMILY, Theme.MODERN, Theme.CLASSIC, Theme.FAMILY};
		int ex = len / 2 - 1;
		for (int floor = 1; floor <= bar.floors(); floor++) {
			int y0 = (floor - 1) * H;
			int h = H - 1;
			UnitBuilder.Facade facade = floor == 1 ? base : upper;
			UnitLook look = new UnitLook(facade, themes, b("drywall_white"), ModBlocks.DOORS.get(ModBlocks.DoorStyle.WHITE),
				Blocks.OAK_WALL_SIGN, DyeColor.BLACK, false);
			f.fill(-2, y0, -2, len + 1, y0, DEPTH + 1, b("polished_concrete"));
			Corridors.corridor(f, 0, D + 1, len - 1, D + 3, y0, h, hall);
			// corridor ends: exit doors on the ground floor, windows above
			for (int end : new int[] {-1, len}) {
				int out = end < 0 ? -2 : len + 1;
				f.fill(end, y0 + 1, D + 1, end, y0 + h, D + 3, facade.lining());
				f.fill(out, y0 + 1, D, out, y0 + h, D + 4, facade.outer());
				f.fill(end, y0, D + 1, out, y0, D + 3, b("hardwood_gray"));
				if (floor == 1) {
					f.set(end, y0 + 1, D + 2, Blocks.AIR);
					f.set(end, y0 + 2, D + 2, Blocks.AIR);
					f.door(out, y0 + 1, D + 2, ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS), end < 0 ? Direction.WEST : Direction.EAST,
						DoorHingeSide.LEFT, false);
				} else {
					f.fill(end, y0 + 1, D + 1, end, y0 + 2, D + 3, Blocks.AIR);
					f.fill(out, y0 + 1, D + 1, out, y0 + 2, D + 3, b("window_glass"));
				}
			}
			// fillers behind the stairs and the elevator
			f.fill(0, y0 + 1, 0, 4, y0 + h, D - stairDepth - 1, b("drywall_white"));
			f.fill(len - 5, y0 + 1, D + 5 + stairDepth + 1, len - 1, y0 + h, DEPTH - 1, b("drywall_white"));
			f.fill(ex - 1, y0 + 1, 0, ex + 3, y0 + h, D - 5, b("drywall_white"));
			List<Slot> slots = new ArrayList<>();
			Direction outA = f.dir(Direction.NORTH);
			Direction outB = f.dir(Direction.SOUTH);
			Direction westEnd = f.dir(Direction.WEST);
			Direction eastEnd = f.dir(Direction.EAST);
			int sb = bar.stackBase();
			if (len >= 50) {
				// row A (outer side): after stair 1, split by the elevator
				slots.add(Slot.of(6, 0, 12, D, Direction.SOUTH, true, Type.ONE_BED, sb + 1, outA));
				slots.add(Slot.of(19, 0, ex - 20, D, Direction.SOUTH, false, Type.STUDIO, sb + 2, outA));
				int ax = ex + 4;
				slots.add(Slot.of(ax, 0, 18, D, Direction.SOUTH, true, Type.TWO_BED, sb + 3, outA));
				slots.add(Slot.of(ax + 19, 0, len - ax - 19, D, Direction.SOUTH, false, Type.STUDIO, sb + 4, outA, eastEnd));
				// row B (courtyard side): up to stair 2
				slots.add(Slot.of(0, D + 5, 19, D, Direction.NORTH, false, Type.TWO_BED, sb + 5, outB, westEnd));
				slots.add(Slot.of(20, D + 5, 13, D, Direction.NORTH, true, Type.ONE_BED, sb + 6, outB));
				slots.add(Slot.of(34, D + 5, 13, D, Direction.NORTH, false, Type.ONE_BED, sb + 7, outB));
				slots.add(Slot.of(48, D + 5, len - 6 - 48, D, Direction.NORTH, true, Type.STUDIO, sb + 8, outB));
			} else {
				slots.add(Slot.of(6, 0, ex - 7, D, Direction.SOUTH, true, Type.STUDIO, sb + 1, outA));
				slots.add(Slot.of(ex + 4, 0, len - ex - 4, D, Direction.SOUTH, false, Type.ONE_BED, sb + 2, outA, eastEnd));
				slots.add(Slot.of(0, D + 5, 13, D, Direction.NORTH, false, Type.ONE_BED, sb + 3, outB, westEnd));
				slots.add(Slot.of(14, D + 5, len - 6 - 14, D, Direction.NORTH, true, Type.ONE_BED, sb + 4, outB));
			}
			UnitBuilder.Balcony balcony = new UnitBuilder.Balcony(2, b("walnut_cladding"), ModBlocks.METAL_RAILING);
			UnitBuilder.Balcony patio = new UnitBuilder.Balcony(2, b("pavers_sand"), Blocks.WHITE_STAINED_GLASS_PANE);
			for (int i = 0; i < slots.size(); i++) {
				String number = String.format("%c%d%02d", bar.letter(), floor, i + 1);
				unit(f, slots.get(i), y0, h, floor, number, look, floor == 1 ? patio : balcony);
			}
			f.wallSign(ex - 1, y0 + 2, D + 1, Blocks.DARK_OAK_WALL_SIGN, Direction.SOUTH,
				com.modernapartments.build.Inits.sign(DyeColor.WHITE, true, false, bar.name(), "Floor " + floor, "Elevator ->", ""));
		}
		int top = bar.floors() * H;
		// cores
		Cores.StairStyle stairs = Cores.StairStyle.concrete();
		List<Cores.Floor> withRoof = new ArrayList<>(floors);
		Cores.stairCore(f.frame(0, 0, D - stairDepth, Cores.STAIR_WIDTH, stairDepth, Direction.SOUTH, true), stairs, floors, bar.name() + " STAIR 1");
		Cores.stairCore(f.frame(len - 5, 0, D + 5, Cores.STAIR_WIDTH, stairDepth, Direction.NORTH, false), stairs, floors, bar.name() + " STAIR 2");
		Cores.elevatorBank(f.frame(ex, 0, D - 3, 3, 3, Direction.SOUTH, true),
			new Cores.ElevatorStyle(1, 3, 3, ModBlocks.get("elevator_wall"), ModBlocks.get("drywall_white")), withRoof);
		for (int floor = 1; floor <= bar.floors(); floor++) {
			int y0 = (floor - 1) * H;
			Corridors.decorate(f, 0, D + 1, len - 1, D + 3, y0, H - 1, hall, r);
			facadeGaps(f, len, y0, floor == 1 ? b("brick_tan") : bar.siding());
		}
		hipRoof(f, len, top);
	}

	/** Fills unclaimed parts of the bar's outer ring (around stairs and the elevator) with siding and lining. */
	private void facadeGaps(Canvas f, int len, int y0, Block siding) {
		Block lining = b("drywall_white");
		for (int x = -2; x <= len + 1; x++) {
			gapColumn(f, x, -2, x, -1, y0, H, siding, b("limestone"), lining);
			gapColumn(f, x, DEPTH + 1, x, DEPTH, y0, H, siding, b("limestone"), lining);
		}
		for (int z = -1; z <= DEPTH; z++) {
			gapColumn(f, -2, z, -1, z, y0, H, siding, b("limestone"), lining);
			gapColumn(f, len + 1, z, len, z, y0, H, siding, b("limestone"), lining);
		}
	}

	/** Hip roof of dark shingles: four inset rings of stairs rising to a flat ridge, with a white fascia. */
	private void hipRoof(Canvas f, int len, int top) {
		f.fill(-2, top, -2, len + 1, top, DEPTH + 1, b("drywall_white"));
		f.fill(-3, top, -3, len + 2, top, -3, Blocks.SMOOTH_QUARTZ_SLAB);
		f.fill(-3, top, DEPTH + 2, len + 2, top, DEPTH + 2, Blocks.SMOOTH_QUARTZ_SLAB);
		f.fill(-3, top, -3, -3, top, DEPTH + 2, Blocks.SMOOTH_QUARTZ_SLAB);
		f.fill(len + 2, top, -3, len + 2, top, DEPTH + 2, Blocks.SMOOTH_QUARTZ_SLAB);
		Block stair = Blocks.DEEPSLATE_TILE_STAIRS;
		int rings = 5;
		for (int i = 0; i < rings; i++) {
			int x0 = -2 + i;
			int x1 = len + 1 - i;
			int z0 = -2 + i;
			int z1 = DEPTH + 1 - i;
			int y = top + 1 + i;
			for (int x = x0; x <= x1; x++) {
				f.set(x, y, z0, stair.defaultBlockState().setValue(StairBlock.FACING, Direction.SOUTH));
				f.set(x, y, z1, stair.defaultBlockState().setValue(StairBlock.FACING, Direction.NORTH));
			}
			for (int z = z0 + 1; z < z1; z++) {
				f.set(x0, y, z, stair.defaultBlockState().setValue(StairBlock.FACING, Direction.EAST));
				f.set(x1, y, z, stair.defaultBlockState().setValue(StairBlock.FACING, Direction.WEST));
			}
		}
		f.fill(-2 + rings, top + rings, -2 + rings, len + 1 - rings, top + rings, DEPTH + 1 - rings, Blocks.DEEPSLATE_TILES);
		// roof vents and a chimney-like elevator overrun
		for (int x = 8; x < len - 8; x += 12) {
			f.set(x, top + rings + 1, DEPTH / 2, Blocks.IRON_TRAPDOOR);
		}
	}

	// ================================================================================== clubhouse
	private void clubhouse() {
		int g = groundY;
		int h = 5;
		int x0 = 44;
		int z0 = 18;
		int w = 24;
		int d = 14;
		Block glassDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.GLASS);
		c.fill(x0 - 2, g, z0 - 2, x0 + w + 1, g, z0 + d + 1, b("travertine"));
		// leasing & lobby (front middle), mail (front left), fitness (east wing), lounge (back)
		Canvas lobby = c.frame(x0 + 8, g, z0, 8, 6, Direction.NORTH, false);
		Canvas mail = c.frame(x0, g, z0, 7, 6, Direction.NORTH, false);
		Canvas gym = c.frame(x0 + 17, g, z0, 7, d, Direction.NORTH, false);
		Canvas lounge = c.frame(x0, g, z0 + 7, 16, d - 7, Direction.NORTH, false);
		Amenities.shell(lobby, 8, 6, h, b("large_tile_light"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Amenities.shell(mail, 7, 6, h, b("large_tile_light"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Amenities.shell(gym, 7, d, h, b("rubber_flooring"), b("drywall_white"), ModBlocks.CEILING_FINISH);
		Amenities.shell(lounge, 16, d - 7, h, b("hardwood_light"), b("drywall_white"), ModBlocks.CEILING_FINISH_WOOD);
		// exterior skin: stone base, glass on the long sides
		for (int x = x0 - 1; x <= x0 + w; x++) {
			for (int y = g + 1; y < g + h; y++) {
				boolean pier = (x - x0) % 4 == 3;
				if (!pier) {
					c.set(x, y, z0 - 1, y == g + 1 ? b("limestone") : b("window_glass"));
					c.set(x, y, z0 + d, y == g + 1 ? b("limestone") : b("window_glass"));
				} else {
					c.set(x, y, z0 - 1, b("brick_tan"));
					c.set(x, y, z0 + d, b("brick_tan"));
				}
			}
		}
		// doors: main entrance, lobby to mail / gym / lounge, lounge to the pool deck
		c.door(x0 + 11, g + 1, z0 - 1, glassDoor, Direction.SOUTH, DoorHingeSide.RIGHT, false);
		c.door(x0 + 12, g + 1, z0 - 1, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(x0 + 7, g + 1, z0 + 3, glassDoor, Direction.WEST, DoorHingeSide.LEFT, true);
		c.door(x0 + 16, g + 1, z0 + 3, glassDoor, Direction.EAST, DoorHingeSide.LEFT, true);
		c.door(x0 + 11, g + 1, z0 + 6, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, true);
		c.door(x0 + 6, g + 1, z0 + d, glassDoor, Direction.SOUTH, DoorHingeSide.RIGHT, false);
		c.door(x0 + 7, g + 1, z0 + d, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.door(x0 + 20, g + 1, z0 + d, glassDoor, Direction.SOUTH, DoorHingeSide.LEFT, false);
		c.put(x0 + 13, g + 2, z0 - 2, ModBlocks.INTERCOM, Direction.NORTH);
		c.put(x0 + 10, g + 2, z0 - 2, ModBlocks.KEYCARD_READER, Direction.NORTH);
		// roof
		Canvas roof = c.frame(x0, g + h + 1, z0, w, d, Direction.NORTH, false);
		c.fill(x0 - 1, g + 1, z0 - 1, x0 - 1, g + h, z0 + d, b("brick_tan"));
		c.fill(x0 + w, g + 1, z0 - 1, x0 + w, g + h, z0 + d, b("brick_tan"));
		roof.fill(-1, 0, -1, w, 0, d, b("drywall_white"));
		for (int i = 0; i < 4; i++) {
			for (int x = -1 + i; x <= w - i; x++) {
				roof.set(x, 1 + i, -1 + i, Blocks.DEEPSLATE_TILE_STAIRS.defaultBlockState().setValue(StairBlock.FACING, Direction.SOUTH));
				roof.set(x, 1 + i, d - i, Blocks.DEEPSLATE_TILE_STAIRS.defaultBlockState().setValue(StairBlock.FACING, Direction.NORTH));
			}
			for (int z = i; z < d - i; z++) {
				roof.set(-1 + i, 1 + i, z, Blocks.DEEPSLATE_TILE_STAIRS.defaultBlockState().setValue(StairBlock.FACING, Direction.EAST));
				roof.set(w - i, 1 + i, z, Blocks.DEEPSLATE_TILE_STAIRS.defaultBlockState().setValue(StairBlock.FACING, Direction.WEST));
			}
		}
		roof.fill(3, 4, 3, w - 4, 4, d - 4, Blocks.DEEPSLATE_TILES);
		c.wallSign(x0 + 14, g + 4, z0 - 2, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
			com.modernapartments.build.Inits.sign(DyeColor.WHITE, true, false, "THE COURTYARD", "Clubhouse", "Leasing & Fitness", ""));
		furnishLater.add(() -> {
			Amenities.leasing(lobby, 8, 6, h, r, Theme.FAMILY);
			Amenities.mailRoom(mail, 7, 6, h, r);
			Amenities.fitness(gym, 7, d, h, r);
			Amenities.clubLounge(lounge, 16, d - 7, h, r, Theme.FAMILY);
			marker(lobby, 8, 6, "leasing & clubhouse lobby");
			marker(mail, 7, 6, "mail room");
			marker(gym, 7, d, "fitness center");
			marker(lounge, 16, d - 7, "clubhouse lounge");
		});
	}

	// ================================================================================== site
	private void site() {
		int g = groundY;
		Landscape.lawn(c, 0, 0, 111, 99, g, r, 0.04);
		// street, entry drive and front parking
		pave(0, 0, 111, 1, b("sidewalk"));
		pave(4, 2, 107, 7, b("asphalt"));
		pave(52, 0, 59, 1, b("asphalt"));
		for (int x0 : new int[] {4, 68}) {
			Landscape.parkingRow(c.frame(x0, g, 8, 39, 5, Direction.SOUTH, true), 13, 0, false);
		}
		Landscape.lampsAlong(c, 4, 13, 107, 13, g + 1, 13);
		Landscape.hedge(c, 4, 14, 39, 14, g + 1, 1, Blocks.AZALEA_LEAVES);
		Landscape.hedge(c, 72, 14, 107, 14, g + 1, 1, Blocks.AZALEA_LEAVES);
		pave(44, 8, 67, 15, b("pavers_gray"));
		c.fill(46, g + 1, 1, 50, g + 2, 1, b("brick_tan"));
		Signage.sign(c, 48, g + 2, 0, Direction.NORTH, Blocks.DARK_OAK_WALL_SIGN, DyeColor.WHITE, "THE COURTYARD", "APARTMENTS",
			"2200 Sunset Drive", "Welcome Home");
		// courtyard paths between the buildings
		pave(36, 16, 39, 69, b("pavers_sand"));
		pave(72, 16, 75, 69, b("pavers_sand"));
		pave(36, 66, 75, 69, b("pavers_sand"));
		// resort pool deck behind the clubhouse, fenced
		Canvas deck = c.translate(40, g, 34);
		Landscape.poolDeck(deck, 32, 21, r, b("pool_deck"));
		for (int x = 39; x <= 72; x++) {
			c.set(x, g + 1, 33, Blocks.IRON_BARS);
			c.set(x, g + 1, 55, Blocks.IRON_BARS);
		}
		for (int z = 33; z <= 55; z++) {
			c.set(39, g + 1, z, Blocks.IRON_BARS);
			c.set(72, g + 1, z, Blocks.IRON_BARS);
		}
		c.set(50, g + 1, 33, Blocks.AIR);
		c.set(51, g + 1, 33, Blocks.AIR);
		c.set(64, g + 1, 33, Blocks.AIR);
		c.set(55, g + 1, 55, Blocks.AIR);
		c.set(56, g + 1, 55, Blocks.AIR);
		c.set(39, g + 1, 44, Blocks.AIR);
		c.set(72, g + 1, 44, Blocks.AIR);
		// turf lawn: cornhole, lounge seating, fire pit and string lights (the courtyard of the reference photos)
		Canvas turf = c.translate(40, g, 56);
		turf.fill(0, 0, 0, 31, 0, 7, ModBlocks.get("artificial_turf"));
		Landscape.cornhole(c.translate(41, g, 56), 5, 7);
		Landscape.cornhole(c.translate(47, g, 56), 5, 7);
		Furnish.balcony(c, r, 54, 57, 63, 61, Direction.SOUTH, true);
		Landscape.firePit(c, 67, g + 1, 59);
		Landscape.stringLights(c, 41, 63, 70, 63, g + 1);
		buf.addMarker("amenity", 52, g + 1, 60, "turf lawn");
		// out back: dog park behind building A, playground and grilling pavilion behind building B
		Landscape.dogPark(c.translate(8, g, 85), 22, 10, r, Direction.NORTH);
		Landscape.playground(c.translate(80, g, 84), 12, 8, r);
		c.marker("amenity", 85, g + 1, 86, "playground");
		Landscape.bbq(c.translate(94, g, 84), 12, 7, r);
		for (int x = 94; x <= 105; x += 11) {
			for (int z = 84; z <= 90; z += 6) {
				c.fill(x, g + 1, z, x, g + 4, z, Blocks.DARK_OAK_FENCE);
			}
		}
		c.fill(94, g + 5, 84, 105, g + 5, 90, Blocks.DARK_OAK_SLAB);
		for (int z = 20; z < 80; z += 10) {
			Landscape.tree(c, 1, g + 1, z, Landscape.randomTree(r), r);
			Landscape.tree(c, 110, g + 1, z, Landscape.randomTree(r), r);
		}
		for (int[] t : new int[][] {{37, 22}, {74, 22}, {37, 40}, {74, 40}, {37, 58}, {74, 58}}) {
			Landscape.tree(c, t[0], g + 1, t[1], Landscape.Tree.FLOWERING, r);
		}
	}
}
