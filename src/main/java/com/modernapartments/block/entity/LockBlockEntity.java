package com.modernapartments.block.entity;

import com.modernapartments.registry.ModBlockEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Lock state of an apartment door or keycard reader. Doors are unlocked by default; a player can pair
 * an apartment key / keycard to lock them. {@code label} is the unit name shown in messages.
 */
public class LockBlockEntity extends BlockEntity {
	private long lockId;
	private String label = "";
	private long releasedUntil;

	public LockBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.LOCK, pos, state);
	}

	public boolean isLocked() {
		return lockId != 0L;
	}

	public long lockId() {
		return lockId;
	}

	public void setLockId(long lockId) {
		this.lockId = lockId;
		setChanged();
	}

	public String label() {
		return label;
	}

	public void setLabel(String label) {
		this.label = label == null ? "" : label;
		setChanged();
	}

	/** Temporarily lets anyone through (intercom buzz-in, keycard tap). */
	public void release(Level level, int ticks) {
		releasedUntil = level.getGameTime() + ticks;
	}

	public boolean isReleased(Level level) {
		return level.getGameTime() < releasedUntil;
	}

	public boolean blocks(Level level) {
		return isLocked() && !isReleased(level);
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		if (lockId != 0L) {
			output.putLong("LockId", lockId);
		}
		if (!label.isEmpty()) {
			output.putString("Label", label);
		}
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		lockId = input.getLongOr("LockId", 0L);
		label = input.getStringOr("Label", "");
	}
}
