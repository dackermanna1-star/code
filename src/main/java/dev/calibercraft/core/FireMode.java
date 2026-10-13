package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import net.minecraft.util.StringRepresentable;

public enum FireMode implements StringRepresentable {
	SEMI("semi"),
	BURST("burst"),
	AUTO("auto");

	public static final Codec<FireMode> CODEC = StringRepresentable.fromEnum(FireMode::values);
	private final String name;

	FireMode(String name) {
		this.name = name;
	}

	@Override
	public String getSerializedName() {
		return name;
	}
}
