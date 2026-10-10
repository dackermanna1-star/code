package com.blademode.cut;

import com.blademode.BladeConfig;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.piece.PieceBlock;
import com.blademode.piece.PieceEntity;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/** Cuts an existing piece in two (or more) with a slash. */
public final class PieceCutter {
	private PieceCutter() {
	}

	/** One part of a piece after a cut: its blocks and which side of the cut it mostly lies on. */
	public record Fragment(List<PieceBlock> blocks, int side) {
	}

	/** Returns the number of pieces produced (0 if the slash did not separate anything). */
	public static int cut(ServerLevel level, PieceEntity piece, Slash slash) {
		Vec3 off = piece.getPieceData().gridOffset();
		Quaterniond rot = new Quaterniond(piece.rot);
		Vector3d pos = new Vector3d(piece.getX(), piece.getY(), piece.getZ());

		// World plane in grid coordinates: world = pos + R (g + off).
		Vector3d nl = rot.transformInverse(new Vector3d(slash.n));
		double dg = slash.d - slash.n.dot(pos) - (nl.x * off.x + nl.y * off.y + nl.z * off.z);
		Plane gridPlane = new Plane(nl.x, nl.y, nl.z, dg);
		Bonds.Space space = (gx, gy, gz) -> rot.transform(new Vector3d(gx + off.x, gy + off.y, gz + off.z)).add(pos);

		List<Fragment> fragments = split(piece.body().blocks, gridPlane, slash, space);
		if (fragments.size() < 2) {
			return 0;
		}

		Vector3d origin = rot.transform(new Vector3d(off.x, off.y, off.z)).add(pos);
		Vector3d vel = new Vector3d(piece.vel);
		Vector3d angVel = new Vector3d(piece.angVel);
		BladeConfig cfg = BladeConfig.get();
		int made = 0;
		for (Fragment fragment : fragments) {
			PieceEntity part = PieceEntity.create(level, fragment.blocks(), origin, rot, vel, angVel, pos);
			if (part == null) {
				continue;
			}
			double massScale = Math.min(1.0, 3.0 / Math.sqrt(Math.max(part.body().mass, 0.01)));
			Vector3d kick = slash.bladeDirection(part.getX(), part.getY(), part.getZ()).mul(cfg.slashPush * 0.5 * massScale);
			kick.fma(0.6 * fragment.side() * massScale, slash.n);
			part.vel.add(kick);
			part.markFreshCut();
			level.addFreshEntity(part);
			made++;
		}
		piece.discard();
		return made;
	}

	/**
	 * Splits the blocks of a piece (grid coordinates) along a plane given in grid coordinates.
	 * Returns the separated fragments; a single fragment (or none) means nothing came apart.
	 */
	public static List<Fragment> split(List<PieceBlock> source, Plane gridPlane, Slash slash, Bonds.Space space) {
		Long2ObjectOpenHashMap<PartNode[]> nodes = new Long2ObjectOpenHashMap<>();
		List<PartNode> all = new ArrayList<>();
		boolean anySplit = false;
		for (int i = 0; i < source.size(); i++) {
			PieceBlock b = source.get(i);
			BlockPos cell = b.pos();
			Plane local = gridPlane.translated(cell.getX(), cell.getY(), cell.getZ());
			double minD = local.minDist(0, 0, 0, 1, 1, 1);
			double maxD = local.maxDist(0, 0, 0, 1, 1, 1);
			int side = maxD <= 1.0E-6 ? PartNode.BACK : (minD >= -1.0E-6 ? PartNode.FRONT : PartNode.BOTH);
			PartNode[] here;
			if (side == PartNode.BOTH && BlockGeometry.isStructural(b.state()) && inSector(slash, space, local, cell)) {
				PartShape back = new PartShape(BlockGeometry.collisionBoxes(b.state()), with(b.planes(), local));
				PartShape front = new PartShape(BlockGeometry.collisionBoxes(b.state()), with(b.planes(), local.flip()));
				// A block the plane only grazes stays whole on the bigger side, minus the sliver, so the
				// fragments never overlap. Blocks carrying data are left untouched.
				boolean keepData = b.blockEntity().isPresent();
				if (back.volume < CutEngine.MIN_PART_VOLUME) {
					Plane trim = back.volume > 1.0E-9 && !keepData ? local.flip() : null;
					here = new PartNode[]{new PartNode(cell, b.state(), b.planes(), trim, PartNode.FRONT, i, false)};
				} else if (front.volume < CutEngine.MIN_PART_VOLUME) {
					Plane trim = front.volume > 1.0E-9 && !keepData ? local : null;
					here = new PartNode[]{new PartNode(cell, b.state(), b.planes(), trim, PartNode.BACK, i, false)};
				} else {
					PartNode f = new PartNode(cell, b.state(), b.planes(), local.flip(), PartNode.FRONT, i, false);
					PartNode k = new PartNode(cell, b.state(), b.planes(), local, PartNode.BACK, i, false);
					f.twin = k;
					k.twin = f;
					here = new PartNode[]{f, k};
					anySplit = true;
				}
			} else {
				if (side == PartNode.BOTH && !BlockGeometry.isStructural(b.state())) {
					double dc = local.dist(0.5, 0.5, 0.5);
					side = dc > 0 ? PartNode.FRONT : PartNode.BACK;
				}
				here = new PartNode[]{new PartNode(cell, b.state(), b.planes(), null, side, i, false)};
			}
			nodes.put(cell.asLong(), here);
			for (PartNode n : here) {
				all.add(n);
			}
		}
		if (!anySplit && !touchesPlaneInSector(all, slash, space)) {
			return List.of();
		}

		// Connected components.
		int comps = 0;
		for (PartNode start : all) {
			if (start.component >= 0) {
				continue;
			}
			int id = comps++;
			ArrayDeque<PartNode> queue = new ArrayDeque<>();
			start.component = id;
			queue.add(start);
			while (!queue.isEmpty()) {
				PartNode node = queue.poll();
				for (Direction dir : Direction.values()) {
					PartNode[] around = nodes.get(node.cell.relative(dir).asLong());
					if (around == null) {
						continue;
					}
					for (PartNode m : around) {
						if (m.component < 0 && Bonds.face(node, m, dir, slash, space)) {
							m.component = id;
							queue.add(m);
						}
					}
				}
				if (node.log) {
					for (int[] d : Bonds.DIAGONALS) {
						PartNode[] around = nodes.get(node.cell.offset(d[0], d[1], d[2]).asLong());
						if (around == null) {
							continue;
						}
						for (PartNode m : around) {
							if (m.component < 0 && Bonds.diagonal(node, m, d[0], d[1], d[2], slash, space)) {
								m.component = id;
								queue.add(m);
							}
						}
					}
				}
			}
		}
		if (comps < 2) {
			return List.of();
		}

		// Assemble blocks per component; a block whose two halves stayed together is left whole.
		List<Map<BlockPos, PartNode>> groups = new ArrayList<>();
		int[] sideVotes = new int[comps];
		List<List<PieceBlock>> blocks = new ArrayList<>();
		for (int i = 0; i < comps; i++) {
			groups.add(new LinkedHashMap<>());
			blocks.add(new ArrayList<>());
		}
		for (PartNode n : all) {
			Map<BlockPos, PartNode> g = groups.get(n.component);
			PartNode prev = g.get(n.cell);
			PieceBlock src = source.get(n.sourceIndex);
			if (prev != null) {
				// Both halves together: restore the original block.
				blocks.get(n.component).removeIf(pb -> pb.pos().equals(n.cell));
				blocks.get(n.component).add(src);
				continue;
			}
			g.put(n.cell, n);
			if (n.isSplit()) {
				sideVotes[n.component] += n.side;
			}
			blocks.get(n.component).add(new PieceBlock(n.cell, n.state, n.planes, n.isSplit() ? Optional.empty() : src.blockEntity()));
		}
		List<Fragment> fragments = new ArrayList<>();
		for (int i = 0; i < comps; i++) {
			if (!blocks.get(i).isEmpty()) {
				fragments.add(new Fragment(blocks.get(i), Integer.signum(sideVotes[i])));
			}
		}
		return fragments;
	}

	private static boolean inSector(Slash slash, Bonds.Space space, Plane local, BlockPos cell) {
		double dc = local.dist(0.5, 0.5, 0.5);
		Vector3d w = space.toWorld(cell.getX() + 0.5 - local.nx() * dc, cell.getY() + 0.5 - local.ny() * dc, cell.getZ() + 0.5 - local.nz() * dc);
		return slash.inSector(w.x, w.y, w.z, 0.0);
	}

	private static boolean touchesPlaneInSector(List<PartNode> nodes, Slash slash, Bonds.Space space) {
		for (PartNode n : nodes) {
			if (n.side != PartNode.BOTH) {
				Vector3d c = space.toWorld(n.cell.getX() + 0.5, n.cell.getY() + 0.5, n.cell.getZ() + 0.5);
				if (Math.abs(slash.dist(c.x, c.y, c.z)) < 0.87 && slash.inSector(c.x, c.y, c.z, 0.5)) {
					return true;
				}
			}
		}
		return false;
	}

	private static List<Plane> with(List<Plane> planes, Plane extra) {
		List<Plane> list = new ArrayList<>(planes.size() + 1);
		list.addAll(planes);
		list.add(extra);
		return list;
	}
}
