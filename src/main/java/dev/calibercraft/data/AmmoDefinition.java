package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.calibercraft.core.StatModifier;
import java.util.List;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ExtraCodecs;

/**
 * Ammunition type loaded from {@code data/<ns>/calibercraft/ammo/<id>.json}. Weapons accept every ammo
 * type of their caliber; special types trade stats through ordinary {@link StatModifier}s.
 *
 * @param fireSeconds seconds of fire applied to living targets (incendiary rounds)
 * @param tracerColor ARGB colour of the tracer
 * @param order       display order within the caliber (0 = standard)
 */
public record AmmoDefinition(Identifier caliber, Identifier item, List<StatModifier> modifiers, int fireSeconds,
		int tracerColor, int order) {
	public static final Codec<AmmoDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
		Identifier.CODEC.fieldOf("caliber").forGetter(AmmoDefinition::caliber),
		Identifier.CODEC.fieldOf("item").forGetter(AmmoDefinition::item),
		StatModifier.CODEC.listOf().optionalFieldOf("modifiers", List.of()).forGetter(AmmoDefinition::modifiers),
		Codec.intRange(0, 30).optionalFieldOf("fire_seconds", 0).forGetter(AmmoDefinition::fireSeconds),
		ExtraCodecs.STRING_RGB_COLOR.optionalFieldOf("tracer_color", 0xFFFFD27F).forGetter(AmmoDefinition::tracerColor),
		Codec.INT.optionalFieldOf("order", 0).forGetter(AmmoDefinition::order)
	).apply(i, AmmoDefinition::new));
}
