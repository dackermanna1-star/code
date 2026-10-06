package com.laptopcraft.block;

import com.laptopcraft.registry.ModBlockEntities;
import com.laptopcraft.registry.ModDataComponents;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.core.component.DataComponentGetter;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jspecify.annotations.Nullable;

/**
 * Stores one CubeBook's opaque OS data and its owner. The data never leaves the server except in the
 * {@code OpenLaptop} packet sent to the player who opens the laptop (it is deliberately not part of the
 * chunk update tag, so nearby players don't download other people's files).
 */
public class LaptopBlockEntity extends BlockEntity {
	private static final String TAG_OS = "os_data";
	private static final String TAG_OWNER = "owner";
	private static final String TAG_OWNER_NAME = "owner_name";

	private CompoundTag osData = new CompoundTag();
	private @Nullable UUID ownerId;
	private String ownerName = "";
	/** Cached {@code osData.sizeInBytes()}; -1 = unknown. */
	private int cachedSize = -1;

	public LaptopBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.LAPTOP, pos, state);
	}

	// ------------------------------------------------------------------ data access

	/** A copy of the OS data (safe to hand to a packet that is encoded on another thread). */
	public CompoundTag copyOsData() {
		return osData.copy();
	}

	public String ownerName() {
		return ownerName;
	}

	public @Nullable UUID ownerId() {
		return ownerId;
	}

	public boolean hasOwner() {
		return !ownerName.isEmpty();
	}

	/** Registers the laptop to {@code player}. */
	public void setOwner(Player player) {
		this.ownerId = player.getUUID();
		this.ownerName = player.getGameProfile().name();
		setChanged();
	}

	/**
	 * Called after placement. A fresh laptop is registered to whoever placed it; a laptop that already
	 * carries an owner (from its item) keeps it, like a second-hand computer still logged in to its old account.
	 */
	public void onPlacedBy(Player player) {
		if (ownerName.isEmpty()) {
			setOwner(player);
		} else if (ownerId == null && ownerName.equals(player.getGameProfile().name())) {
			ownerId = player.getUUID();
			setChanged();
		}
	}

	/**
	 * Validates and applies one {@code LaptopSave} edit.
	 *
	 * @return {@code null} on success, otherwise a user-facing error message (nothing was changed)
	 */
	public @Nullable String applyEdit(String path, CompoundTag data, boolean delete) {
		if (cachedSize < 0) {
			cachedSize = osData.sizeInBytes();
		}
		OsDataEdit.Result result = OsDataEdit.apply(osData, cachedSize, path, data, delete);
		if (!result.ok()) {
			return result.error();
		}
		cachedSize = result.newTotalSize();
		setChanged();
		return null;
	}

	// ------------------------------------------------------------------ persistence

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		if (!osData.isEmpty()) {
			output.store(TAG_OS, CompoundTag.CODEC, osData);
		}
		output.storeNullable(TAG_OWNER, UUIDUtil.CODEC, ownerId);
		if (!ownerName.isEmpty()) {
			output.putString(TAG_OWNER_NAME, ownerName);
		}
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		osData = input.read(TAG_OS, CompoundTag.CODEC).map(CompoundTag::copy).orElseGet(CompoundTag::new);
		ownerId = input.read(TAG_OWNER, UUIDUtil.CODEC).orElse(null);
		ownerName = input.getStringOr(TAG_OWNER_NAME, "");
		cachedSize = -1;
	}

	// ------------------------------------------------------------------ item <-> block entity

	@Override
	protected void applyImplicitComponents(DataComponentGetter components) {
		super.applyImplicitComponents(components);
		LaptopData data = components.get(ModDataComponents.OS_DATA);
		if (data != null) {
			osData = data.copyTag();
			cachedSize = -1;
		}
		String owner = components.get(ModDataComponents.OWNER_NAME);
		if (owner != null && !owner.isEmpty()) {
			ownerName = owner;
			ownerId = null;
		}
	}

	@Override
	protected void collectImplicitComponents(DataComponentMap.Builder components) {
		super.collectImplicitComponents(components);
		components.set(ModDataComponents.OS_DATA, LaptopData.of(osData));
		if (!ownerName.isEmpty()) {
			components.set(ModDataComponents.OWNER_NAME, ownerName);
		}
	}

	@Override
	@SuppressWarnings("deprecation")
	public void removeComponentsFromTag(ValueOutput output) {
		output.discard(TAG_OS);
		output.discard(TAG_OWNER_NAME);
	}
}
