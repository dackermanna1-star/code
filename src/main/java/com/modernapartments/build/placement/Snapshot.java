package com.modernapartments.build.placement;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/** Palette-compressed copy of a world region, taken before a building is placed (for undo/demolition). */
public final class Snapshot {
	private final BoundingBox box;
	private final short[] cells;
	private final List<BlockState> palette = new ArrayList<>();

	private Snapshot(BoundingBox box) {
		this.box = box;
		this.cells = new short[box.getXSpan() * box.getYSpan() * box.getZSpan()];
	}

	public BoundingBox box() {
		return box;
	}

	public static Snapshot capture(ServerLevel level, BoundingBox box) {
		Snapshot snap = new Snapshot(box);
		Map<BlockState, Short> ids = new IdentityHashMap<>();
		BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
		int i = 0;
		for (int y = box.minY(); y <= box.maxY(); y++) {
			for (int z = box.minZ(); z <= box.maxZ(); z++) {
				for (int x = box.minX(); x <= box.maxX(); x++) {
					BlockState s = level.getBlockState(p.set(x, y, z));
					Short id = ids.get(s);
					if (id == null) {
						id = (short) snap.palette.size();
						snap.palette.add(s);
						ids.put(s, id);
					}
					snap.cells[i++] = id;
				}
			}
		}
		return snap;
	}

	/** Index-ordered iteration used by the restore job. */
	public BlockState stateAt(int index) {
		return palette.get(cells[index]);
	}

	public int size() {
		return cells.length;
	}

	public BlockPos posAt(int index) {
		int sx = box.getXSpan();
		int sz = box.getZSpan();
		int x = index % sx;
		int z = (index / sx) % sz;
		int y = index / (sx * sz);
		return new BlockPos(box.minX() + x, box.minY() + y, box.minZ() + z);
	}
}
