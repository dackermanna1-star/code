package com.blademode.cut;

import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/** A node of the connectivity graph: a whole block, or one side of a block split by the current cut. */
public final class PartNode {
	public static final int BACK = -1;
	public static final int BOTH = 0;
	public static final int FRONT = 1;

	public final BlockPos cell;
	public final BlockState state;
	/** Planes the block already had before this cut (block-local). */
	public final List<Plane> oldPlanes;
	/** All planes of this node, including the new cut plane for split halves. */
	public final List<Plane> planes;
	public final PartShape shape;
	public final int side;
	/** The other half when this node is one side of a block split by the current cut. */
	public @Nullable PartNode twin;
	/** Index of the source block inside a piece (piece cuts only), -1 otherwise. */
	public final int sourceIndex;
	public final boolean softLeaves;
	public final boolean log;
	/** Connected-component id assigned by the graph search. */
	public int component = -1;

	public PartNode(BlockPos cell, BlockState state, List<Plane> oldPlanes, @Nullable Plane newPlane, int side, int sourceIndex, boolean softLeaves) {
		this.cell = cell;
		this.state = state;
		this.oldPlanes = oldPlanes;
		if (newPlane != null) {
			List<Plane> all = new ArrayList<>(oldPlanes.size() + 1);
			all.addAll(oldPlanes);
			all.add(newPlane);
			this.planes = List.copyOf(all);
		} else {
			this.planes = oldPlanes;
		}
		this.shape = BlockGeometry.shape(state, this.planes);
		this.side = side;
		this.sourceIndex = sourceIndex;
		this.softLeaves = softLeaves;
		this.log = BlockGeometry.isLog(state);
	}

	public boolean isSplit() {
		return this.twin != null;
	}

	public boolean isWholeFullCube() {
		return this.planes.isEmpty() && BlockGeometry.isFullCube(this.state);
	}

	@Override
	public String toString() {
		return "PartNode[" + this.cell.toShortString() + " " + this.state + " side=" + this.side + "]";
	}
}
