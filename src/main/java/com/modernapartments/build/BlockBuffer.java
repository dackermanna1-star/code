package com.modernapartments.build;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * A complete building held in memory: a dense, palette-compressed grid of block states in local
 * coordinates (x across the plot, z from the front to the back, y up), block-entity initializers and
 * named markers. Buildings are generated into a buffer once and then copied into the world, either all
 * at once (blueprints) or chunk by chunk (world generation).
 */
public final class BlockBuffer {
	public final int sizeX;
	public final int sizeY;
	public final int sizeZ;
	/** Local y of the walking surface outside the building (the ground level). */
	public final int groundY;

	private final short[] cells;
	private final List<BlockState> palette = new ArrayList<>();
	private final Map<BlockState, Integer> paletteIndex = new IdentityHashMap<>();
	private final Int2ObjectMap<BlockEntityInit> inits = new Int2ObjectOpenHashMap<>();
	private final List<Marker> markers = new ArrayList<>();

	/** A named point of interest (entrance, unit probe, elevator stop) used for validation and teleports. */
	public record Marker(String type, BlockPos pos, String label) {
	}

	public BlockBuffer(int sizeX, int sizeY, int sizeZ, int groundY) {
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.sizeZ = sizeZ;
		this.groundY = groundY;
		this.cells = new short[sizeX * sizeY * sizeZ];
		palette.add(null);
	}

	public boolean inBounds(int x, int y, int z) {
		return x >= 0 && y >= 0 && z >= 0 && x < sizeX && y < sizeY && z < sizeZ;
	}

	public int index(int x, int y, int z) {
		return (y * sizeZ + z) * sizeX + x;
	}

	public int volume() {
		return cells.length;
	}

	private short paletteId(BlockState state) {
		Integer id = paletteIndex.get(state);
		if (id == null) {
			id = palette.size();
			if (id >= Short.MAX_VALUE) {
				throw new IllegalStateException("Building palette overflow");
			}
			palette.add(state);
			paletteIndex.put(state, id);
		}
		return (short) (int) id;
	}

	public void set(int x, int y, int z, BlockState state) {
		if (!inBounds(x, y, z)) {
			return;
		}
		int i = index(x, y, z);
		cells[i] = state == null ? 0 : paletteId(state);
		if (state == null || !state.hasBlockEntity()) {
			inits.remove(i);
		}
	}

	public @Nullable BlockState get(int x, int y, int z) {
		if (!inBounds(x, y, z)) {
			return null;
		}
		return palette.get(cells[index(x, y, z)]);
	}

	/** State by flat index (null = unset: the world keeps whatever is there). */
	public @Nullable BlockState get(int index) {
		return palette.get(cells[index]);
	}

	public void setInit(int x, int y, int z, BlockEntityInit init) {
		if (inBounds(x, y, z)) {
			inits.put(index(x, y, z), init);
		}
	}

	public @Nullable BlockEntityInit init(int index) {
		return inits.get(index);
	}

	public Int2ObjectMap<BlockEntityInit> inits() {
		return inits;
	}

	public void addMarker(String type, int x, int y, int z, String label) {
		markers.add(new Marker(type, new BlockPos(x, y, z), label));
	}

	public List<Marker> markers() {
		return markers;
	}

	public List<Marker> markers(String type) {
		List<Marker> out = new ArrayList<>();
		for (Marker m : markers) {
			if (m.type().equals(type)) {
				out.add(m);
			}
		}
		return out;
	}

	public int paletteSize() {
		return palette.size() - 1;
	}

	/** Highest local y that holds a non-air block (for trimming/validation). */
	public int topY() {
		for (int y = sizeY - 1; y >= 0; y--) {
			for (int z = 0; z < sizeZ; z++) {
				for (int x = 0; x < sizeX; x++) {
					BlockState s = get(x, y, z);
					if (s != null && !s.isAir()) {
						return y;
					}
				}
			}
		}
		return 0;
	}
}
