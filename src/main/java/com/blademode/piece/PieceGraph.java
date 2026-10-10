package com.blademode.piece;

import com.blademode.cut.Bonds;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;

/** Splits a set of piece blocks into the groups that physically hold together. */
public final class PieceGraph {
	private PieceGraph() {
	}

	public static List<List<PieceBlock>> components(List<PieceBlock> blocks) {
		int n = blocks.size();
		Long2IntOpenHashMap index = new Long2IntOpenHashMap(n);
		index.defaultReturnValue(-1);
		PartShape[] shapes = new PartShape[n];
		for (int i = 0; i < n; i++) {
			index.put(blocks.get(i).pos().asLong(), i);
			shapes[i] = BlockGeometry.shape(blocks.get(i).state(), blocks.get(i).planes());
		}
		int[] parent = new int[n];
		for (int i = 0; i < n; i++) {
			parent[i] = i;
		}
		for (int i = 0; i < n; i++) {
			PieceBlock a = blocks.get(i);
			for (Direction dir : new Direction[]{Direction.UP, Direction.SOUTH, Direction.EAST}) {
				int j = index.get(a.pos().relative(dir).asLong());
				if (j >= 0 && bonded(blocks.get(i), shapes[i], blocks.get(j), shapes[j], dir)) {
					union(parent, i, j);
				}
			}
			if (BlockGeometry.isLog(a.state())) {
				for (int[] d : Bonds.DIAGONALS) {
					int j = index.get(BlockPos.asLong(a.pos().getX() + d[0], a.pos().getY() + d[1], a.pos().getZ() + d[2]));
					if (j > i && BlockGeometry.isLog(blocks.get(j).state())
						&& shapes[i].contains(0.5 + d[0] * 0.42, 0.5 + d[1] * 0.42, 0.5 + d[2] * 0.42, 0.0)
						&& shapes[j].contains(0.5 - d[0] * 0.42, 0.5 - d[1] * 0.42, 0.5 - d[2] * 0.42, 0.0)) {
						union(parent, i, j);
					}
				}
			}
		}
		Map<Integer, List<PieceBlock>> groups = new LinkedHashMap<>();
		for (int i = 0; i < n; i++) {
			groups.computeIfAbsent(find(parent, i), k -> new ArrayList<>()).add(blocks.get(i));
		}
		List<List<PieceBlock>> result = new ArrayList<>(groups.values());
		result.sort((x, y) -> Integer.compare(y.size(), x.size()));
		return result;
	}

	private static boolean bonded(PieceBlock a, PartShape sa, PieceBlock b, PartShape sb, Direction dir) {
		if (sa.isEmpty() || sb.isEmpty()) {
			// Torches, flowers, vines...: they hang on whatever they touch.
			return true;
		}
		if (!a.isCut() && !b.isCut() && BlockGeometry.isFullCube(a.state()) && BlockGeometry.isFullCube(b.state())) {
			return true;
		}
		return sa.contactArea(dir.getStepX(), dir.getStepY(), dir.getStepZ(), sb) >= Bonds.MIN_CONTACT;
	}

	private static int find(int[] parent, int i) {
		while (parent[i] != i) {
			parent[i] = parent[parent[i]];
			i = parent[i];
		}
		return i;
	}

	private static void union(int[] parent, int a, int b) {
		int ra = find(parent, a);
		int rb = find(parent, b);
		if (ra != rb) {
			parent[rb] = ra;
		}
	}
}
