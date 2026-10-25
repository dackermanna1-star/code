package com.modernapartments.build;

import com.modernapartments.build.complex.CourtyardBuilder;
import com.modernapartments.build.complex.MetropolitanBuilder;
import com.modernapartments.build.complex.ParksideBuilder;
import com.modernapartments.build.complex.SkylineBuilder;
import com.modernapartments.build.complex.UrbanLoftsBuilder;
import java.util.Locale;
import java.util.function.Supplier;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/**
 * The five complexes. Plot sizes are fixed so placement previews and world generation can reserve
 * the exact footprint before a building is generated.
 */
public enum ComplexType {
	METROPOLITAN("metropolitan", 64, 116, 60, 6, MetropolitanBuilder::new),
	PARKSIDE("parkside", 96, 40, 84, 1, ParksideBuilder::new),
	SKYLINE("skyline", 60, 200, 60, 6, SkylineBuilder::new),
	COURTYARD("courtyard", 112, 36, 100, 4, CourtyardBuilder::new),
	URBAN_LOFTS("urban_lofts", 72, 56, 60, 1, UrbanLoftsBuilder::new);

	private final String id;
	private final int sizeX;
	private final int sizeY;
	private final int sizeZ;
	private final int groundY;
	private final Supplier<ComplexBuilder> builder;

	ComplexType(String id, int sizeX, int sizeY, int sizeZ, int groundY, Supplier<ComplexBuilder> builder) {
		this.id = id;
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.sizeZ = sizeZ;
		this.groundY = groundY;
		this.builder = builder;
	}

	public String id() {
		return id;
	}

	public int sizeX() {
		return sizeX;
	}

	public int sizeY() {
		return sizeY;
	}

	public int sizeZ() {
		return sizeZ;
	}

	/** Local y of the ground-surface layer (the block layer you walk on outside). */
	public int groundY() {
		return groundY;
	}

	public Component displayName() {
		return Component.translatable("structure.modernapartments." + id);
	}

	public ComplexBuilder newBuilder() {
		return builder.get();
	}

	public static @Nullable ComplexType byId(String id) {
		String key = id.toLowerCase(Locale.ROOT);
		for (ComplexType t : values()) {
			if (t.id.equals(key)) {
				return t;
			}
		}
		return null;
	}
}
