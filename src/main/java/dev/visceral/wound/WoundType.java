package dev.visceral.wound;

import com.mojang.serialization.Codec;
import java.util.Locale;
import net.minecraft.util.StringRepresentable;

/** The physical kind of injury. Decides how it looks, how it bleeds and what particles it throws. */
public enum WoundType implements StringRepresentable {
	/** Clean slash from a blade (swords, hoes, shears, sweeping edges). */
	CUT(true, 3.0F, 6.0F),
	/** Deep, wide chop (axes). */
	GASH(true, 5.0F, 9.0F),
	/** Small deep hole (arrows, tridents, spears, stingers, stalagmites). */
	PUNCTURE(true, 3.0F, 5.0F),
	/** Arc of tooth punctures. */
	BITE(true, 4.0F, 5.0F),
	/** Three parallel scratches. */
	CLAW(true, 3.0F, 5.0F),
	/** Blunt trauma: fists, maces, falls, explosions. Discolours over time instead of bleeding. */
	BRUISE(false, 0.0F, 0.0F),
	/** Fire, lava, lightning. */
	BURN(false, 0.0F, 0.0F);

	public static final Codec<WoundType> CODEC = StringRepresentable.fromEnum(WoundType::values);
	private static final WoundType[] VALUES = values();

	private final boolean bleeds;
	private final float baseBleedSeconds;
	private final float bleedSecondsPerSeverity;

	WoundType(boolean bleeds, float baseBleedSeconds, float bleedSecondsPerSeverity) {
		this.bleeds = bleeds;
		this.baseBleedSeconds = baseBleedSeconds;
		this.bleedSecondsPerSeverity = bleedSecondsPerSeverity;
	}

	public boolean bleeds() {
		return this.bleeds;
	}

	/** How long a wound of this type keeps bleeding, before config scaling. */
	public float bleedSeconds(float severity) {
		return this.bleeds ? this.baseBleedSeconds + this.bleedSecondsPerSeverity * severity : 0.0F;
	}

	@Override
	public String getSerializedName() {
		return this.name().toLowerCase(Locale.ROOT);
	}

	public static WoundType byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : BRUISE;
	}
}
