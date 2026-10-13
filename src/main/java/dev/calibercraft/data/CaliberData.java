package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.calibercraft.CaliberCraft;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Immutable snapshot of every data-driven definition. One snapshot is active on the server (rebuilt on
 * {@code /reload}) and one on the client (received from the server), see {@link CaliberDataHolder}.
 */
public final class CaliberData {
	public static final CaliberData EMPTY = new CaliberData(Map.of(), Map.of(), Map.of(), Map.of());

	public static final Codec<CaliberData> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.unboundedMap(Identifier.CODEC, WeaponDefinition.CODEC).fieldOf("weapons").forGetter(CaliberData::weapons),
		Codec.unboundedMap(Identifier.CODEC, AttachmentDefinition.CODEC).fieldOf("attachments").forGetter(CaliberData::attachments),
		Codec.unboundedMap(Identifier.CODEC, AmmoDefinition.CODEC).fieldOf("ammo").forGetter(CaliberData::ammo),
		Codec.unboundedMap(Identifier.CODEC, SkinDefinition.CODEC).fieldOf("skins").forGetter(CaliberData::skins)
	).apply(i, CaliberData::new));

	private final Map<Identifier, WeaponDefinition> weapons;
	private final Map<Identifier, AttachmentDefinition> attachments;
	private final Map<Identifier, AmmoDefinition> ammo;
	private final Map<Identifier, SkinDefinition> skins;
	private final Map<Identifier, Identifier> attachmentByItem = new HashMap<>();
	private final Map<Identifier, Identifier> ammoByItem = new HashMap<>();
	private final Map<Identifier, List<Identifier>> ammoByCaliber = new HashMap<>();
	private final List<Identifier> sortedSkins;

	public CaliberData(Map<Identifier, WeaponDefinition> weapons, Map<Identifier, AttachmentDefinition> attachments,
			Map<Identifier, AmmoDefinition> ammo, Map<Identifier, SkinDefinition> skins) {
		this.weapons = Map.copyOf(weapons);
		this.attachments = Map.copyOf(attachments);
		this.ammo = Map.copyOf(ammo);
		this.skins = Map.copyOf(skins);
		this.attachments.forEach((id, def) -> attachmentByItem.put(def.item(), id));
		this.ammo.forEach((id, def) -> {
			ammoByItem.put(def.item(), id);
			ammoByCaliber.computeIfAbsent(def.caliber(), k -> new ArrayList<>()).add(id);
		});
		ammoByCaliber.values().forEach(list -> list.sort(Comparator.comparingInt((Identifier id) -> this.ammo.get(id).order())
			.thenComparing(Identifier::toString)));
		List<Identifier> s = new ArrayList<>(this.skins.keySet());
		s.sort(Comparator.comparingInt((Identifier id) -> this.skins.get(id).order()).thenComparing(Identifier::toString));
		this.sortedSkins = List.copyOf(s);
	}

	public Map<Identifier, WeaponDefinition> weapons() {
		return weapons;
	}

	public Map<Identifier, AttachmentDefinition> attachments() {
		return attachments;
	}

	public Map<Identifier, AmmoDefinition> ammo() {
		return ammo;
	}

	public Map<Identifier, SkinDefinition> skins() {
		return skins;
	}

	public Optional<WeaponDefinition> weapon(Identifier id) {
		return Optional.ofNullable(weapons.get(id));
	}

	public Optional<AttachmentDefinition> attachment(Identifier id) {
		return Optional.ofNullable(attachments.get(id));
	}

	public Optional<Identifier> attachmentForItem(Identifier itemId) {
		return Optional.ofNullable(attachmentByItem.get(itemId));
	}

	public Optional<Identifier> ammoForItem(Identifier itemId) {
		return Optional.ofNullable(ammoByItem.get(itemId));
	}

	/** Ammunition types of a caliber, standard type first. */
	public List<Identifier> ammoForCaliber(Identifier caliber) {
		return ammoByCaliber.getOrDefault(caliber, List.of());
	}

	public List<Identifier> sortedSkins() {
		return sortedSkins;
	}

	/**
	 * Drops references that would break gameplay (unknown attachments/ammo, slot mismatches, defaults not in
	 * the allowed list) and logs an actionable warning for each.
	 */
	public CaliberData validated() {
		Map<Identifier, WeaponDefinition> fixed = new LinkedHashMap<>();
		weapons.forEach((id, def) -> {
			Map<AttachmentSlot, List<Identifier>> allowed = new EnumMap<>(AttachmentSlot.class);
			def.attachments().forEach((slot, list) -> {
				List<Identifier> ok = new ArrayList<>();
				for (Identifier a : list) {
					AttachmentDefinition ad = attachments.get(a);
					if (ad == null) {
						CaliberCraft.LOGGER.warn("Weapon {} allows unknown attachment {} in slot {}; ignoring it", id, a, slot.getSerializedName());
					} else if (ad.slot() != slot) {
						CaliberCraft.LOGGER.warn("Weapon {} lists attachment {} under slot {} but it is a {} attachment; ignoring it",
							id, a, slot.getSerializedName(), ad.slot().getSerializedName());
					} else {
						ok.add(a);
					}
				}
				allowed.put(slot, List.copyOf(ok));
			});
			Map<AttachmentSlot, Identifier> defaults = new EnumMap<>(AttachmentSlot.class);
			def.defaultAttachments().forEach((slot, a) -> {
				if (allowed.getOrDefault(slot, List.of()).contains(a)) {
					defaults.put(slot, a);
				} else {
					CaliberCraft.LOGGER.warn("Weapon {} default attachment {} is not allowed in slot {}; ignoring it", id, a, slot.getSerializedName());
				}
			});
			if (ammoForCaliber(def.caliber()).isEmpty()) {
				CaliberCraft.LOGGER.warn("Weapon {} uses caliber {} but no ammunition of that caliber is defined", id, def.caliber());
			}
			fixed.put(id, new WeaponDefinition(def.category(), def.caliber(), def.fireModes(), def.burstCount(), def.action(), def.stats(),
				def.reload(), def.cycle(), allowed, defaults, def.attachmentOverrides(), def.skins(), def.soundSet()));
		});
		return new CaliberData(fixed, attachments, ammo, skins);
	}
}
