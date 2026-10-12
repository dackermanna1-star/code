package com.mineception.block;

import com.mineception.ModContent;
import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.Arrays;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentGetter;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jspecify.annotations.Nullable;

/**
 * Holds a laptop's dream data (seed + edits). Synced to clients so everyone sees the same levels, and carried by the
 * laptop item (as the {@link ModContent#LAPTOP_DATA} component) when the block is broken and placed again.
 *
 * <p>Public API used by the client: {@link #data()}, {@link #revision()}, {@link #getBlockPos()}.
 */
public class LaptopBlockEntity extends BlockEntity {
	private static final String DATA_KEY = "dream";

	private @Nullable LaptopData data;
	/** Bumped whenever the data changes (also after a sync), so clients know to rebuild their copies. */
	private int revision;
	/** Server: levels built (generated + edits) for validating edits, created on demand and kept in step with edits. */
	private final MiniWorld[] levels = new MiniWorld[Theme.DEPTHS];

	public LaptopBlockEntity(BlockPos pos, BlockState state) {
		super(ModContent.LAPTOP_BLOCK_ENTITY, pos, state);
	}

	/**
	 * The laptop's data. On the server a laptop without data gets a fresh random seed on first access; on a client that
	 * has not received the server's data yet this is a stand-in that is replaced (with a revision bump) by the sync.
	 */
	public LaptopData data() {
		if (data == null) {
			boolean client = level != null && level.isClientSide();
			long seed = level != null && !client ? level.getRandom().nextLong() : worldPosition.asLong() * 31L + 0x5DEECE66DL;
			data = new LaptopData(seed);
			if (!client) {
				setChanged();
			}
		}
		return data;
	}

	public void setData(LaptopData data) {
		this.data = data;
		changed();
	}

	public int revision() {
		return revision;
	}

	/**
	 * Server: level {@code depth} as it currently is (generated terrain plus every edit). Built on first use and kept
	 * up to date by {@link #applyEdit}; treat it as read-only.
	 */
	public MiniWorld level(int depth) {
		MiniWorld world = levels[depth - 1];
		if (world == null) {
			world = data().build(depth);
			levels[depth - 1] = world;
		}
		return world;
	}

	/** Server: applies a validated edit and syncs it to clients. Returns false if the level is full of edits. */
	public boolean applyEdit(int depth, int index, MiniBlock block) {
		if (!data().putEdit(depth, index, block)) {
			return false;
		}
		MiniWorld cached = levels[depth - 1];
		if (cached != null) {
			cached.set(index, block);
		}
		revision++;
		setChanged();
		if (level != null && !level.isClientSide()) {
			level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), Block.UPDATE_CLIENTS);
		}
		return true;
	}

	/** Data replaced wholesale: forget cached levels and tell renderers to rebuild. */
	private void changed() {
		Arrays.fill(levels, null);
		revision++;
		setChanged();
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		LaptopData loaded = input.read(DATA_KEY, LaptopDataCodecs.CODEC).orElse(null);
		if (loaded != null || data == null) {
			data = loaded;
		}
		Arrays.fill(levels, null);
		revision++;
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		output.store(DATA_KEY, LaptopDataCodecs.CODEC, data());
	}

	@Override
	protected void applyImplicitComponents(DataComponentGetter components) {
		super.applyImplicitComponents(components);
		LaptopData fromItem = components.get(ModContent.LAPTOP_DATA);
		if (fromItem != null) {
			// Components are shared values: keep our own copy since edits mutate it
			data = fromItem.copy();
			changed();
		}
	}

	@Override
	protected void collectImplicitComponents(DataComponentMap.Builder components) {
		super.collectImplicitComponents(components);
		components.set(ModContent.LAPTOP_DATA, data().copy());
	}

	@Override
	@SuppressWarnings("deprecation")
	public void removeComponentsFromTag(ValueOutput output) {
		super.removeComponentsFromTag(output);
		output.discard(DATA_KEY);
	}

	@Override
	public CompoundTag getUpdateTag(HolderLookup.Provider provider) {
		return saveCustomOnly(provider);
	}

	@Override
	public @Nullable Packet<ClientGamePacketListener> getUpdatePacket() {
		return ClientboundBlockEntityDataPacket.create(this);
	}
}
