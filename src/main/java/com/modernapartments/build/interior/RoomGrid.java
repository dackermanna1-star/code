package com.modernapartments.build.interior;

import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.build.Canvas;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.IronBarsBlock;
import net.minecraft.world.level.block.TransparentBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Occupancy model of one room (a rectangle in canvas coordinates, optionally with blocked cells).
 * Furnishers plan placements on the grid; block writes are queued and only flushed on commit, so a
 * placement that would cut off access to the door or to another piece can be rolled back.
 */
public final class RoomGrid {
	public enum Edge { WALL, WINDOW, DOOR, OPEN }

	private static final byte FREE = 0;
	private static final byte USED = 1;
	private static final byte KEEP = 2;
	private static final byte BLOCKED = 3;

	public final Canvas c;
	public final InteriorStyle style;
	public final RandomSource random;
	public final int x0;
	public final int z0;
	public final int x1;
	public final int z1;
	/** Interior clear height: floor block at y=0, air y=1..h, ceiling finish at y=h. */
	public final int h;

	private byte[] cells;
	private final boolean[] decor;
	private final byte[] ceilings;
	private final List<Runnable> pending = new ArrayList<>();
	private final List<int[]> entrances = new ArrayList<>();

	public RoomGrid(Canvas c, InteriorStyle style, int x0, int z0, int x1, int z1, int h) {
		this.c = c;
		this.style = style;
		this.random = style.random;
		this.x0 = Math.min(x0, x1);
		this.z0 = Math.min(z0, z1);
		this.x1 = Math.max(x0, x1);
		this.z1 = Math.max(z0, z1);
		this.h = h;
		this.cells = new byte[w() * d()];
		this.decor = new boolean[w() * d() * 4];
		this.ceilings = new byte[w() * d()];
		java.util.Arrays.fill(ceilings, (byte) h);
	}

	/** Height of the ceiling layer above cell (x, z); differs from {@link #h} under mezzanines. */
	public int ceiling(int x, int z) {
		if (x < x0 || x > x1 || z < z0 || z > z1) {
			return h;
		}
		return ceilings[idx(x, z)];
	}

	public void setCeiling(int xa, int za, int xb, int zb, int height) {
		for (int x = Math.max(x0, Math.min(xa, xb)); x <= Math.min(x1, Math.max(xa, xb)); x++) {
			for (int z = Math.max(z0, Math.min(za, zb)); z <= Math.min(z1, Math.max(za, zb)); z++) {
				ceilings[idx(x, z)] = (byte) height;
			}
		}
	}

	public int w() {
		return x1 - x0 + 1;
	}

	public int d() {
		return z1 - z0 + 1;
	}

	public int area() {
		int n = 0;
		for (byte b : cells) {
			if (b != BLOCKED) {
				n++;
			}
		}
		return n;
	}

	public boolean in(int x, int z) {
		return x >= x0 && x <= x1 && z >= z0 && z <= z1 && cells[idx(x, z)] != BLOCKED;
	}

	private int idx(int x, int z) {
		return (z - z0) * w() + (x - x0);
	}

	public boolean free(int x, int z) {
		return in(x, z) && cells[idx(x, z)] == FREE;
	}

	public boolean walkable(int x, int z) {
		return in(x, z) && (cells[idx(x, z)] == FREE || cells[idx(x, z)] == KEEP);
	}

	public void block(int x1, int z1, int x2, int z2) {
		for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
			for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
				if (x >= x0 && x <= this.x1 && z >= z0 && z <= this.z1) {
					cells[idx(x, z)] = BLOCKED;
				}
			}
		}
	}

	public void use(int x, int z) {
		if (in(x, z)) {
			cells[idx(x, z)] = USED;
		}
	}

	/** Marks a cell that must stay walkable (door approach, access to a fixture). */
	public void keep(int x, int z) {
		if (in(x, z) && cells[idx(x, z)] == FREE) {
			cells[idx(x, z)] = KEEP;
		}
	}

	/** Registers a doorway / open connection cell inside the room. */
	public void entrance(int x, int z) {
		if (in(x, z)) {
			entrances.add(new int[] {x, z});
			keep(x, z);
		}
	}

	public List<int[]> entrances() {
		return entrances;
	}

	/** Detects doorways along the room boundary and registers them as entrances (with their approach cell). */
	public void detectEntrances() {
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				if (!in(x, z)) {
					continue;
				}
				for (Direction d : Direction.Plane.HORIZONTAL) {
					if (in(x + d.getStepX(), z + d.getStepZ())) {
						continue;
					}
					if (edge(x, z, d) == Edge.DOOR) {
						entrance(x, z);
						keep(x - d.getStepX(), z - d.getStepZ());
					}
				}
			}
		}
	}

	// ------------------------------------------------------------------ edges
	/** What lies beyond cell (x, z) in direction {@code side} (only meaningful at the room boundary). */
	public Edge edge(int x, int z, Direction side) {
		int wx = x + side.getStepX();
		int wz = z + side.getStepZ();
		if (in(wx, wz)) {
			return Edge.OPEN;
		}
		BlockState low = c.get(wx, 1, wz);
		BlockState mid = c.get(wx, 2, wz);
		if (isDoor(low)) {
			return Edge.DOOR;
		}
		if (isGlass(low) || isGlass(mid)) {
			return Edge.WINDOW;
		}
		boolean lowOpen = low == null || low.isAir();
		boolean midOpen = mid == null || mid.isAir();
		if (midOpen) {
			BlockState beyond = c.get(wx + side.getStepX(), 2, wz + side.getStepZ());
			BlockState beyondLow = c.get(wx + side.getStepX(), 1, wz + side.getStepZ());
			if (isDoor(beyondLow)) {
				return Edge.DOOR;
			}
			if (isGlass(beyond) || isGlass(beyondLow)) {
				return Edge.WINDOW;
			}
			return lowOpen ? Edge.OPEN : Edge.WALL;
		}
		return Edge.WALL;
	}

	private static boolean isDoor(BlockState s) {
		return s != null && (s.getBlock() instanceof DoorBlock || s.getBlock() instanceof ElevatorDoorBlock);
	}

	private static boolean isGlass(BlockState s) {
		return s != null && (s.getBlock() instanceof TransparentBlock || s.getBlock() instanceof IronBarsBlock);
	}

	public boolean wall(int x, int z, Direction side) {
		return in(x, z) && edge(x, z, side) == Edge.WALL;
	}

	public boolean window(int x, int z, Direction side) {
		return in(x, z) && edge(x, z, side) == Edge.WINDOW;
	}

	/** True if the wall-decor slot (y=2) on this wall cell is still available. */
	public boolean decorFree(int x, int z, Direction side) {
		return in(x, z) && !decor[idx(x, z) * 4 + side.get2DDataValue()];
	}

	public void useDecor(int x, int z, Direction side) {
		if (in(x, z)) {
			decor[idx(x, z) * 4 + side.get2DDataValue()] = true;
		}
	}

	/** Boundary cells along one side, in increasing coordinate order. */
	public List<int[]> side(Direction side) {
		List<int[]> out = new ArrayList<>();
		switch (side) {
			case NORTH -> {
				for (int x = x0; x <= x1; x++) out.add(new int[] {x, z0});
			}
			case SOUTH -> {
				for (int x = x0; x <= x1; x++) out.add(new int[] {x, z1});
			}
			case WEST -> {
				for (int z = z0; z <= z1; z++) out.add(new int[] {x0, z});
			}
			default -> {
				for (int z = z0; z <= z1; z++) out.add(new int[] {x1, z});
			}
		}
		return out;
	}

	public int sideLength(Direction side) {
		return side.getAxis() == Direction.Axis.Z ? w() : d();
	}

	// ------------------------------------------------------------------ transactions
	public final class Tx {
		private final byte[] saved;
		private final int pendingSize;

		private Tx() {
			saved = cells.clone();
			pendingSize = pending.size();
		}

		public void rollback() {
			cells = saved;
			while (pending.size() > pendingSize) {
				pending.remove(pending.size() - 1);
			}
		}
	}

	public Tx begin() {
		return new Tx();
	}

	/** Commits if the room is still fully connected, otherwise rolls back. Returns success. */
	public boolean commitIfConnected(Tx tx) {
		if (connected()) {
			return true;
		}
		tx.rollback();
		return false;
	}

	public void write(Runnable op) {
		pending.add(op);
	}

	public void flush() {
		for (Runnable op : pending) {
			op.run();
		}
		pending.clear();
	}

	/**
	 * True if every KEEP cell (including every entrance) can be reached from the first entrance through
	 * walkable cells, i.e. the room is in one piece.
	 */
	public boolean connected() {
		if (entrances.isEmpty()) {
			return true;
		}
		boolean[] seen = new boolean[cells.length];
		ArrayDeque<int[]> queue = new ArrayDeque<>();
		int[] first = entrances.get(0);
		if (walkable(first[0], first[1])) {
			seen[idx(first[0], first[1])] = true;
			queue.add(first);
		}
		while (!queue.isEmpty()) {
			int[] p = queue.poll();
			for (Direction d : Direction.Plane.HORIZONTAL) {
				int nx = p[0] + d.getStepX();
				int nz = p[1] + d.getStepZ();
				if (walkable(nx, nz) && !seen[idx(nx, nz)]) {
					seen[idx(nx, nz)] = true;
					queue.add(new int[] {nx, nz});
				}
			}
		}
		for (int i = 0; i < cells.length; i++) {
			if (cells[i] == KEEP && !seen[i]) {
				return false;
			}
		}
		return true;
	}

	/** Walkable cells reachable from the entrances (all walkable cells when the room has no entrance). */
	public boolean[] reachable() {
		boolean[] seen = new boolean[cells.length];
		ArrayDeque<int[]> queue = new ArrayDeque<>();
		if (!entrances.isEmpty()) {
			int[] first = entrances.get(0);
			if (walkable(first[0], first[1])) {
				seen[idx(first[0], first[1])] = true;
				queue.add(first);
			}
		}
		if (entrances.isEmpty()) {
			for (int x = x0; x <= x1; x++) {
				for (int z = z0; z <= z1; z++) {
					if (walkable(x, z)) {
						seen[idx(x, z)] = true;
					}
				}
			}
		}
		while (!queue.isEmpty()) {
			int[] p = queue.poll();
			for (Direction d : Direction.Plane.HORIZONTAL) {
				int nx = p[0] + d.getStepX();
				int nz = p[1] + d.getStepZ();
				if (walkable(nx, nz) && !seen[idx(nx, nz)]) {
					seen[idx(nx, nz)] = true;
					queue.add(new int[] {nx, nz});
				}
			}
		}
		return seen;
	}

	/** Reachable walkable cell closest to the room centre (used for markers). */
	public int[] centre() {
		int cx = (x0 + x1) / 2;
		int cz = (z0 + z1) / 2;
		boolean[] ok = reachable();
		int[] best = null;
		int bestDist = Integer.MAX_VALUE;
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				if (ok[idx(x, z)]) {
					int dist = Math.abs(x - cx) + Math.abs(z - cz);
					if (dist < bestDist) {
						bestDist = dist;
						best = new int[] {x, z};
					}
				}
			}
		}
		return best == null ? new int[] {cx, cz} : best;
	}
}
