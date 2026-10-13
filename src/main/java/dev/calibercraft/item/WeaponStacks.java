package dev.calibercraft.item;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.core.GunState;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.StatModifier;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.AmmoDefinition;
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.registry.ModComponents;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomModelData;

/** Helpers for reading and writing weapon ItemStacks. */
public final class WeaponStacks {
	public static final Identifier STANDARD_SKIN = CaliberCraft.id("standard");

	private WeaponStacks() {
	}

	public static boolean isFirearm(ItemStack stack) {
		return stack.getItem() instanceof FirearmItem;
	}

	public static Optional<Identifier> weaponId(ItemStack stack) {
		return stack.getItem() instanceof FirearmItem f ? Optional.of(f.weaponId()) : Optional.empty();
	}

	public static Optional<WeaponDefinition> definition(ItemStack stack, CaliberData data) {
		return weaponId(stack).flatMap(data::weapon);
	}

	public static GunState state(ItemStack stack) {
		return stack.getOrDefault(ModComponents.GUN_STATE, GunState.EMPTY);
	}

	public static AttachmentLoadout loadout(ItemStack stack) {
		return stack.getOrDefault(ModComponents.ATTACHMENTS, AttachmentLoadout.EMPTY);
	}

	public static Identifier skin(ItemStack stack) {
		return stack.getOrDefault(ModComponents.SKIN, STANDARD_SKIN);
	}

	/** Ammunition type that is loaded, or would be loaded by the next reload. */
	public static Optional<Identifier> activeAmmo(GunState s, WeaponDefinition def, CaliberData data) {
		if (s.loadedAmmo().isPresent() && s.total() > 0) {
			return s.loadedAmmo();
		}
		return selectedAmmo(s, def, data);
	}

	/** Ammunition type the next reload will load (falls back to the caliber's standard type). */
	public static Optional<Identifier> selectedAmmo(GunState s, WeaponDefinition def, CaliberData data) {
		List<Identifier> options = data.ammoForCaliber(def.caliber());
		if (s.selectedAmmo().isPresent() && options.contains(s.selectedAmmo().get())) {
			return s.selectedAmmo();
		}
		return options.isEmpty() ? Optional.empty() : Optional.of(options.getFirst());
	}

	/** Every modifier affecting this configuration, attachments first, then ammunition. */
	public static List<StatModifier> modifiers(WeaponDefinition def, AttachmentLoadout loadout, Optional<Identifier> ammo, CaliberData data) {
		List<StatModifier> out = new ArrayList<>();
		for (Map.Entry<AttachmentSlot, Identifier> e : loadout.slots().entrySet()) {
			if (!def.allows(e.getKey(), e.getValue())) {
				continue; // stale/invalid data is ignored rather than trusted
			}
			List<StatModifier> override = def.attachmentOverrides().get(e.getValue());
			if (override != null) {
				out.addAll(override);
			} else {
				data.attachment(e.getValue()).ifPresent(a -> out.addAll(a.modifiers()));
			}
		}
		ammo.flatMap(id -> Optional.ofNullable(data.ammo().get(id))).map(AmmoDefinition::modifiers).ifPresent(out::addAll);
		return out;
	}

	public static WeaponStats stats(WeaponDefinition def, AttachmentLoadout loadout, Optional<Identifier> ammo, CaliberData data) {
		return WeaponStats.compute(def.stats(), modifiers(def, loadout, ammo, data));
	}

	public static Optional<WeaponStats> stats(ItemStack stack, CaliberData data) {
		return definition(stack, data).map(def -> stats(def, loadout(stack), activeAmmo(state(stack), def, data), data));
	}

	public static boolean hasFlag(ItemStack stack, CaliberData data, String flag) {
		Optional<WeaponDefinition> def = definition(stack, data);
		if (def.isEmpty()) {
			return false;
		}
		for (Map.Entry<AttachmentSlot, Identifier> e : loadout(stack).slots().entrySet()) {
			if (def.get().allows(e.getKey(), e.getValue())) {
				Optional<AttachmentDefinition> a = data.attachment(e.getValue());
				if (a.isPresent() && a.get().hasFlag(flag)) {
					return true;
				}
			}
		}
		return false;
	}

	public static Optional<AttachmentDefinition> optic(ItemStack stack, CaliberData data) {
		return loadout(stack).get(AttachmentSlot.OPTIC).flatMap(data::attachment);
	}

	/** Rewrites the vanilla custom-model-data strings that select skin and attachment models. */
	public static void refreshAppearance(ItemStack stack) {
		String[] strings = new String[AttachmentSlot.MODEL_DATA_SIZE];
		Arrays.fill(strings, "");
		strings[0] = skin(stack).toString();
		loadout(stack).slots().forEach((slot, id) -> strings[slot.modelIndex] = id.toString());
		stack.set(DataComponents.CUSTOM_MODEL_DATA, new CustomModelData(List.of(), List.of(), List.of(strings), List.of()));
	}

	/**
	 * Gives a freshly created/crafted/looted weapon its default attachments and an empty state. Safe to call
	 * repeatedly: stacks that already have a state are left untouched.
	 */
	public static boolean ensureInitialized(ItemStack stack, CaliberData data) {
		if (!isFirearm(stack) || stack.has(ModComponents.GUN_STATE)) {
			return false;
		}
		Optional<WeaponDefinition> def = definition(stack, data);
		if (def.isEmpty()) {
			return false; // definitions not loaded (yet); try again later
		}
		if (!stack.has(ModComponents.ATTACHMENTS)) {
			stack.set(ModComponents.ATTACHMENTS, new AttachmentLoadout(def.get().defaultAttachments()));
		}
		GunState s = GunState.EMPTY.withSelectedAmmo(selectedAmmo(GunState.EMPTY, def.get(), data));
		stack.set(ModComponents.GUN_STATE, s);
		refreshAppearance(stack);
		return true;
	}

	/** Creates a weapon stack with default attachments; optionally fully loaded (+1 chambered). */
	public static ItemStack create(Item item, CaliberData data, boolean loaded) {
		ItemStack stack = new ItemStack(item);
		ensureInitialized(stack, data);
		if (loaded) {
			Optional<WeaponDefinition> def = definition(stack, data);
			if (def.isPresent()) {
				WeaponStats st = stats(def.get(), loadout(stack), selectedAmmo(GunState.EMPTY, def.get(), data), data);
				GunState s = state(stack);
				Optional<Identifier> ammo = selectedAmmo(s, def.get(), data);
				int cap = st.i(Stat.MAGAZINE);
				boolean chamber = def.get().action().usesChamber();
				stack.set(ModComponents.GUN_STATE, s.withRounds(cap).withChambered(chamber).withLoadedAmmo(ammo));
			}
		}
		return stack;
	}
}
