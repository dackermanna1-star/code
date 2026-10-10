package com.blademode.piece;

import com.blademode.block.CutBlockEntity;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.Plane;
import com.blademode.registry.ModBlocks;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;

/**
 * Per-tick cache of world collision geometry, in block-local coordinates. Cut blocks expose their
 * exact clipping planes so pieces slide along real cut surfaces instead of voxel steps.
 */
public final class CellCache implements CellSource {
	public static final class Cell {
		public static final Cell EMPTY = new Cell(new AABB[0], new Plane[0], false, -1, 0);
		public static final Cell FULL = new Cell(new AABB[]{new AABB(0, 0, 0, 1, 1, 1)}, new Plane[0], true, -1, 0);

		final AABB[] boxes;
		final Plane[] planes;
		final boolean full;
		/** Fluid surface height inside the cell (0..1), or -1 when dry. */
		final double fluidHeight;
		final double fluidDensity;

		public Cell(AABB[] boxes, Plane[] planes, boolean full, double fluidHeight, double fluidDensity) {
			this.boxes = boxes;
			this.planes = planes;
			this.full = full;
			this.fluidHeight = fluidHeight;
			this.fluidDensity = fluidDensity;
		}

		boolean isEmpty() {
			return this.boxes.length == 0;
		}

		/** Index of the box (∩ planes) strictly containing the local point, or -1. */
		int regionAt(double x, double y, double z, double margin) {
			for (int i = 0; i < this.boxes.length; i++) {
				AABB b = this.boxes[i];
				if (x > b.minX + margin && x < b.maxX - margin && y > b.minY + margin && y < b.maxY - margin && z > b.minZ + margin && z < b.maxZ - margin) {
					boolean in = true;
					for (Plane p : this.planes) {
						if (p.dist(x, y, z) > -margin) {
							in = false;
							break;
						}
					}
					if (in) {
						return i;
					}
				}
			}
			return -1;
		}
	}

	private final ServerLevel level;
	private final Long2ObjectOpenHashMap<Cell> cells = new Long2ObjectOpenHashMap<>();
	private final BlockPos.MutableBlockPos mutable = new BlockPos.MutableBlockPos();

	CellCache(ServerLevel level) {
		this.level = level;
	}

	@Override
	public Cell get(int x, int y, int z) {
		long key = BlockPos.asLong(x, y, z);
		Cell c = this.cells.get(key);
		if (c == null) {
			c = this.compute(x, y, z);
			this.cells.put(key, c);
		}
		return c;
	}

	private Cell compute(int x, int y, int z) {
		this.mutable.set(x, y, z);
		if (y < this.level.getMinY()) {
			return Cell.FULL;
		}
		if (y > this.level.getMaxY()) {
			return Cell.EMPTY;
		}
		if (!this.level.isLoaded(this.mutable)) {
			return Cell.FULL;
		}
		BlockState state = this.level.getBlockState(this.mutable);
		FluidState fluid = state.getFluidState();
		double fluidHeight = -1;
		double density = 0;
		if (!fluid.isEmpty()) {
			fluidHeight = fluid.getHeight(this.level, this.mutable);
			density = fluid.is(FluidTags.LAVA) ? 3.0 : 1.0;
		}
		if (state.isAir()) {
			return Cell.EMPTY;
		}
		AABB[] boxes;
		Plane[] planes = new Plane[0];
		if (state.is(ModBlocks.CUT_BLOCK) && this.level.getBlockEntity(this.mutable) instanceof CutBlockEntity cut) {
			boxes = BlockGeometry.collisionBoxes(cut.getOriginal()).toArray(AABB[]::new);
			planes = cut.getPlanes().toArray(Plane[]::new);
		} else {
			List<AABB> list = state.getCollisionShape(this.level, this.mutable).toAabbs();
			if (list.size() > 8) {
				list = List.of(state.getCollisionShape(this.level, this.mutable).bounds());
			}
			boxes = list.toArray(AABB[]::new);
		}
		if (boxes.length == 0 && fluidHeight < 0) {
			return Cell.EMPTY;
		}
		boolean full = planes.length == 0 && boxes.length == 1 && boxes[0].minX <= 0 && boxes[0].minY <= 0 && boxes[0].minZ <= 0
			&& boxes[0].maxX >= 1 && boxes[0].maxY >= 1 && boxes[0].maxZ >= 1;
		if (full && fluidHeight < 0) {
			return Cell.FULL;
		}
		return new Cell(boxes, planes, full, fluidHeight, density);
	}

}
