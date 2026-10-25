package com.modernapartments.block.entity;

import com.modernapartments.registry.ModBlockEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/** Stores the floor label ("P1", "L", "12", "PH", "R"...) shown by elevator panels. */
public class ElevatorBlockEntity extends BlockEntity {
	private String label = "";

	public ElevatorBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.ELEVATOR, pos, state);
	}

	public String label() {
		return label;
	}

	public void setLabel(String label) {
		this.label = label == null ? "" : label;
		setChanged();
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		if (!label.isEmpty()) {
			output.putString("Floor", label);
		}
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		label = input.getStringOr("Floor", "");
	}
}
