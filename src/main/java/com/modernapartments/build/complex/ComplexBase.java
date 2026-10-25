package com.modernapartments.build.complex;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.Canvas;
import com.modernapartments.build.ComplexBuilder;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.interior.Amenities;
import com.modernapartments.build.interior.Furnish;
import com.modernapartments.build.interior.InteriorStyle;
import com.modernapartments.build.interior.InteriorStyle.Theme;
import com.modernapartments.build.interior.RoomGrid;
import com.modernapartments.build.interior.UnitBuilder;
import com.modernapartments.registry.ModBlocks;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.VegetationBlock;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * Shared scaffolding for the complex generators: buffer and site preparation, unit slots stacked over
 * floors with per-stack plans, and filling any gaps left in a building envelope.
 */
abstract class ComplexBase implements ComplexBuilder {
	protected BlockBuffer buf;
	protected Canvas c;
	protected RandomSource r;
	protected long seed;
	protected int groundY;

	protected abstract ComplexType type();

	protected abstract void generate();

	@Override
	public final BlockBuffer build(long seed) {
		ComplexType t = type();
		this.seed = seed;
		this.groundY = t.groundY();
		this.buf = new BlockBuffer(t.sizeX(), t.sizeY(), t.sizeZ(), t.groundY());
		this.c = new Canvas(buf);
		this.r = RandomSource.create(seed ^ 0x5DEECE66DL);
		// earth below the ground layer, a grass surface and explicit air above (clears terrain on the lot)
		c.fill(0, 0, 0, t.sizeX() - 1, Math.max(0, groundY - 3), t.sizeZ() - 1, Blocks.STONE);
		if (groundY >= 1) {
			c.fill(0, Math.max(0, groundY - 2), 0, t.sizeX() - 1, groundY - 1, t.sizeZ() - 1, Blocks.DIRT);
		}
		c.fill(0, groundY, 0, t.sizeX() - 1, groundY, t.sizeZ() - 1, Blocks.GRASS_BLOCK);
		c.fill(0, groundY + 1, 0, t.sizeX() - 1, t.sizeY() - 1, t.sizeZ() - 1, Blocks.AIR);
		generate();
		removeStrandedPlants();
		return buf;
	}

	/** Lawn flowers and grass left standing where paving, decks or water later replaced the soil under them. */
	private void removeStrandedPlants() {
		for (int y = 1; y < buf.sizeY; y++) {
			for (int z = 0; z < buf.sizeZ; z++) {
				for (int x = 0; x < buf.sizeX; x++) {
					BlockState s = buf.get(x, y, z);
					if (s == null || !(s.getBlock() instanceof VegetationBlock) || s.getBlock() instanceof DoublePlantBlock) {
						continue;
					}
					BlockState below = buf.get(x, y - 1, z);
					boolean soil = below != null && (s.getBlock() instanceof CropBlock ? below.is(Blocks.FARMLAND)
						: below.is(Blocks.GRASS_BLOCK) || below.is(Blocks.DIRT) || below.is(Blocks.COARSE_DIRT) || below.is(Blocks.ROOTED_DIRT)
							|| below.is(Blocks.PODZOL) || below.is(Blocks.MOSS_BLOCK) || below.is(Blocks.FARMLAND));
					if (!soil) {
						buf.set(x, y, z, Blocks.AIR.defaultBlockState());
					}
				}
			}
		}
	}

	protected static Block b(String id) {
		return ModBlocks.get(id);
	}

	// ================================================================================== units
	/** A unit position repeated on several floors; {@code stack} keeps the floor plan identical vertically. */
	protected record Slot(int x0, int z0, int w, int d, Direction front, boolean mirror, UnitBuilder.Type type, int stack,
			Set<Direction> exterior) {
		static Slot of(int x0, int z0, int w, int d, Direction front, boolean mirror, UnitBuilder.Type type, int stack,
				Direction... exterior) {
			Set<Direction> set = EnumSet.noneOf(Direction.class);
			for (Direction e : exterior) {
				set.add(e);
			}
			return new Slot(x0, z0, w, d, front, mirror, type, stack, set);
		}
	}

	/** Shared settings applied to every unit of a building. */
	protected record UnitLook(UnitBuilder.Facade facade, InteriorStyle.Theme[] themes, Block shellWall, Block entryDoor,
			Block sign, DyeColor signColor, boolean signGlow) {
	}

	protected long planSeed(int stack) {
		return seed * 31L + stack * 0x9E3779B97F4A7C15L;
	}

	protected long styleSeed(int floor, int stack) {
		return seed ^ (floor * 1_000_003L + stack * 7919L) * 0xBF58476D1CE4E5B9L;
	}

	/** Builds one unit of {@code slot} on the floor whose slab is at {@code y0}. */
	protected UnitBuilder.Result unit(Slot slot, int y0, int h, int floor, String number, UnitLook look,
			UnitBuilder.@Nullable Balcony balcony) {
		return unit(c, slot, y0, h, floor, number, look, balcony);
	}

	/** Same, with the slot given in the coordinates of {@code parent} (a building wing's frame). */
	protected UnitBuilder.Result unit(Canvas parent, Slot slot, int y0, int h, int floor, String number, UnitLook look,
			UnitBuilder.@Nullable Balcony balcony) {
		Canvas f = parent.frame(slot.x0(), y0, slot.z0(), slot.w(), slot.d(), slot.front(), slot.mirror());
		boolean extLeft = slot.exterior().contains(f.dir(Direction.WEST));
		boolean extRight = slot.exterior().contains(f.dir(Direction.EAST));
		InteriorStyle.Theme[] themes = look.themes();
		InteriorStyle.Theme theme = themes[Math.floorMod((int) (styleSeed(floor, slot.stack()) >>> 7), themes.length)];
		UnitBuilder.Spec spec = new UnitBuilder.Spec(slot.type(), slot.w(), slot.d(), h, look.facade())
			.number(number).theme(theme).seeds(planSeed(slot.stack()), styleSeed(floor, slot.stack()))
			.exterior(extLeft, extRight).balcony(balcony).shell(look.shellWall(), look.entryDoor())
			.sign(look.sign(), look.signColor(), look.signGlow());
		return UnitBuilder.build(f, spec);
	}

	// ================================================================================== envelope
	/**
	 * Closes gaps in a rectangular two-layer envelope for one storey: wherever nothing claimed the outer
	 * ring (the facade plane at the rectangle's edge), the outer cell gets the facade (spandrel at y0) and
	 * the lining cell one block inside gets {@code lining}. Window niches of units are left alone because
	 * their outer cell holds glass.
	 */
	protected void envelope(int x0, int z0, int x1, int z1, int y0, int height, Block outer, Block spandrel, Block lining) {
		for (int x = x0; x <= x1; x++) {
			column(x, z0, x, z0 + 1, y0, height, outer, spandrel, lining, x > x0 && x < x1);
			column(x, z1, x, z1 - 1, y0, height, outer, spandrel, lining, x > x0 && x < x1);
		}
		for (int z = z0 + 1; z < z1; z++) {
			column(x0, z, x0 + 1, z, y0, height, outer, spandrel, lining, true);
			column(x1, z, x1 - 1, z, y0, height, outer, spandrel, lining, true);
		}
	}

	private void column(int ox, int oz, int lx, int lz, int y0, int height, Block outer, Block spandrel, Block lining, boolean withLining) {
		gapColumn(c, ox, oz, withLining ? lx : ox, withLining ? lz : oz, y0, height, outer, spandrel, lining);
	}

	/**
	 * Fills one facade column (outer cell, lining cell behind it) where nothing claimed it. A window or door
	 * is never covered: the outer cell is only filled when it is empty and the lining behind is either empty
	 * too or a plain solid wall (not glass, not a door).
	 */
	protected static void gapColumn(Canvas f, int ox, int oz, int lx, int lz, int y0, int height, Block outer, Block spandrel, Block lining) {
		for (int y = y0; y < y0 + height; y++) {
			if (!f.isAirOrUnset(ox, y, oz)) {
				continue;
			}
			BlockState in = f.get(lx, y, lz);
			boolean liningOpen = in == null || in.isAir();
			if (!liningOpen && (isOpening(in) || !in.isCollisionShapeFullBlock(net.minecraft.world.level.EmptyBlockGetter.INSTANCE,
				net.minecraft.core.BlockPos.ZERO))) {
				continue;
			}
			f.set(ox, y, oz, y == y0 ? spandrel : outer);
			if (liningOpen && y > y0 && (lx != ox || lz != oz)) {
				f.set(lx, y, lz, lining);
			}
		}
	}

	private static boolean isOpening(BlockState s) {
		return s.getBlock() instanceof net.minecraft.world.level.block.TransparentBlock
			|| s.getBlock() instanceof net.minecraft.world.level.block.IronBarsBlock
			|| s.getBlock() instanceof net.minecraft.world.level.block.DoorBlock;
	}

	/**
	 * Closes gaps along one straight facade segment (outer plane from (x0, z0) to (x1, z1)); the lining is one
	 * step towards {@code in}. Like {@link #envelope}, only columns nothing else claimed are filled.
	 */
	protected void facade(int x0, int z0, int x1, int z1, Direction in, int y0, int height, Block outer, Block spandrel, Block lining) {
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				column(x, z, x + in.getStepX(), z + in.getStepZ(), y0, height, outer, spandrel, lining, true);
			}
		}
	}

	/** Sets a block where the buffer still holds the site's default air. */
	protected void setIfOpen(int x, int y, int z, Block block) {
		BlockState s = c.get(x, y, z);
		if (s == null || s.isAir()) {
			c.set(x, y, z, block);
		}
	}

	/** Paves a rectangle of the ground layer. */
	protected void pave(int x0, int z0, int x1, int z1, Block block) {
		c.fill(x0, groundY, z0, x1, groundY, z1, block);
	}

	// ================================================================================== shared rooms
	protected void trashRoom(Canvas f, int w, int d, int h) {
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.MODERN);
		for (int z = 1; z < d - 1; z += 2) {
			Furnish.placeIfFree(g, new int[] {0, z}, ModBlocks.TRASH_BIN, Direction.EAST);
			Furnish.placeIfFree(g, new int[] {w - 1, z}, ModBlocks.RECYCLING_BIN, Direction.WEST);
		}
		Amenities.finish(g, false);
	}

	/** Marker on a reachable cell near the middle of a room frame. */
	protected void marker(Canvas f, int w, int d, String label) {
		RoomGrid g = new RoomGrid(f, InteriorStyle.roll(Theme.MODERN, r), 0, 0, w - 1, d - 1, 3);
		g.detectEntrances();
		for (int x = 0; x < w; x++) {
			for (int z = 0; z < d; z++) {
				net.minecraft.world.level.block.state.BlockState s = f.get(x, 1, z);
				if (s != null && !s.isAir() && !(s.getBlock() instanceof net.minecraft.world.level.block.CarpetBlock)
					&& !s.getCollisionShape(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, net.minecraft.core.BlockPos.ZERO).isEmpty()) {
					g.use(x, z);
				}
			}
		}
		int[] p = g.centre();
		f.marker("amenity", p[0], 1, p[1], label);
	}

	/** Floor-to-ceiling glass on a room's exterior walls (back wall z = d, optional side walls). */
	protected void glazeRoom(Canvas f, UnitBuilder.Facade glass, int w, int d, int h, boolean doors, boolean left, boolean right) {
		List<int[]> cells = new ArrayList<>();
		char[] pattern = new char[w + 2];
		for (int x = -1; x <= w; x++) {
			cells.add(new int[] {x, d});
			pattern[x + 1] = x < 0 || x >= w ? 'S' : 'G';
		}
		if (doors) {
			pattern[w / 2 + 1] = 'D';
			pattern[w / 2 + 2] = 'D';
		}
		UnitBuilder.glaze(f, glass, h, cells, Direction.SOUTH, pattern, b("hardwood_gray"));
		for (int s = 0; s < 2; s++) {
			if (!(s == 0 ? left : right)) {
				continue;
			}
			int x = s == 0 ? -1 : w;
			List<int[]> side = new ArrayList<>();
			char[] p = new char[d];
			for (int z = 0; z < d; z++) {
				side.add(new int[] {x, z});
				p[z] = z == 0 ? 'S' : 'G';
			}
			UnitBuilder.glaze(f, glass, h, side, s == 0 ? Direction.WEST : Direction.EAST, p, b("hardwood_gray"));
		}
	}

	protected void yogaStudio(Canvas f, int w, int d, int h) {
		RoomGrid g = Amenities.grid(f, w, d, h, r, Theme.MODERN);
		for (int x = 1; x < w - 1; x += 2) {
			Furnish.placeIfFree(g, new int[] {x, d - 2}, ModBlocks.EXERCISE_BIKE, Direction.SOUTH);
		}
		for (int x = 1; x < w - 1; x += 2) {
			for (int z = 2; z < d - 4; z += 3) {
				Furnish.placeIfFree(g, new int[] {x, z}, ModBlocks.YOGA_MATS.get((x + z) % ModBlocks.YOGA_MATS.size()), Direction.SOUTH);
			}
		}
		for (int z = 1; z < d - 1; z++) {
			Furnish.wallItem(g, 0, z, Direction.WEST, 2, ModBlocks.GYM_MIRROR);
		}
		Furnish.placeIfFree(g, new int[] {w - 1, 1}, ModBlocks.ROLLED_YOGA_MAT, Direction.WEST);
		Furnish.placeIfFree(g, new int[] {w - 1, 2}, ModBlocks.TOWEL_CART, Direction.WEST);
		Amenities.finish(g, true);
	}

	protected void hvac(int x, int y, int z) {
		c.fill(x, y, z, x + 2, y + 1, z + 3, b("metal_panel_silver"));
		c.fill(x, y + 2, z, x + 2, y + 2, z + 3, Blocks.IRON_TRAPDOOR);
		c.fill(x - 1, y, z + 4, x + 3, y, z + 4, Blocks.AIR);
	}
}
