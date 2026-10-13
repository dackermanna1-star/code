package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.ExtraCodecs;
import net.minecraft.util.StringRepresentable;

/**
 * Cosmetic finish loaded from {@code data/<ns>/calibercraft/skin/<id>.json}. Skins never change stats.
 * Visuals come from the resource pack: item model definitions select on custom model data string 0.
 *
 * @param requiresKit applying it in survival consumes a Prismatic Finish Kit (server config can disable)
 * @param swatch      colour shown in the gunsmith UI
 */
public record SkinDefinition(Rarity rarity, boolean requiresKit, int swatch, int order) {
	public static final Codec<SkinDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
		Rarity.CODEC.optionalFieldOf("rarity", Rarity.COMMON).forGetter(SkinDefinition::rarity),
		Codec.BOOL.optionalFieldOf("requires_kit", false).forGetter(SkinDefinition::requiresKit),
		ExtraCodecs.STRING_RGB_COLOR.optionalFieldOf("swatch", 0xFF404040).forGetter(SkinDefinition::swatch),
		Codec.INT.optionalFieldOf("order", 0).forGetter(SkinDefinition::order)
	).apply(i, SkinDefinition::new));

	public enum Rarity implements StringRepresentable {
		COMMON("common", 0xFFFFFF),
		RARE("rare", 0x55AAFF),
		LEGENDARY("legendary", 0xFFAA00);

		public static final Codec<Rarity> CODEC = StringRepresentable.fromEnum(Rarity::values);
		private final String name;
		public final int color;

		Rarity(String name, int color) {
			this.name = name;
			this.color = color;
		}

		@Override
		public String getSerializedName() {
			return name;
		}
	}
}
