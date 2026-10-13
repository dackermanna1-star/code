package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.calibercraft.core.StatModifier;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.util.StringRepresentable;

/**
 * Data-driven attachment loaded from {@code data/<ns>/calibercraft/attachment/<id>.json}.
 *
 * @param item      the item that represents this attachment in inventories
 * @param modifiers generic stat modifiers (a weapon may override them per attachment)
 * @param flags     behaviour flags: {@code suppressed}, {@code laser}, {@code bipod}
 * @param optic     sight picture for optics
 */
public record AttachmentDefinition(AttachmentSlot slot, Identifier item, List<StatModifier> modifiers, List<String> flags,
		Optional<Optic> optic) {
	public static final Codec<AttachmentDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
		AttachmentSlot.CODEC.fieldOf("slot").forGetter(AttachmentDefinition::slot),
		Identifier.CODEC.fieldOf("item").forGetter(AttachmentDefinition::item),
		StatModifier.CODEC.listOf().optionalFieldOf("modifiers", List.of()).forGetter(AttachmentDefinition::modifiers),
		Codec.STRING.listOf().optionalFieldOf("flags", List.of()).forGetter(AttachmentDefinition::flags),
		Optic.CODEC.optionalFieldOf("optic").forGetter(AttachmentDefinition::optic)
	).apply(i, AttachmentDefinition::new));

	public boolean hasFlag(String flag) {
		return flags.contains(flag);
	}

	/** @param reticle reticle style shown while aiming; @param overlay full-screen scope overlay */
	public record Optic(Reticle reticle, boolean overlay) {
		public static final Codec<Optic> CODEC = RecordCodecBuilder.create(i -> i.group(
			Reticle.CODEC.fieldOf("reticle").forGetter(Optic::reticle),
			Codec.BOOL.optionalFieldOf("overlay", false).forGetter(Optic::overlay)
		).apply(i, Optic::new));
	}

	public enum Reticle implements StringRepresentable {
		RED_DOT("red_dot"),
		HOLO("holo"),
		ACOG("acog"),
		SCOPE("scope");

		public static final Codec<Reticle> CODEC = StringRepresentable.fromEnum(Reticle::values);
		private final String name;

		Reticle(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return name;
		}
	}
}
