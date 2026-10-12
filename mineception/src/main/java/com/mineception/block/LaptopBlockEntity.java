package com.mineception.block;

import com.mineception.ModContent;
import com.mineception.dream.EditBudget;
import com.mineception.dream.EditRules;
import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.WorldGen;
import java.util.Arrays;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentGetter;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jspecify.annotations.Nullable;

/**
 * Holds a laptop's dream data (seed + edits). Synced to clients so everyone sees the same levels, and carried by the
 * laptop item (as the {@link ModContent#LAPTOP_DATA} component) when the block is broken and placed again.
 *
 * <p>Clients get the whole data with the chunk and whenever it is replaced; each edit after that reaches the players
 * watching the laptop as a small {@link LaptopDataCodecs.Delta}.
 *
 * <p>Public API used by the client: {@link #data()}, {@link #revision()}, {@link #getBlockPos()}.
 */
public class LaptopBlockEntity extends BlockEntity {
	private static final String DATA_KEY = "dream";
	private static final String DELTA_KEY = "dream_delta";

	private @Nullable LaptopData data;
	/**
	 * Server: the data has not been checked for edits covering a level's laptop since it was loaded or replaced (that
	 * needs the levels generated, so it waits until the data is first used).
	 */
	private boolean unchecked;
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
		boolean client = level != null && level.isClientSide();
		if (data == null) {
			long seed = level != null && !client ? level.getRandom().nextLong() : worldPosition.asLong() * 31L + 0x5DEECE66DL;
			data = new LaptopData(seed);
			unchecked = false;
			if (!client) {
				setChanged();
			}
		} else if (unchecked && level != null && !client) {
			unchecked = false;
			removeProtectedEdits();
		}
		return data;
	}

	/**
	 * Drops edits that cover a level's laptop (see {@link EditRules#withoutProtectedEdits}). Everything that saves or
	 * syncs the data reads it through {@link #data()} first, so such edits never reach a client or the save again.
	 */
	private void removeProtectedEdits() {
		LaptopData checked = data;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			if (checked.editCount(depth) > 0) {
				MiniWorld world = levels[depth - 1] != null ? levels[depth - 1] : WorldGen.generate(checked.seed(), depth);
				checked = EditRules.withoutProtectedEdits(checked, world);
			}
		}
		if (checked != data) {
			data = checked;
			Arrays.fill(levels, null);
			revision++;
		}
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
		LaptopData current = data();
		MiniWorld world = levels[depth - 1];
		if (world == null) {
			world = current.build(depth);
			levels[depth - 1] = world;
		}
		return world;
	}

	/**
	 * Server: applies a validated edit and sends it to the players watching the laptop. Returns false if the laptop
	 * cannot hold more edits ({@link EditBudget}).
	 */
	public boolean applyEdit(int depth, int index, MiniBlock block) {
		LaptopData current = data();
		if (!EditBudget.record(current, depth, index, block)) {
			return false;
		}
		MiniWorld cached = levels[depth - 1];
		if (cached != null) {
			cached.set(index, block);
		}
		revision++;
		setChanged();
		if (level instanceof ServerLevel server) {
			CompoundTag tag = new CompoundTag();
			tag.store(DELTA_KEY, LaptopDataCodecs.Delta.CODEC, LaptopDataCodecs.Delta.of(current.seed(), depth, index, block));
			Packet<ClientGamePacketListener> packet = ClientboundBlockEntityDataPacket.create(this, (blockEntity, registries) -> tag);
			// The players the chunk has been sent to; anyone still waiting for it gets the whole data with the chunk
			for (ServerPlayer player : PlayerLookup.tracking(server, worldPosition)) {
				player.connection.send(packet);
			}
		}
		return true;
	}

	/** Data replaced wholesale: forget cached levels and tell renderers to rebuild. */
	private void changed() {
		Arrays.fill(levels, null);
		unchecked = true;
		revision++;
		setChanged();
	}

	/** A packet carrying the whole data, e.g. to correct a client that predicted an edit the server refused. */
	public Packet<ClientGamePacketListener> fullSyncPacket() {
		return ClientboundBlockEntityDataPacket.create(this);
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		LaptopData loaded = input.read(DATA_KEY, LaptopDataCodecs.CODEC).orElse(null);
		if (loaded != null) {
			data = loaded;
		} else if (data != null) {
			// Edits made since a client got the whole data (see applyEdit); a client holding other data waits for the
			// whole data. Deltas only ever reach clients, but one given by a command is checked like any other data.
			LaptopDataCodecs.Delta delta = input.read(DELTA_KEY, LaptopDataCodecs.Delta.CODEC).orElse(null);
			if (delta == null || delta.seed() != data.seed()) {
				return;
			}
			// A new object rather than changing the old one, which renderers may still be reading
			data = delta.applyTo(data);
		}
		Arrays.fill(levels, null);
		unchecked = true;
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
		return fullSyncPacket();
	}
}
