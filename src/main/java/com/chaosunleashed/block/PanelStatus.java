package com.chaosunleashed.block;

import com.chaosunleashed.core.EventPhase;
import net.minecraft.util.StringIdentifiable;
import org.jetbrains.annotations.Nullable;

/** Screen color of the Chaos Control Panel: green = idle, yellow = warning (or aftermath), red = event active. */
public enum PanelStatus implements StringIdentifiable {
	IDLE("idle"),
	WARNING("warning"),
	ACTIVE("active");

	private final String name;

	PanelStatus(String name) {
		this.name = name;
	}

	@Override
	public String asString() {
		return this.name;
	}

	public static PanelStatus fromPhase(@Nullable EventPhase phase) {
		if (phase == null || phase == EventPhase.END) {
			return IDLE;
		}
		return phase == EventPhase.ACTIVE ? ACTIVE : WARNING;
	}
}
