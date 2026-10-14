package net.abyssaldescent.entity;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;

/** Persistent bookkeeping attached to every enemy spawned by the dungeon. */
public record MobInfo(int runSlot, int roomId, int floor, int affix) {
	public static final Codec<MobInfo> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.fieldOf("run").forGetter(MobInfo::runSlot),
		Codec.INT.fieldOf("room").forGetter(MobInfo::roomId),
		Codec.INT.fieldOf("floor").forGetter(MobInfo::floor),
		Codec.INT.optionalFieldOf("affix", -1).forGetter(MobInfo::affix)
	).apply(i, MobInfo::new));

	public boolean elite() {
		return affix >= 0;
	}

	public EliteAffix eliteAffix() {
		return affix < 0 ? null : EliteAffix.byId(affix);
	}
}
