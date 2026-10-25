package com.modernapartments.build.validation;

import com.modernapartments.block.CeilingLampBlock;
import com.modernapartments.block.DecorBlock;
import com.modernapartments.block.ElevatorBlock;
import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.TallFurnitureBlock;
import com.modernapartments.block.TwoPartFurnitureBlock;
import com.modernapartments.build.BlockBuffer;
import it.unimi.dsi.fastutil.longs.LongArrayFIFOQueue;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Proves a generated building is fully explorable: a breadth-first search over standing positions
 * (using real collision shapes, stairs, doors and elevator links, with at most a 0.6-block step and
 * 1.8 blocks of headroom) must reach every unit, room and amenity marker from the entrance. Also flags
 * half-placed multi-block furniture and floating objects.
 */
public final class ReachabilityValidator {
	private static final double STEP = 0.6;
	private static final double BODY = 1.8;

	public record Report(int nodesVisited, int markersChecked, List<String> unreachable, List<String> warnings) {
		public boolean ok() {
			return unreachable.isEmpty() && warnings.isEmpty();
		}
	}

	private final BlockBuffer buf;
	private final float[] minY;
	private final float[] maxY;
	private final byte[] kind; // 0 none, 1 solid, 2 passable door, 3 stair(bottom), 4 elevator floor

	private ReachabilityValidator(BlockBuffer buf) {
		this.buf = buf;
		int n = buf.volume();
		this.minY = new float[n];
		this.maxY = new float[n];
		this.kind = new byte[n];
		for (int y = 0; y < buf.sizeY; y++) {
			for (int z = 0; z < buf.sizeZ; z++) {
				for (int x = 0; x < buf.sizeX; x++) {
					int i = buf.index(x, y, z);
					BlockState s = buf.get(i);
					if (s == null || s.isAir()) {
						continue;
					}
					if (s.getBlock() instanceof DoorBlock || s.getBlock() instanceof ElevatorDoorBlock || s.getBlock() instanceof FenceGateBlock) {
						kind[i] = 2;
						continue;
					}
					VoxelShape shape = s.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
					if (shape.isEmpty() || huggesFace(shape)) {
						continue;
					}
					minY[i] = (float) shape.min(Direction.Axis.Y);
					maxY[i] = (float) shape.max(Direction.Axis.Y);
					kind[i] = 1;
					if (s.getBlock() instanceof StairBlock && s.getValue(StairBlock.HALF) == Half.BOTTOM) {
						kind[i] = 3;
					} else if (s.getBlock() instanceof ElevatorBlock) {
						kind[i] = 4;
					}
				}
			}
		}
	}

	/**
	 * Thin shapes flat against one side of the cell (switches, thermostats, wall art, TVs) leave room for a
	 * player to stand in the cell, so they neither block nor offer a surface.
	 */
	private static boolean huggesFace(VoxelShape shape) {
		net.minecraft.world.phys.AABB b = shape.bounds();
		boolean thinX = b.getXsize() <= 0.25 && (b.minX <= 0.001 || b.maxX >= 0.999);
		boolean thinZ = b.getZsize() <= 0.25 && (b.minZ <= 0.001 || b.maxZ >= 0.999);
		return thinX || thinZ;
	}

	public static Report validate(BlockBuffer buf) {
		return new ReachabilityValidator(buf).run();
	}

	private Report run() {
		LongOpenHashSet visited = new LongOpenHashSet();
		LongArrayFIFOQueue queue = new LongArrayFIFOQueue();
		List<String> unreachable = new ArrayList<>();
		List<String> warnings = new ArrayList<>();
		List<BlockBuffer.Marker> entrances = buf.markers("entrance");
		if (entrances.isEmpty()) {
			warnings.add("no entrance marker");
		}
		for (BlockBuffer.Marker m : entrances) {
			double s = standHeight(m.pos().getX(), m.pos().getY(), m.pos().getZ());
			if (Double.isNaN(s)) {
				warnings.add("entrance marker not standable at " + m.pos());
				continue;
			}
			enqueue(visited, queue, m.pos().getX(), s, m.pos().getZ());
		}
		while (!queue.isEmpty()) {
			long node = queue.dequeueLong();
			int x = nodeX(node);
			int z = nodeZ(node);
			double s = nodeS(node);
			for (Direction d : Direction.Plane.HORIZONTAL) {
				int nx = x + d.getStepX();
				int nz = z + d.getStepZ();
				if (nx < 0 || nz < 0 || nx >= buf.sizeX || nz >= buf.sizeZ) {
					continue;
				}
				int base = (int) Math.floor(s);
				for (int cy = base - 1; cy <= base + 1; cy++) {
					for (double ns : surfaces(nx, cy, nz)) {
						if (Math.abs(ns - s) <= STEP + 1e-6 && clear(nx, ns, nz)) {
							enqueue(visited, queue, nx, ns, nz);
						}
					}
				}
			}
			// both standing heights of a stair connect to each other
			int cell = (int) Math.floor(s - 1e-6);
			if (cell >= 0 && cell < buf.sizeY && kind[buf.index(x, cell, z)] == 3) {
				for (double ns : surfaces(x, cell, z)) {
					if (clear(x, ns, z)) {
						enqueue(visited, queue, x, ns, z);
					}
				}
			}
			// elevator rides: every other cab stop in the column
			if (cell >= 0 && cell < buf.sizeY && kind[buf.index(x, cell, z)] == 4) {
				for (int y = 0; y < buf.sizeY; y++) {
					if (y != cell && kind[buf.index(x, y, z)] == 4 && clear(x, y + 1.0, z)) {
						enqueue(visited, queue, x, y + 1.0, z);
					}
				}
			}
		}
		int checked = 0;
		for (BlockBuffer.Marker m : buf.markers()) {
			if (m.type().equals("entrance")) {
				continue;
			}
			checked++;
			if (!reached(visited, m.pos())) {
				unreachable.add(m.type() + " " + m.label() + " at " + m.pos());
			}
		}
		structuralChecks(warnings);
		return new Report(visited.size(), checked, unreachable, warnings);
	}

	private boolean reached(LongOpenHashSet visited, BlockPos pos) {
		for (int sixteenth = -16; sixteenth <= 8; sixteenth++) {
			double s = pos.getY() + sixteenth / 16.0;
			if (visited.contains(pack(pos.getX(), s, pos.getZ()))) {
				return true;
			}
		}
		return false;
	}

	/** Standing heights offered by the top of the block in cell (x, y, z). */
	private double[] surfaces(int x, int y, int z) {
		if (y < 0 || y >= buf.sizeY) {
			return new double[0];
		}
		int i = buf.index(x, y, z);
		return switch (kind[i]) {
			case 1, 4 -> new double[] {y + maxY[i]};
			case 3 -> new double[] {y + 0.5, y + 1.0};
			default -> new double[0];
		};
	}

	private double standHeight(int x, int feetY, int z) {
		for (int cy = feetY; cy >= feetY - 1; cy--) {
			for (double s : surfaces(x, cy, z)) {
				if (s <= feetY + 0.6 && s >= feetY - 0.6 && clear(x, s, z)) {
					return s;
				}
			}
		}
		return Double.NaN;
	}

	/** True if a player standing at height s in column (x, z) has room for their body. */
	private boolean clear(int x, double s, int z) {
		double top = s + BODY;
		for (int y = (int) Math.floor(s); y <= (int) Math.floor(top - 1e-6); y++) {
			if (y < 0) {
				continue;
			}
			if (y >= buf.sizeY) {
				return true;
			}
			int i = buf.index(x, y, z);
			byte k = kind[i];
			if (k == 0 || k == 2) {
				continue;
			}
			// standing on the lower step of a stair: the upper step is beside the player, not above
			if (k == 3 && y == (int) Math.floor(s) && s - y >= 0.5 - 1e-6) {
				continue;
			}
			double lo = y + minY[i];
			double hi = y + maxY[i];
			if (hi > s + 1e-6 && lo < top - 1e-6) {
				return false;
			}
		}
		return true;
	}

	private void enqueue(LongOpenHashSet visited, LongArrayFIFOQueue queue, int x, double s, int z) {
		long key = pack(x, s, z);
		if (visited.add(key)) {
			queue.enqueue(key);
		}
	}

	private static long pack(int x, double s, int z) {
		long sy = Math.round(s * 16.0) + 4096;
		return ((long) x & 0xFFFFF) | (((long) z & 0xFFFFF) << 20) | ((sy & 0xFFFFFL) << 40);
	}

	private static int nodeX(long key) {
		return (int) (key & 0xFFFFF);
	}

	private static int nodeZ(long key) {
		return (int) ((key >> 20) & 0xFFFFF);
	}

	private static double nodeS(long key) {
		return (((key >> 40) & 0xFFFFF) - 4096) / 16.0;
	}

	private void structuralChecks(List<String> warnings) {
		int floating = 0;
		for (int y = 1; y < buf.sizeY; y++) {
			for (int z = 0; z < buf.sizeZ; z++) {
				for (int x = 0; x < buf.sizeX; x++) {
					BlockState s = buf.get(x, y, z);
					if (s == null || s.isAir()) {
						continue;
					}
					if (s.getBlock() instanceof DoorBlock && s.getValue(DoorBlock.HALF) == DoubleBlockHalf.LOWER) {
						BlockState up = buf.get(x, y + 1, z);
						if (up == null || !up.is(s.getBlock())) {
							warnings.add("door missing upper half at " + x + " " + y + " " + z);
						}
					} else if (s.getBlock() instanceof TallFurnitureBlock && s.getValue(TallFurnitureBlock.HALF) == DoubleBlockHalf.LOWER) {
						BlockState up = buf.get(x, y + 1, z);
						if (up == null || !up.is(s.getBlock())) {
							warnings.add("tall furniture missing upper half at " + x + " " + y + " " + z);
						}
					} else if (s.getBlock() instanceof TwoPartFurnitureBlock && s.getValue(TwoPartFurnitureBlock.PART) == BedPart.FOOT) {
						Direction f = s.getValue(TwoPartFurnitureBlock.FACING);
						BlockState head = buf.get(x + f.getStepX(), y, z + f.getStepZ());
						if (head == null || !head.is(s.getBlock())) {
							warnings.add("two-part furniture missing head at " + x + " " + y + " " + z);
						}
					} else if (s.getBlock() instanceof BedBlock && s.getValue(BedBlock.PART) == BedPart.FOOT) {
						Direction f = s.getValue(BedBlock.FACING);
						BlockState head = buf.get(x + f.getStepX(), y, z + f.getStepZ());
						if (head == null || !head.is(s.getBlock())) {
							warnings.add("bed missing head at " + x + " " + y + " " + z);
						}
					}
					boolean needsSupport = (s.getBlock() instanceof FurnitureBlock f && !f.isWallMounted())
						|| (s.getBlock() instanceof DecorBlock && !(s.getBlock() instanceof CeilingLampBlock) && !isCeilingDecor(s));
					if (needsSupport && !isCeilingDecor(s) && !(s.getBlock() instanceof TallFurnitureBlock && s.getValue(TallFurnitureBlock.HALF) == DoubleBlockHalf.UPPER)) {
						BlockState below = buf.get(x, y - 1, z);
						if (below == null || below.isAir()) {
							floating++;
							if (floating <= 10) {
								warnings.add("floating " + s.getBlock().getName().getString() + " at " + x + " " + y + " " + z);
							}
						}
					}
				}
			}
		}
		if (floating > 10) {
			warnings.add("... " + (floating - 10) + " more floating blocks");
		}
	}

	private static boolean isCeilingDecor(BlockState s) {
		String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(s.getBlock()).getPath();
		return id.startsWith("ceiling_") || id.equals("smoke_detector") || id.equals("sprinkler") || id.equals("punching_bag")
			|| id.equals("security_camera_dome") || id.equals("lamp_post") || id.equals("lamp_head") || id.equals("string_lights");
	}
}
