package com.mineception.block;

import com.mineception.ModContent;
import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
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
 * Holds a laptop's dream data (seed + edits). Synced to clients so everyone sees the same levels.
 *
 * <p>Public API used by the client: {@link #data()}, {@link #revision()}, {@link #getBlockPos()}.
 */
public class LaptopBlockEntity extends BlockEntity {
	private @Nullable LaptopData data;
	/** Bumped whenever the data changes (also after a sync), so clients know to rebuild their copies. */
	private int revision;

	public LaptopBlockEntity(BlockPos pos, BlockState state) {
		super(ModContent.LAPTOP_BLOCK_ENTITY, pos, state);
	}

	/** The laptop's data, creating a fresh seed on first access. */
	public LaptopData data() {
		if (data == null) {
			long seed = level != null ? level.getRandom().nextLong() : worldPosition.asLong() * 31L + 0x5DEECE66DL;
			data = new LaptopData(seed);
		}
		return data;
	}

	public void setData(LaptopData data) {
		this.data = data;
		revision++;
		setChanged();
	}

	public int revision() {
		return revision;
	}

	/** Server: applies a validated edit and syncs it to clients. Returns false if the level is full of edits. */
	public boolean applyEdit(int depth, int index, MiniBlock block) {
		if (!data().putEdit(depth, index, block)) {
			return false;
		}
		revision++;
		setChanged();
		if (level != null && !level.isClientSide()) {
			level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), Block.UPDATE_CLIENTS);
		}
		return true;
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		data = input.read("dream", LaptopDataCodecs.CODEC).orElse(null);
		revision++;
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		output.store("dream", LaptopDataCodecs.CODEC, data());
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
