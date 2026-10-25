package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.Inits;
import com.modernapartments.build.interior.Furnish.Zone;
import com.modernapartments.registry.ModBlocks;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import org.jspecify.annotations.Nullable;

/**
 * Builds one complete apartment in its own frame: local x runs across the unit, z from the corridor
 * (z = -1 is the corridor wall holding the entry door) to the exterior (z = d is the window wall),
 * y = 0 is the floor and y = h the ceiling layer. The floor plan comes from the plan seed, which a
 * building shares between all units of a vertical stack so windows line up; finishes and furniture
 * come from the per-unit style seed so no two apartments look alike.
 *
 * <p>Banded plans: a front band (depth 4-5) holds bathrooms, closets and the kitchen, the back band
 * holds the living room and bedrooms with windows. The living column runs the full depth (open plan);
 * bedrooms sit beside it in side columns, each with its own bath/closet in front.
 */
public final class UnitBuilder {
	public enum Type { STUDIO, ONE_BED, TWO_BED, PENTHOUSE, LOFT }

	public enum WindowStyle {
		/** Floor-to-ceiling glass. */
		TALL,
		/** Glass from sill height (one block) up to the head. */
		STANDARD
	}

	/**
	 * Exterior wall: an inner lining layer and an outer facade layer. {@code spandrel} is used for the
	 * outer layer at floor and ceiling level, {@code glassOuter} puts the glass flush with the facade
	 * instead of flush with the lining, and {@code fullGlass} glazes every room's full frontage.
	 */
	public record Facade(Block lining, Block outer, Block spandrel, Block glass, @Nullable Block mullion, int mullionEvery,
			WindowStyle style, boolean glassOuter, boolean fullGlass) {
	}

	/** Projecting balcony off the living room: usable depth, floor block and railing (a pane block). */
	public record Balcony(int depth, Block floor, Block railing) {
	}

	/** Everything a building decides about one unit. */
	public static final class Spec {
		public final Type type;
		public final int w;
		public final int d;
		public final int h;
		public final Facade facade;
		public String number = "101";
		public InteriorStyle.Theme theme = InteriorStyle.Theme.MODERN;
		public long planSeed;
		public long styleSeed;
		public boolean extLeft;
		public boolean extRight;
		public @Nullable Balcony balcony;
		public Block shellWall = ModBlocks.get("drywall_white");
		public Block entryDoor = ModBlocks.DOORS.get(ModBlocks.DoorStyle.WALNUT);
		public Block numberSign = Blocks.DARK_OAK_WALL_SIGN;
		public DyeColor signColor = DyeColor.WHITE;
		public boolean signGlow = true;

		public Spec(Type type, int w, int d, int h, Facade facade) {
			this.type = type;
			this.w = w;
			this.d = d;
			this.h = h;
			this.facade = facade;
		}

		public Spec number(String n) {
			this.number = n;
			return this;
		}

		public Spec theme(InteriorStyle.Theme t) {
			this.theme = t;
			return this;
		}

		public Spec seeds(long plan, long style) {
			this.planSeed = plan;
			this.styleSeed = style;
			return this;
		}

		public Spec exterior(boolean left, boolean right) {
			this.extLeft = left;
			this.extRight = right;
			return this;
		}

		public Spec balcony(@Nullable Balcony b) {
			this.balcony = b;
			return this;
		}

		public Spec shell(Block wall, Block door) {
			this.shellWall = wall;
			this.entryDoor = door;
			return this;
		}

		public Spec sign(Block sign, DyeColor color, boolean glow) {
			this.numberSign = sign;
			this.signColor = color;
			this.signGlow = glow;
			return this;
		}

		/** Smallest width this type can be built at. */
		public static int minWidth(Type type) {
			return switch (type) {
				case STUDIO -> 8;
				case ONE_BED -> 12;
				case TWO_BED -> 18;
				case PENTHOUSE -> 24;
				case LOFT -> 10;
			};
		}
	}

	public record Result(int doorX, int rooms) {
	}

	private enum Kind {
		LIVING("living room"), PRIMARY("primary bedroom"), BEDROOM("bedroom"), KIDS("kids' room"), ENSUITE("primary bath"),
		BATH("bathroom"), POWDER("powder room"), WIC("closet"), LAUNDRY("laundry"), DEN("den"), LOFT_BED("loft bedroom");

		final String label;

		Kind(String label) {
			this.label = label;
		}

		boolean wet() {
			return this == ENSUITE || this == BATH || this == POWDER || this == LAUNDRY;
		}
	}

	/** Side column roles: which rooms sit in the front band beside a bedroom and where their doors go. */
	private enum Role { PRIMARY, SECONDARY, HALL_BATH, ENSUITE_LAUNDRY }

	private static final class Room {
		final Kind kind;
		final int x0;
		final int z0;
		final int x1;
		final int z1;
		final Canvas canvas;
		final int h;
		RoomGrid grid;

		Room(Kind kind, int x0, int z0, int x1, int z1, Canvas canvas, int h) {
			this.kind = kind;
			this.x0 = x0;
			this.z0 = z0;
			this.x1 = x1;
			this.z1 = z1;
			this.canvas = canvas;
			this.h = h;
		}
	}

	private final Canvas c;
	private final Spec s;
	private final RandomSource plan;
	private final RandomSource rs;
	private final InteriorStyle style;
	private final List<Room> rooms = new ArrayList<>();
	private final char[] back;
	private final char[] leftWall;
	private final char[] rightWall;
	private int doorX;
	private int df;
	private int balconyX0 = -1;
	private int balconyX1 = -1;
	private boolean hasLaundry;

	private UnitBuilder(Canvas c, Spec s) {
		this.c = c;
		this.s = s;
		this.plan = RandomSource.create(s.planSeed);
		this.rs = RandomSource.create(s.styleSeed);
		this.style = InteriorStyle.roll(s.theme, rs);
		this.back = new char[s.w];
		this.leftWall = new char[s.d];
		this.rightWall = new char[s.d];
		Arrays.fill(back, 'S');
		Arrays.fill(leftWall, 'S');
		Arrays.fill(rightWall, 'S');
	}

	/** Builds the unit into {@code c}, whose origin is the unit's interior corner at floor level. */
	public static Result build(Canvas c, Spec s) {
		if (s.w < Spec.minWidth(s.type)) {
			throw new IllegalArgumentException(s.type + " unit too narrow: " + s.w);
		}
		UnitBuilder b = new UnitBuilder(c, s);
		if (s.type == Type.LOFT) {
			b.loft();
		} else {
			b.banded();
		}
		return new Result(b.doorX, b.rooms.size());
	}

	// ================================================================================== shell
	private void shell(Block ceiling) {
		int w = s.w;
		int d = s.d;
		int h = s.h;
		// the slab runs under the unit's own walls so doorways always have a threshold
		c.fill(-1, 0, -1, w, 0, d, style.floor);
		c.clear(0, 1, 0, w - 1, h - 1, d - 1);
		c.fill(0, h, 0, w - 1, h, d - 1, ceiling);
		c.fill(-1, 1, -1, w, h, -1, s.shellWall);
		c.fill(-1, 1, -1, -1, h, d, s.extLeft ? s.facade.lining() : s.shellWall);
		c.fill(w, 1, -1, w, h, d, s.extRight ? s.facade.lining() : s.shellWall);
	}

	private void partition(int x1, int z1, int x2, int z2) {
		partition(c, x1, z1, x2, z2, 1, s.h);
	}

	private void partition(Canvas canvas, int x1, int z1, int x2, int z2, int y1, int y2) {
		canvas.fill(x1, y1, z1, x2, y2, z2, style.wall);
	}

	private Room addRoom(Kind kind, int x0, int z0, int x1, int z1) {
		return addRoom(kind, x0, z0, x1, z1, c, s.h);
	}

	private Room addRoom(Kind kind, int x0, int z0, int x1, int z1, Canvas canvas, int h) {
		Room r = new Room(kind, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), canvas, h);
		rooms.add(r);
		return r;
	}

	/** Interior door in wall cell (x, z); {@code into} is the direction of travel into the room it serves. */
	private void interiorDoor(Canvas canvas, int x, int z, Direction into, double openChance) {
		DoorHingeSide hinge = rs.nextBoolean() ? DoorHingeSide.LEFT : DoorHingeSide.RIGHT;
		canvas.door(x, 1, z, style.door, into, hinge, rs.nextDouble() < openChance);
	}

	private void interiorDoor(int x, int z, Direction into, double openChance) {
		interiorDoor(c, x, z, into, openChance);
	}

	// ================================================================================== banded plans
	private void banded() {
		int w = s.w;
		int d = s.d;
		df = d >= 12 ? 5 : 4;
		shell(ModBlocks.CEILING_FINISH);
		int left = 0;
		int right = 0;
		Role roleLeft = null;
		Role roleRight = null;
		switch (s.type) {
			case ONE_BED -> {
				int side = Mth.clamp(w - 8, 5, 7);
				Role role = plan.nextBoolean() ? Role.HALL_BATH : Role.ENSUITE_LAUNDRY;
				if (plan.nextBoolean()) {
					left = side;
					roleLeft = role;
				} else {
					right = side;
					roleRight = role;
				}
			}
			case TWO_BED, PENTHOUSE -> {
				int total = w - 2;
				int a;
				int b;
				if (s.type == Type.PENTHOUSE) {
					a = w >= 25 ? 7 : 6;
					b = 6;
				} else {
					int wl = Math.max(6, Math.min(total - 10, 7));
					int extra = total - wl - 12;
					if (extra > 0) {
						wl += extra;
					}
					int rest = total - wl;
					a = (rest + 1) / 2;
					b = rest / 2;
				}
				boolean primaryLeft = plan.nextBoolean();
				left = primaryLeft ? a : b;
				right = primaryLeft ? b : a;
				roleLeft = primaryLeft ? Role.PRIMARY : Role.SECONDARY;
				roleRight = primaryLeft ? Role.SECONDARY : Role.PRIMARY;
			}
			default -> {
			}
		}
		int lx0 = left > 0 ? left + 1 : 0;
		int lx1 = right > 0 ? w - right - 2 : w - 1;
		if (left > 0) {
			partition(left, 0, left, d - 1);
			sideColumn(0, left - 1, left, roleLeft);
		}
		if (right > 0) {
			partition(w - right - 1, 0, w - right - 1, d - 1);
			sideColumn(w - right, w - 1, w - right - 1, roleRight);
		}
		// carve a den (penthouse) or the bathroom (studio) out of the living column's front band
		int kx0 = lx0;
		int kx1 = lx1;
		int[] carved = null;
		if (s.type == Type.PENTHOUSE && lx1 - lx0 + 1 >= 10) {
			carved = carve(Kind.DEN, lx0, lx1, 4, 0.7);
		} else if (s.type == Type.STUDIO) {
			carved = carve(Kind.BATH, lx0, lx1, w >= 10 ? 4 : 3, 0.5);
		}
		if (carved != null) {
			if (carved[0] == lx0) {
				kx0 = carved[1] + 2;
			} else {
				kx1 = carved[0] - 2;
			}
		}
		Room living = addRoom(Kind.LIVING, lx0, 0, lx1, d - 1);
		doorX = plan.nextBoolean() ? kx0 : kx1;
		if (s.type != Type.STUDIO && kx1 - kx0 >= 4 && plan.nextInt(3) == 0) {
			doorX = (kx0 + kx1) / 2;
		}
		planWindows();
		exterior();
		entry();
		floors();
		for (Room r : rooms) {
			r.grid = new RoomGrid(r.canvas, style, r.x0, r.z0, r.x1, r.z1, r.h);
		}
		if (carved != null) {
			living.grid.block(carved[0] - 1, 0, carved[1] + 1, df);
		}
		for (Room r : rooms) {
			r.grid.detectEntrances();
		}
		hasLaundry = rooms.stream().anyMatch(r -> r.kind == Kind.LAUNDRY);
		for (Room r : rooms) {
			if (r != living) {
				furnish(r);
			}
		}
		furnishLiving(living, kx0, kx1, lx0, lx1, carved);
		finish();
	}

	/**
	 * Carves a room of width {@code width} out of one end of the living column's front band (walls on its
	 * open sides, a door to the living room). Returns its x range.
	 */
	private int[] carve(Kind kind, int lx0, int lx1, int width, double openChance) {
		boolean atLeft = plan.nextBoolean();
		int x0 = atLeft ? lx0 : lx1 - width + 1;
		int x1 = atLeft ? lx0 + width - 1 : lx1;
		int wallX = atLeft ? x1 + 1 : x0 - 1;
		partition(wallX, 0, wallX, df);
		partition(x0, df, x1, df);
		addRoom(kind, x0, 0, x1, df - 1);
		if (plan.nextBoolean()) {
			interiorDoor(wallX, df - 1, atLeft ? Direction.WEST : Direction.EAST, openChance);
		} else {
			interiorDoor((x0 + x1 + (atLeft ? 1 : 0)) / 2, df, Direction.NORTH, openChance);
		}
		return new int[] {x0, x1};
	}

	/** A bedroom column beside the living room: bedroom at the back, bath/closets in the front band. */
	private void sideColumn(int x0, int x1, int wallX, Role role) {
		int d = s.d;
		boolean livingHigh = wallX > x1;
		Direction awayFromLiving = livingHigh ? Direction.WEST : Direction.EAST;
		int ws = x1 - x0 + 1;
		partition(x0, df, x1, df);
		Kind bedKind = Kind.PRIMARY;
		if (role == Role.SECONDARY) {
			bedKind = s.theme == InteriorStyle.Theme.FAMILY && plan.nextInt(3) > 0 ? Kind.KIDS : Kind.BEDROOM;
		}
		addRoom(bedKind, x0, df + 1, x1, d - 1);
		interiorDoor(wallX, df + 1, awayFromLiving, 0.6);
		Kind inner;
		Kind outer;
		int innerW;
		switch (role) {
			case PRIMARY -> {
				boolean swap = ws >= 6 && plan.nextBoolean();
				inner = swap ? Kind.ENSUITE : Kind.WIC;
				outer = swap ? Kind.WIC : Kind.ENSUITE;
				innerW = swap ? 3 : Math.min(2, ws - 4);
			}
			case SECONDARY, HALL_BATH -> {
				inner = Kind.BATH;
				outer = Kind.WIC;
				innerW = 3;
			}
			default -> {
				inner = Kind.LAUNDRY;
				outer = Kind.ENSUITE;
				innerW = Math.min(2, ws - 4);
			}
		}
		int outerW = ws - innerW - 1;
		int ix0 = livingHigh ? x1 - innerW + 1 : x0;
		int ix1 = livingHigh ? x1 : x0 + innerW - 1;
		int splitX = livingHigh ? ix0 - 1 : ix1 + 1;
		partition(splitX, 0, splitX, df - 1);
		addRoom(inner, ix0, 0, ix1, df - 1);
		if (inner == Kind.BATH || inner == Kind.LAUNDRY) {
			interiorDoor(wallX, df - 1, awayFromLiving, 0.5);
		} else {
			interiorDoor(livingHigh ? ix1 : ix0, df, Direction.NORTH, 0.5);
		}
		if (outerW > 0) {
			int ox0 = livingHigh ? x0 : splitX + 1;
			int ox1 = livingHigh ? splitX - 1 : x1;
			addRoom(outer, ox0, 0, ox1, df - 1);
			interiorDoor(livingHigh ? ox1 : ox0, df, Direction.NORTH, 0.4);
		}
	}

	// ================================================================================== windows
	private void planWindows() {
		int d = s.d;
		for (Room r : rooms) {
			if (r.z1 == d - 1 && r.canvas == c) {
				backWindows(r);
			}
		}
		if (s.extLeft) {
			sideWindows(leftWall, 0);
		}
		if (s.extRight) {
			sideWindows(rightWall, s.w - 1);
		}
	}

	private void backWindows(Room r) {
		int len = r.x1 - r.x0 + 1;
		boolean balcony = r.kind == Kind.LIVING && s.balcony != null && len >= 3;
		if (s.facade.fullGlass()) {
			for (int x = r.x0; x <= r.x1; x++) {
				back[x] = 'G';
			}
		} else if (s.type == Type.STUDIO && len >= 8) {
			int half = len / 2;
			window(back, r.x0, r.x0 + half - 1, 3);
			window(back, r.x0 + half, r.x1, 4);
		} else {
			window(back, r.x0, r.x1, r.kind == Kind.LIVING ? 6 : 4);
		}
		if (balcony) {
			int mid = r.x0 + (len - 1) / 2;
			back[mid] = 'D';
			if (len >= 5) {
				back[mid + 1] = 'D';
			}
			balconyX0 = r.x0;
			balconyX1 = r.x1;
		}
	}

	/** Centred window run of at most {@code max} cells over the range a..b. */
	private static void window(char[] pattern, int a, int b, int max) {
		int len = b - a + 1;
		int margin = len >= 8 ? 2 : 1;
		int n = Math.max(1, Math.min(len - 2 * margin, max));
		int start = a + (len - n) / 2;
		for (int i = 0; i < n; i++) {
			pattern[start + i] = 'G';
		}
	}

	private void sideWindows(char[] pattern, int x) {
		for (Room r : rooms) {
			if (x < r.x0 || x > r.x1 || r.canvas != c) {
				continue;
			}
			switch (r.kind) {
				case BATH, ENSUITE, POWDER -> pattern[(r.z0 + r.z1) / 2] = 'F';
				case WIC, LAUNDRY -> {
				}
				case LIVING -> {
					if (s.type != Type.LOFT && df >= 4) {
						pattern[1] = 'G';
						pattern[2] = 'G';
					}
					int z0 = s.type == Type.LOFT ? r.z0 : df + 1;
					if (s.facade.fullGlass()) {
						for (int z = z0; z <= r.z1; z++) {
							pattern[z] = 'G';
						}
					} else {
						window(pattern, z0, r.z1, 5);
					}
				}
				default -> {
					if (s.facade.fullGlass()) {
						for (int z = r.z0; z <= r.z1; z++) {
							pattern[z] = 'G';
						}
					} else {
						window(pattern, r.z0, r.z1, 3);
					}
				}
			}
		}
	}

	private void exterior() {
		int w = s.w;
		int d = s.d;
		List<int[]> backCells = new ArrayList<>();
		char[] backPattern = new char[w + 2];
		for (int x = -1; x <= w; x++) {
			backCells.add(new int[] {x, d});
			backPattern[x + 1] = x < 0 || x >= w ? 'S' : back[x];
		}
		exteriorWall(backCells, Direction.SOUTH, backPattern);
		if (s.extLeft) {
			List<int[]> cells = new ArrayList<>();
			for (int z = 0; z < d; z++) {
				cells.add(new int[] {-1, z});
			}
			exteriorWall(cells, Direction.WEST, leftWall);
			corner(-2, d);
			corner(-2, d + 1);
		}
		if (s.extRight) {
			List<int[]> cells = new ArrayList<>();
			for (int z = 0; z < d; z++) {
				cells.add(new int[] {w, z});
			}
			exteriorWall(cells, Direction.EAST, rightWall);
			corner(w + 1, d);
			corner(w + 1, d + 1);
		}
		if (balconyX0 >= 0) {
			balcony();
		}
	}

	private void corner(int x, int z) {
		Facade f = s.facade;
		c.set(x, 0, z, f.spandrel());
		c.fill(x, 1, z, x, s.h - 1, z, f.outer());
		c.set(x, s.h, z, f.spandrel());
	}

	private void exteriorWall(List<int[]> cells, Direction out, char[] pattern) {
		glaze(c, s.facade, s.h, cells, out, pattern, style.floor);
	}

	/**
	 * Two-layer exterior wall: lining at each cell, facade one step towards {@code out}. Pattern per cell:
	 * 'S' solid, 'G' glass, 'F' frosted glass, 'D' patio door (double doors where two are adjacent).
	 */
	public static void glaze(Canvas c, Facade f, int h, List<int[]> cells, Direction out, char[] pattern, Block nicheFloor) {
		int lo = f.style() == WindowStyle.TALL || h <= 3 ? 1 : 2;
		int hi = h - 1;
		int frostedLo = h <= 3 ? 1 : 2;
		Block frosted = ModBlocks.get("frosted_glass");
		int run = 0;
		for (int i = 0; i < cells.size(); i++) {
			int x = cells.get(i)[0];
			int z = cells.get(i)[1];
			int ox = x + out.getStepX();
			int oz = z + out.getStepZ();
			char t = pattern[i];
			run = t == 'G' ? run + 1 : 0;
			int runLength = 0;
			if (t == 'G') {
				int j = i;
				while (j < cells.size() && pattern[j] == 'G') {
					j++;
				}
				int k = i;
				while (k >= 0 && pattern[k] == 'G') {
					k--;
				}
				runLength = j - k - 1;
			}
			boolean mullion = t == 'G' && f.mullion() != null && f.mullionEvery() > 0 && runLength > f.mullionEvery() + 1
				&& run % (f.mullionEvery() + 1) == 0 && i + 1 < cells.size() && pattern[i + 1] == 'G';
			c.set(x, 0, z, nicheFloor);
			c.set(ox, 0, oz, f.spandrel());
			c.set(x, h, z, f.lining());
			c.set(ox, h, oz, f.spandrel());
			for (int y = 1; y < h; y++) {
				Block lining = f.lining();
				Block outer = f.outer();
				switch (t) {
					case 'G' -> {
						if (y >= lo && y <= hi) {
							Block pane = mullion ? f.mullion() : f.glass();
							lining = f.glassOuter() ? null : pane;
							outer = f.glassOuter() ? pane : null;
						}
					}
					case 'F' -> {
						if (y >= frostedLo && y <= hi) {
							lining = f.glassOuter() ? null : frosted;
							outer = f.glassOuter() ? frosted : null;
						}
					}
					case 'D' -> {
						if (y <= 2) {
							lining = null;
							outer = null;
						} else if (f.style() == WindowStyle.TALL) {
							lining = null;
							outer = f.glass();
						}
					}
					default -> {
					}
				}
				c.set(x, y, z, lining == null ? Canvas.AIR : lining.defaultBlockState());
				c.set(ox, y, oz, outer == null ? Canvas.AIR : outer.defaultBlockState());
			}
			if (t == 'D') {
				boolean leftOfPair = i + 1 < cells.size() && pattern[i + 1] == 'D';
				boolean rightOfPair = i > 0 && pattern[i - 1] == 'D';
				Block door = ModBlocks.DOORS.get(ModBlocks.DoorStyle.PATIO);
				// double doors hinge on their outer edges; facing = out, whose left is out.getCounterClockWise()
				Direction along = Direction.fromAxisAndDirection(out.getClockWise().getAxis(),
					Direction.AxisDirection.POSITIVE);
				boolean towardsLeftOfFacing = along == out.getCounterClockWise();
				DoorHingeSide hinge;
				if (leftOfPair) {
					hinge = towardsLeftOfFacing ? DoorHingeSide.RIGHT : DoorHingeSide.LEFT;
				} else if (rightOfPair) {
					hinge = towardsLeftOfFacing ? DoorHingeSide.LEFT : DoorHingeSide.RIGHT;
				} else {
					hinge = DoorHingeSide.LEFT;
				}
				c.door(ox, 1, oz, door, out, hinge, false);
			}
		}
	}

	private void balcony() {
		UnitBuilder.Balcony b = s.balcony;
		int d = s.d;
		int x0 = balconyX0;
		int x1 = balconyX1;
		int z0 = d + 2;
		int z1 = d + 1 + b.depth();
		c.fill(x0 - 1, 0, z0, x1 + 1, 0, z1 + 1, b.floor());
		c.clear(x0 - 1, 1, z0, x1 + 1, s.h, z1 + 1);
		for (int x = x0 - 1; x <= x1 + 1; x++) {
			c.set(x, 1, z1 + 1, b.railing());
		}
		for (int z = z0; z <= z1; z++) {
			c.set(x0 - 1, 1, z, b.railing());
			c.set(x1 + 1, 1, z, b.railing());
		}
		c.put(x0 - 1, 2, z0, ModBlocks.WALL_SCONCE, Direction.SOUTH);
		if (b.depth() >= 2) {
			Furnish.balcony(c, rs, x0, z0, x1, z1, Direction.SOUTH, s.type == Type.PENTHOUSE);
		}
	}

	// ================================================================================== entry, floors
	private void entry() {
		c.door(doorX, 1, -1, s.entryDoor, Direction.SOUTH, rs.nextBoolean() ? DoorHingeSide.LEFT : DoorHingeSide.RIGHT, false);
		c.init(doorX, 1, -1, Inits.doorLabel("Unit " + s.number));
		c.put(doorX, 1, -2, ModBlocks.DOORMAT, Direction.NORTH);
		c.wallSign(doorX + 1, 2, -2, s.numberSign, Direction.NORTH, Inits.sign(s.signColor, s.signGlow, false, "", s.number, "", ""));
	}

	private void floors() {
		for (Room r : rooms) {
			Block floor = r.kind.wet() ? style.bathFloor : style.floor;
			r.canvas.fill(r.x0, 0, r.z0, r.x1, 0, r.z1, floor);
		}
	}

	// ================================================================================== furnishing
	private void furnish(Room r) {
		RoomGrid g = r.grid;
		switch (r.kind) {
			case PRIMARY, LOFT_BED -> Furnish.bedroom(g, true, false);
			case BEDROOM -> Furnish.bedroom(g, false, false);
			case KIDS -> Furnish.bedroom(g, false, true);
			case ENSUITE -> Furnish.bathroom(g, true, !hasLaundry && rooms.stream().noneMatch(o -> o.kind == Kind.BATH));
			case BATH -> Furnish.bathroom(g, false, !hasLaundry && s.type != Type.STUDIO);
			case POWDER -> Furnish.powder(g);
			case WIC -> Furnish.closet(g);
			case LAUNDRY -> Furnish.laundry(g);
			case DEN -> Furnish.office(g);
			default -> {
			}
		}
	}

	/**
	 * Living column: entry corner, kitchen along the corridor wall (or a side wall), island or dining
	 * table, then the living area by the windows. Studios also get a sleeping corner.
	 */
	private void furnishLiving(Room r, int kx0, int kx1, int lx0, int lx1, int @Nullable [] carved) {
		RoomGrid g = r.grid;
		int d = s.d;
		Furnish.entry(g, new Zone(Math.max(kx0, doorX - 1), 0, Math.min(kx1, doorX + 1), 1));
		boolean islandOk = kx1 - kx0 + 1 >= 6 && df >= 4;
		List<int[]> run = List.of();
		Direction runWall = Direction.NORTH;
		if (plan.nextInt(3) == 0 && s.type != Type.STUDIO) {
			// kitchen along a solid side wall of the front band
			for (Direction side : plan.nextBoolean() ? new Direction[] {Direction.EAST, Direction.WEST}
				: new Direction[] {Direction.WEST, Direction.EAST}) {
				int x = side == Direction.EAST ? lx1 : lx0;
				if (x < kx0 || x > kx1) {
					continue;
				}
				List<int[]> cells = new ArrayList<>();
				for (int z = 0; z < df; z++) {
					cells.add(new int[] {x, z});
				}
				run = Furnish.kitchenRun(g, side, cells);
				if (run.size() >= 3) {
					runWall = side;
					break;
				}
			}
		}
		if (run.size() < 3) {
			List<int[]> lo = new ArrayList<>();
			List<int[]> hi = new ArrayList<>();
			for (int[] p : g.side(Direction.NORTH)) {
				if (p[0] >= kx0 && p[0] <= kx1 && p[0] != doorX) {
					(p[0] < doorX ? lo : hi).add(p);
				}
			}
			List<int[]> seg = lo.size() >= hi.size() ? lo : hi;
			if (seg == lo && !lo.isEmpty()) {
				java.util.Collections.reverse(lo);
			}
			if (seg.size() >= 6) {
				seg = seg.subList(1, seg.size());
			}
			run = Furnish.kitchenRun(g, Direction.NORTH, new ArrayList<>(seg));
			runWall = Direction.NORTH;
		}
		boolean island = false;
		if (islandOk && run.size() >= 4 && (s.type == Type.PENTHOUSE || plan.nextBoolean())) {
			island = Furnish.island(g, runWall, run, run.size() >= 6 ? 3 : 2);
		}
		int rows = d - df;
		int livingStart = df;
		int lw = lx1 - lx0 + 1;
		Zone livingZone;
		if (s.type == Type.STUDIO) {
			// sleeping corner on the bathroom side, living on the other
			boolean bathLeft = carved != null && carved[0] == lx0;
			int split = lx0 + lw / 2;
			Zone sleep = bathLeft ? new Zone(lx0, df, split - 1, d - 1) : new Zone(split, df, lx1, d - 1);
			livingZone = bathLeft ? new Zone(split, df, lx1, d - 1) : new Zone(lx0, df, split - 1, d - 1);
			Furnish.bedroom(g, sleep, false, false);
			if (!island) {
				Furnish.dining(g, new Zone(kx0, 2, kx1, df), 1);
			}
		} else if (lw >= 10) {
			// wide living column: dining beside the lounge
			boolean diningLeft = plan.nextBoolean();
			int split = lx0 + lw / 2;
			Zone dining = diningLeft ? new Zone(lx0, livingStart, split - 1, d - 1) : new Zone(split, livingStart, lx1, d - 1);
			livingZone = diningLeft ? new Zone(split, livingStart, lx1, d - 1) : new Zone(lx0, livingStart, split - 1, d - 1);
			Furnish.dining(g, dining, 3);
		} else if (rows >= 8) {
			Furnish.dining(g, new Zone(lx0, livingStart, lx1, livingStart + 2), 2);
			livingZone = new Zone(lx0, livingStart + 3, lx1, d - 1);
		} else {
			if (!island) {
				Furnish.dining(g, new Zone(kx0, 2, kx1, df), 2);
			}
			livingZone = new Zone(lx0, livingStart, lx1, d - 1);
		}
		Furnish.living(g, livingZone);
	}

	private void finish() {
		for (Room r : rooms) {
			Furnish.windowsAndSwitches(r.grid);
			boolean fan = style.ceilingFan && (r.kind == Kind.LIVING || r.kind == Kind.PRIMARY || r.kind == Kind.LOFT_BED);
			Furnish.ceilingLights(r.grid, fan);
			int[] p = r.grid.centre();
			if (r.kind == Kind.LIVING) {
				r.canvas.marker("unit", p[0], 1, p[1], s.number);
			} else {
				r.canvas.marker("room", p[0], 1, p[1], s.number + " " + r.kind.label);
			}
		}
	}

	// ================================================================================== lofts
	/**
	 * Double-height loft: kitchen and bathroom under a mezzanine bedroom at the corridor side, a stair
	 * along one wall, and a double-height living space in front of tall factory windows.
	 */
	private void loft() {
		int w = s.w;
		int d = s.d;
		int h = s.h;
		int mzY = 4;
		int md = Mth.clamp(d * 3 / 8, 5, 7);
		df = md;
		shell(ModBlocks.CEILING_FINISH_WOOD);
		// exposed steel beams across the ceiling
		for (int z = 2; z < d; z += 4) {
			for (int x = 0; x < w; x++) {
				c.set(x, h, z, ModBlocks.STEEL_BEAM.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
			}
		}
		boolean bathLeft = plan.nextBoolean();
		int bw = 4;
		int bx0 = bathLeft ? 0 : w - bw;
		int bx1 = bathLeft ? bw - 1 : w - 1;
		int bWall = bathLeft ? bw : w - bw - 1;
		// lower zone: ceiling under the mezzanine, bathroom walls
		c.fill(0, mzY - 1, 0, w - 1, mzY - 1, md - 1, ModBlocks.CEILING_FINISH);
		c.fill(0, mzY, 0, w - 1, mzY, md - 1, style.floor);
		partition(c, bWall, 0, bWall, md - 1, 1, mzY - 1);
		partition(c, bx0, md - 1, bx1, md - 1, 1, mzY - 1);
		interiorDoor((bx0 + bx1 + (bathLeft ? 1 : 0)) / 2, md - 1, Direction.NORTH, 0.5);
		Room bath = new Room(Kind.BATH, bx0, 0, bx1, md - 2, c, mzY - 1);
		rooms.add(bath);
		// stair along the side wall opposite the bathroom, rising towards the mezzanine
		int sx = bathLeft ? w - 1 : 0;
		Block stair = style.wood == ModBlocks.Wood.WHITE ? Blocks.BIRCH_STAIRS : Blocks.DARK_OAK_STAIRS;
		Block stringer = style.wood == ModBlocks.Wood.WHITE ? ModBlocks.get("hardwood_light") : ModBlocks.get("walnut_cladding");
		for (int k = 0; k < mzY; k++) {
			int z = md + mzY - 1 - k;
			c.stairs(sx, 1 + k, z, stair, Direction.NORTH, false);
			if (k > 0) {
				c.fill(sx, 1, z, sx, k, z, stringer);
			}
		}
		// mezzanine railing (gap where the stair arrives)
		Block railing = ModBlocks.METAL_RAILING;
		for (int x = 0; x < w; x++) {
			if (x != sx) {
				c.set(x, mzY + 1, md - 1, railing);
			}
		}
		Canvas upper = c.translate(0, mzY, 0);
		Room loftBed = new Room(Kind.LOFT_BED, 0, 0, w - 1, md - 1, upper, h - mzY);
		rooms.add(loftBed);
		Room living = addRoom(Kind.LIVING, 0, 0, w - 1, d - 1);
		int kx0 = bathLeft ? bWall + 1 : 0;
		int kx1 = bathLeft ? w - 1 : bWall - 1;
		doorX = bathLeft ? kx0 : kx1;
		if (plan.nextBoolean()) {
			doorX = (kx0 + kx1) / 2;
		}
		// tall factory windows across the back, a Juliet balcony door in the middle
		for (int x = 1; x < w - 1; x++) {
			back[x] = (x - 1) % 4 == 3 ? 'S' : 'G';
		}
		if (back[w - 2] == 'S') {
			back[w - 2] = 'G';
		}
		if (s.balcony != null) {
			int mid = (w - 1) / 2;
			back[mid] = 'D';
			back[mid + 1] = 'D';
			balconyX0 = mid - 1;
			balconyX1 = mid + 2;
		}
		if (s.extLeft || s.extRight) {
			char[] pattern = s.extLeft ? leftWall : rightWall;
			for (int z = md + 1; z < d - 1; z++) {
				pattern[z] = (z - md - 1) % 4 == 3 ? 'S' : 'G';
			}
			if (s.extLeft && s.extRight) {
				System.arraycopy(leftWall, 0, rightWall, 0, d);
			}
		}
		exterior();
		entry();
		c.fill(bx0, 0, 0, bx1, 0, md - 2, style.bathFloor);
		for (Room r : rooms) {
			r.grid = new RoomGrid(r.canvas, style, r.x0, r.z0, r.x1, r.z1, r.h);
		}
		RoomGrid lg = living.grid;
		lg.block(Math.min(bx0, bWall), 0, Math.max(bx1, bWall), md - 1);
		lg.block(sx, md, sx, md + mzY - 1);
		lg.setCeiling(0, 0, w - 1, md - 1, mzY - 1);
		lg.keep(sx, md + mzY);
		RoomGrid bg = loftBed.grid;
		bg.block(0, md - 1, w - 1, md - 1);
		for (Room r : rooms) {
			r.grid.detectEntrances();
		}
		// the stair arrival is the bedroom's way in, the stair foot the living room's
		bg.entrance(sx, md - 2);
		lg.entrance(sx, md + mzY);
		hasLaundry = false;
		furnish(bath);
		furnish(loftBed);
		// kitchen under the mezzanine, dining and lounge in the double-height space
		Furnish.entry(lg, new Zone(Math.max(kx0, doorX - 1), 0, Math.min(kx1, doorX + 1), 1));
		List<int[]> lo = new ArrayList<>();
		List<int[]> hi = new ArrayList<>();
		for (int[] p : lg.side(Direction.NORTH)) {
			if (p[0] >= kx0 && p[0] <= kx1 && p[0] != doorX) {
				(p[0] < doorX ? lo : hi).add(p);
			}
		}
		List<int[]> seg = lo.size() >= hi.size() ? lo : hi;
		if (seg == lo) {
			java.util.Collections.reverse(lo);
		}
		List<int[]> run = Furnish.kitchenRun(lg, Direction.NORTH, new ArrayList<>(seg));
		if (run.size() < 4 || !Furnish.island(lg, Direction.NORTH, run, Math.min(3, run.size() - 2))) {
			Furnish.dining(lg, new Zone(kx0, 2, kx1, md - 1), 2);
		}
		int livingRows = d - md;
		if (livingRows >= 8) {
			Furnish.dining(lg, new Zone(0, md, w - 1, md + 3), 3);
			Furnish.living(lg, new Zone(0, md + 4, w - 1, d - 1));
		} else {
			Furnish.living(lg, new Zone(0, md, w - 1, d - 1));
		}
		finish();
	}
}
