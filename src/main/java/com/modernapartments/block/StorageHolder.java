package com.modernapartments.block;

import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;

/** Implemented by blocks whose block entity is a {@link com.modernapartments.block.entity.StorageBlockEntity}. */
public interface StorageHolder {
	int storageRows();

	StorageSound storageSound();

	enum StorageSound {
		WOOD(SoundEvents.BARREL_OPEN, SoundEvents.BARREL_CLOSE, 1.15F),
		METAL(SoundEvents.IRON_TRAPDOOR_OPEN, SoundEvents.IRON_TRAPDOOR_CLOSE, 1.3F),
		FRIDGE(SoundEvents.IRON_DOOR_OPEN, SoundEvents.IRON_DOOR_CLOSE, 1.6F),
		SOFT(SoundEvents.WOOL_PLACE, SoundEvents.WOOL_PLACE, 0.9F);

		public final SoundEvent open;
		public final SoundEvent close;
		public final float pitch;

		StorageSound(SoundEvent open, SoundEvent close, float pitch) {
			this.open = open;
			this.close = close;
			this.pitch = pitch;
		}
	}
}
