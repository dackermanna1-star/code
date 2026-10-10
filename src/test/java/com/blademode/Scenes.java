package com.blademode;

import com.blademode.cut.CutEngine;
import com.blademode.cut.Slash;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.piece.CellCache;
import com.blademode.piece.CellSource;
import com.blademode.piece.PieceBlock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.IronBarsBlock;
import net.minecraft.world.level.block.WallTorchBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/** Structures and strokes shared by the unit tests; they mirror the scenes of the client gametest. */
public final class Scenes {
	private Scenes() {
	}

	/** The house built by the client gametest: planks shell, log corners, roof, door, windows, torch. */
	public static Map<BlockPos, BlockState> house() {
		Map<BlockPos, BlockState> map = new LinkedHashMap<>();
		for (int x = 20; x <= 26; x++) {
			for (int y = -60; y <= -56; y++) {
				for (int z = 8; z <= 14; z++) {
					if (x == 20 || x == 26 || y == -60 || y == -56 || z == 8 || z == 14) {
						boolean corner = (x == 20 || x == 26) && (z == 8 || z == 14);
						map.put(new BlockPos(x, y, z), corner ? Blocks.OAK_LOG.defaultBlockState() : Blocks.OAK_PLANKS.defaultBlockState());
					}
				}
			}
		}
		for (int x = 19; x <= 27; x++) {
			for (int z = 7; z <= 15; z++) {
				map.put(new BlockPos(x, -55, z), Blocks.STONE_BRICKS.defaultBlockState());
			}
		}
		map.remove(new BlockPos(23, -60, 8));
		map.remove(new BlockPos(23, -59, 8));
		BlockState pane = Blocks.GLASS_PANE.defaultBlockState().setValue(IronBarsBlock.EAST, true).setValue(IronBarsBlock.WEST, true);
		for (int x : new int[]{21, 22, 24, 25}) {
			map.put(new BlockPos(x, -58, 8), pane);
		}
		map.put(new BlockPos(23, -57, 7), Blocks.WALL_TORCH.defaultBlockState().setValue(WallTorchBlock.FACING, Direction.NORTH));
		return map;
	}

	/** The centred, tilted stroke the gametest draws across the house front. */
	public static Slash houseSlash() {
		Slash slash = Slash.of(new Vec3(23.5, -58.38, -1.5), new Vec3(0.6227, 0.1864, 1), new Vec3(-0.6227, -0.1864, 1), 32);
		if (slash == null) {
			throw new IllegalStateException("degenerate stroke");
		}
		return slash;
	}

	/** View ray through a point of the screen (NDC), for a camera with the given yaw and pitch (70° FOV, 16:9). */
	public static Vec3 viewRay(float yaw, float pitch, double nx, double ny) {
		double tanV = Math.tan(Math.toRadians(70) * 0.5);
		double aspect = 16.0 / 9.0;
		Vector3f dir = new Vector3f((float) (nx * tanV * aspect), (float) (ny * tanV), -1.0F).normalize();
		new Quaternionf().rotationYXZ((float) Math.PI - yaw * (float) (Math.PI / 180.0), -pitch * (float) (Math.PI / 180.0), 0.0F).transform(dir);
		return new Vec3(dir.x, dir.y, dir.z);
	}

	/**
	 * A centred stroke from the given camera: the cursor was moved by {@code yawDeg}/{@code pitchDeg}
	 * (degrees, as blade mode accumulates mouse motion) from the crosshair.
	 */
	public static Slash centredStroke(Vec3 eye, float yaw, float pitch, double yawDeg, double pitchDeg) {
		double tanV = Math.tan(Math.toRadians(70) * 0.5);
		double aspect = 16.0 / 9.0;
		double cx = Math.tan(Math.toRadians(yawDeg)) / (tanV * aspect);
		double cy = -Math.tan(Math.toRadians(pitchDeg)) / tanV;
		Slash slash = Slash.of(eye, viewRay(yaw, pitch, -cx, -cy), viewRay(yaw, pitch, cx, cy), 32);
		if (slash == null) {
			throw new IllegalStateException("degenerate stroke");
		}
		return slash;
	}

	/** The part of a structure on the side of {@code plane} that contains {@code keep}, as piece blocks in world coordinates. */
	public static List<PieceBlock> sideOf(Map<BlockPos, BlockState> blocks, Plane plane, Vec3 keep) {
		boolean back = plane.dist(keep.x, keep.y, keep.z) < 0;
		List<PieceBlock> out = new ArrayList<>();
		for (Map.Entry<BlockPos, BlockState> e : blocks.entrySet()) {
			BlockPos p = e.getKey();
			Plane local = plane.translated(p.getX(), p.getY(), p.getZ());
			double min = local.minDist(0, 0, 0, 1, 1, 1);
			double max = local.maxDist(0, 0, 0, 1, 1, 1);
			if (back ? max <= 0 : min >= 0) {
				out.add(new PieceBlock(p, e.getValue(), List.of(), Optional.empty()));
			} else if (back ? min < 0 : max > 0) {
				if (!BlockGeometry.isStructural(e.getValue())) {
					if ((local.dist(0.5, 0.5, 0.5) < 0) == back) {
						out.add(new PieceBlock(p, e.getValue(), List.of(), Optional.empty()));
					}
					continue;
				}
				Plane keepPlane = back ? local : local.flip();
				PartShape part = new PartShape(BlockGeometry.collisionBoxes(e.getValue()), List.of(keepPlane));
				if (part.volume >= CutEngine.MIN_PART_VOLUME) {
					out.add(new PieceBlock(p, e.getValue(), List.of(keepPlane), Optional.empty()));
				}
			}
		}
		return out;
	}

	/** Physics world made of the given blocks (block-local planes kept) on solid ground at and below {@code groundTop}. */
	public static CellSource world(List<PieceBlock> blocks, int groundTop) {
		Map<BlockPos, CellCache.Cell> cells = new HashMap<>();
		for (PieceBlock b : blocks) {
			if (!BlockGeometry.isStructural(b.state())) {
				continue;
			}
			AABB[] boxes = BlockGeometry.collisionBoxes(b.state()).toArray(AABB[]::new);
			boolean full = b.planes().isEmpty() && BlockGeometry.isFullCube(b.state());
			cells.put(b.pos(), full ? CellCache.Cell.FULL : new CellCache.Cell(boxes, b.planes().toArray(Plane[]::new), false, -1, 0));
		}
		return (x, y, z) -> y <= groundTop ? CellCache.Cell.FULL : cells.getOrDefault(new BlockPos(x, y, z), CellCache.Cell.EMPTY);
	}
}
