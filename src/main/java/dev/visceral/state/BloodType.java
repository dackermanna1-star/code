package dev.visceral.state;

import dev.visceral.registry.VisceralTags;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;

/** What comes out when an entity is hurt. Resolved from entity type tags (data-pack configurable). */
public enum BloodType {
	RED(0.48f, 0.02f, 0.02f),
	DARK(0.25f, 0.04f, 0.03f),
	GREEN(0.30f, 0.45f, 0.08f),
	PURPLE(0.38f, 0.08f, 0.45f),
	BONE(0.88f, 0.86f, 0.78f),
	NONE(0, 0, 0);

	public final float r, g, b;

	BloodType(float r, float g, float b) {
		this.r = r;
		this.g = g;
		this.b = b;
	}

	private static final BloodType[] VALUES = values();

	public static BloodType byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : RED;
	}

	public boolean isFluid() {
		return this != BONE && this != NONE;
	}

	public static BloodType of(LivingEntity entity) {
		return of(entity.getType());
	}

	public static BloodType of(EntityType<?> type) {
		if (type.is(VisceralTags.BLOOD_NONE)) return NONE;
		if (type.is(VisceralTags.BLOOD_BONE)) return BONE;
		if (type.is(VisceralTags.BLOOD_GREEN)) return GREEN;
		if (type.is(VisceralTags.BLOOD_PURPLE)) return PURPLE;
		if (type.is(VisceralTags.BLOOD_DARK)) return DARK;
		return RED;
	}
}
