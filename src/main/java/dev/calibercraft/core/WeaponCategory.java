package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import net.minecraft.util.StringRepresentable;

public enum WeaponCategory implements StringRepresentable {
	PISTOL("pistol"),
	REVOLVER("revolver"),
	SMG("smg"),
	RIFLE("rifle"),
	SHOTGUN("shotgun"),
	SNIPER("sniper"),
	LMG("lmg");

	public static final Codec<WeaponCategory> CODEC = StringRepresentable.fromEnum(WeaponCategory::values);
	private final String name;

	WeaponCategory(String name) {
		this.name = name;
	}

	public boolean oneHandedPose() {
		return this == PISTOL || this == REVOLVER;
	}

	@Override
	public String getSerializedName() {
		return name;
	}
}
