package com.blademode.block;

import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.registry.ModBlocks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * Holds what is left of a block after part of it was cut away: the original block state and the
 * cut planes (block-local, solid side = {@code n.p <= d}).
 */
public class CutBlockEntity extends BlockEntity {
	private static final int VOXEL_RES = 8;

	private BlockState original = Blocks.STONE.defaultBlockState();
	private List<Plane> planes = List.of();
	/** Game time of the cut that produced this block (drives the hot-cut glow on clients). */
	private long cutTime = Long.MIN_VALUE / 2;
	private @Nullable PartShape partShape;
	private @Nullable VoxelShape voxelShape;

	/** Client-side render cache, owned by the renderer. */
	public @Nullable Object renderCache;
	/** Client-side: game time at which this block was first seen (drives the hot-cut glow). */
	public long clientFirstSeen = Long.MIN_VALUE;

	public CutBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlocks.CUT_BLOCK_ENTITY, pos, state);
	}

	public void setContents(BlockState original, List<Plane> planes, boolean freshCut) {
		this.original = original;
		this.planes = List.copyOf(planes);
		if (freshCut && this.level != null) {
			this.cutTime = this.level.getGameTime();
		}
		this.invalidate();
		this.setChanged();
	}

	public long getCutTime() {
		return this.cutTime;
	}

	private void invalidate() {
		this.partShape = null;
		this.voxelShape = null;
		this.renderCache = null;
	}

	public BlockState getOriginal() {
		return this.original;
	}

	public List<Plane> getPlanes() {
		return this.planes;
	}

	/** Exact clipped collision geometry. */
	public PartShape getPartShape() {
		PartShape s = this.partShape;
		if (s == null) {
			s = BlockGeometry.shape(this.original, this.planes);
			this.partShape = s;
		}
		return s;
	}

	/** Voxelised (1/8 block) approximation used for vanilla collision and the selection outline. */
	public VoxelShape getVoxelShape() {
		VoxelShape s = this.voxelShape;
		if (s == null) {
			s = voxelize(this.getPartShape());
			this.voxelShape = s;
		}
		return s;
	}

	static VoxelShape voxelize(PartShape shape) {
		if (shape.isEmpty()) {
			return Shapes.empty();
		}
		final int n = VOXEL_RES;
		boolean[] filled = new boolean[n * n * n];
		boolean any = false;
		for (int y = 0; y < n; y++) {
			for (int z = 0; z < n; z++) {
				for (int x = 0; x < n; x++) {
					if (shape.contains((x + 0.5) / n, (y + 0.5) / n, (z + 0.5) / n, 0.0)) {
						filled[(y * n + z) * n + x] = true;
						any = true;
					}
				}
			}
		}
		if (!any) {
			return Shapes.empty();
		}

		// Greedy merge of filled voxels into boxes.
		boolean[] used = new boolean[filled.length];
		List<VoxelShape> boxes = new ArrayList<>();
		for (int y = 0; y < n; y++) {
			for (int z = 0; z < n; z++) {
				for (int x = 0; x < n; x++) {
					int idx = (y * n + z) * n + x;
					if (!filled[idx] || used[idx]) {
						continue;
					}
					int x1 = x;
					while (x1 + 1 < n && filled[(y * n + z) * n + x1 + 1] && !used[(y * n + z) * n + x1 + 1]) {
						x1++;
					}
					int z1 = z;
					zLoop:
					while (z1 + 1 < n) {
						for (int xi = x; xi <= x1; xi++) {
							int j = (y * n + z1 + 1) * n + xi;
							if (!filled[j] || used[j]) {
								break zLoop;
							}
						}
						z1++;
					}
					int y1 = y;
					yLoop:
					while (y1 + 1 < n) {
						for (int zi = z; zi <= z1; zi++) {
							for (int xi = x; xi <= x1; xi++) {
								int j = ((y1 + 1) * n + zi) * n + xi;
								if (!filled[j] || used[j]) {
									break yLoop;
								}
							}
						}
						y1++;
					}
					for (int yi = y; yi <= y1; yi++) {
						for (int zi = z; zi <= z1; zi++) {
							for (int xi = x; xi <= x1; xi++) {
								used[(yi * n + zi) * n + xi] = true;
							}
						}
					}
					boxes.add(Shapes.box((double) x / n, (double) y / n, (double) z / n, (double) (x1 + 1) / n, (double) (y1 + 1) / n, (double) (z1 + 1) / n));
				}
			}
		}

		VoxelShape result = boxes.getFirst();
		if (boxes.size() > 1) {
			result = Shapes.or(result, boxes.subList(1, boxes.size()).toArray(VoxelShape[]::new));
		}
		return result.optimize();
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		this.original = input.read("original", BlockState.CODEC).orElse(Blocks.STONE.defaultBlockState());
		this.planes = List.copyOf(input.read("planes", Plane.CODEC.listOf()).orElse(List.of()));
		this.cutTime = input.getLongOr("cut_time", Long.MIN_VALUE / 2);
		this.invalidate();
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		output.store("original", BlockState.CODEC, this.original);
		output.store("planes", Plane.CODEC.listOf(), this.planes);
		output.putLong("cut_time", this.cutTime);
	}

	@Override
	public @Nullable Packet<ClientGamePacketListener> getUpdatePacket() {
		return ClientboundBlockEntityDataPacket.create(this);
	}

	@Override
	public CompoundTag getUpdateTag(HolderLookup.Provider registries) {
		return this.saveWithoutMetadata(registries);
	}
}
