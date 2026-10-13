package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import net.minecraft.util.StringRepresentable;

/** How the weapon chambers its next round. */
public enum ActionType implements StringRepresentable {
	/** Gas/recoil operated: chambers automatically after every shot. */
	SELF_LOADING("self_loading"),
	/** Manual bolt: must be cycled after every shot. */
	BOLT("bolt"),
	/** Manual pump: must be cycled after every shot. */
	PUMP("pump"),
	/** Revolver: fires straight from the cylinder, no separate chamber. */
	DOUBLE_ACTION("double_action");

	public static final Codec<ActionType> CODEC = StringRepresentable.fromEnum(ActionType::values);
	private final String name;

	ActionType(String name) {
		this.name = name;
	}

	public boolean manualCycle() {
		return this == BOLT || this == PUMP;
	}

	public boolean usesChamber() {
		return this != DOUBLE_ACTION;
	}

	@Override
	public String getSerializedName() {
		return name;
	}
}
