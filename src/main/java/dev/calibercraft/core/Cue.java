package dev.calibercraft.core;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;

/** A named moment in a timeline (drives a sound and an animation key). */
public record Cue(float tick, String name) {
	public static final Codec<Cue> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.FLOAT.fieldOf("t").forGetter(Cue::tick),
		Codec.STRING.fieldOf("cue").forGetter(Cue::name)
	).apply(i, Cue::new));
}
