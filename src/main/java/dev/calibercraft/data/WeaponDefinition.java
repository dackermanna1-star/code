package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.calibercraft.core.ActionType;
import dev.calibercraft.core.FireMode;
import dev.calibercraft.core.ReloadSpec;
import dev.calibercraft.core.StatBlock;
import dev.calibercraft.core.StatModifier;
import dev.calibercraft.core.Timeline;
import dev.calibercraft.core.WeaponCategory;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Immutable, data-driven weapon definition loaded from {@code data/<ns>/calibercraft/weapon/<id>.json}.
 * The definition id equals the weapon item's registry id.
 *
 * @param caliber             ammunition caliber accepted (see {@link AmmoDefinition#caliber()})
 * @param cycle               manual action timeline: bolt/pump stroke, or the charging handle for
 *                            self-loading weapons whose chamber is empty
 * @param attachments         allowed attachments per slot
 * @param defaultAttachments  attachments pre-installed on new weapons
 * @param attachmentOverrides weapon-specific modifier lists replacing an attachment's generic modifiers
 * @param skins               allowed skins (empty = every skin)
 * @param soundSet            sound event prefix ({@code weapon.<set>.*}); defaults to the weapon path
 */
public record WeaponDefinition(
	WeaponCategory category,
	Identifier caliber,
	List<FireMode> fireModes,
	int burstCount,
	ActionType action,
	StatBlock stats,
	ReloadSpec reload,
	Timeline cycle,
	Map<AttachmentSlot, List<Identifier>> attachments,
	Map<AttachmentSlot, Identifier> defaultAttachments,
	Map<Identifier, List<StatModifier>> attachmentOverrides,
	List<Identifier> skins,
	Optional<String> soundSet
) {
	public static final Codec<WeaponDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
		WeaponCategory.CODEC.fieldOf("category").forGetter(WeaponDefinition::category),
		Identifier.CODEC.fieldOf("caliber").forGetter(WeaponDefinition::caliber),
		FireMode.CODEC.listOf(1, 3).fieldOf("fire_modes").forGetter(WeaponDefinition::fireModes),
		Codec.intRange(1, 10).optionalFieldOf("burst_count", 3).forGetter(WeaponDefinition::burstCount),
		ActionType.CODEC.fieldOf("action").forGetter(WeaponDefinition::action),
		StatBlock.CODEC.fieldOf("stats").forGetter(WeaponDefinition::stats),
		ReloadSpec.CODEC.fieldOf("reload").forGetter(WeaponDefinition::reload),
		Timeline.CODEC.optionalFieldOf("cycle", Timeline.NONE).forGetter(WeaponDefinition::cycle),
		Codec.unboundedMap(AttachmentSlot.CODEC, Identifier.CODEC.listOf()).optionalFieldOf("attachments", Map.of())
			.forGetter(WeaponDefinition::attachments),
		Codec.unboundedMap(AttachmentSlot.CODEC, Identifier.CODEC).optionalFieldOf("default_attachments", Map.of())
			.forGetter(WeaponDefinition::defaultAttachments),
		Codec.unboundedMap(Identifier.CODEC, StatModifier.CODEC.listOf()).optionalFieldOf("attachment_overrides", Map.of())
			.forGetter(WeaponDefinition::attachmentOverrides),
		Identifier.CODEC.listOf().optionalFieldOf("skins", List.of()).forGetter(WeaponDefinition::skins),
		Codec.STRING.optionalFieldOf("sound_set").forGetter(WeaponDefinition::soundSet)
	).apply(i, WeaponDefinition::new));

	public boolean allows(AttachmentSlot slot, Identifier attachment) {
		List<Identifier> list = attachments.get(slot);
		return list != null && list.contains(attachment);
	}

	public boolean hasSlot(AttachmentSlot slot) {
		List<Identifier> list = attachments.get(slot);
		return list != null && !list.isEmpty();
	}

	public boolean allowsSkin(Identifier skin) {
		return skins.isEmpty() || skins.contains(skin);
	}

	public FireMode fireMode(int index) {
		return fireModes.get(Math.floorMod(index, fireModes.size()));
	}

	public String soundSet(Identifier weaponId) {
		return soundSet.orElse(weaponId.getPath());
	}

	public WeaponDefinition withStats(StatBlock newStats) {
		return new WeaponDefinition(category, caliber, fireModes, burstCount, action, newStats, reload, cycle, attachments,
			defaultAttachments, attachmentOverrides, skins, soundSet);
	}
}
