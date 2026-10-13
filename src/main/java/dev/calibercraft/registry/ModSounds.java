package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

/** Registers every sound event listed in tools/assetgen/sounds/README.md. */
public final class ModSounds {
	public static final Map<String, List<String>> WEAPON_MECHANICS = Map.ofEntries(
		Map.entry("m9", List.of("mag_out", "mag_in", "slide_back", "slide_release")),
		Map.entry("revolver", List.of("cylinder_open", "eject", "speedloader", "cylinder_close", "hammer")),
		Map.entry("vector9", List.of("mag_out", "mag_in", "charge")),
		Map.entry("mp5", List.of("mag_out", "mag_in", "charge_back", "charge_slap")),
		Map.entry("ar15", List.of("mag_out", "mag_in", "charge", "bolt_release")),
		Map.entry("ak", List.of("mag_out", "mag_in", "charge")),
		Map.entry("bullpup", List.of("mag_out", "mag_in", "charge")),
		Map.entry("pump_shotgun", List.of("pump_back", "pump_forward", "shell_insert")),
		Map.entry("auto_shotgun", List.of("mag_out", "mag_in", "charge")),
		Map.entry("sniper", List.of("bolt_up", "bolt_back", "bolt_forward", "bolt_down", "mag_out", "mag_in")),
		Map.entry("dmr", List.of("mag_out", "mag_in", "charge")),
		Map.entry("lmg", List.of("cover_open", "box_out", "box_in", "belt", "cover_close", "charge"))
	);
	public static final List<String> WEAPON_COMMON = List.of("fire", "fire_far", "fire_suppressed", "equip");
	public static final List<String> SHARED = List.of(
		"mech.dry_fire", "mech.fire_mode", "mech.overheat", "mech.inspect",
		"casing.brass", "casing.shell",
		"impact.stone", "impact.dirt", "impact.wood", "impact.metal", "impact.glass", "impact.water", "impact.flesh", "impact.soft",
		"bullet.ricochet", "bullet.whiz",
		"hit.marker", "hit.headshot", "hit.kill",
		"ui.attachment_install", "ui.attachment_remove", "ui.click", "ui.skin_apply", "ui.gunsmith_open");

	private static final Map<String, SoundEvent> EVENTS = new HashMap<>();

	public static final SoundEvent DRY_FIRE = register("mech.dry_fire");
	public static final SoundEvent FIRE_MODE = register("mech.fire_mode");
	public static final SoundEvent OVERHEAT = register("mech.overheat");
	public static final SoundEvent INSPECT = register("mech.inspect");
	public static final SoundEvent ATTACHMENT_INSTALL = register("ui.attachment_install");
	public static final SoundEvent ATTACHMENT_REMOVE = register("ui.attachment_remove");
	public static final SoundEvent SKIN_APPLY = register("ui.skin_apply");
	public static final SoundEvent GUNSMITH_OPEN = register("ui.gunsmith_open");

	static {
		for (String s : SHARED) {
			register(s);
		}
		WEAPON_MECHANICS.forEach((weapon, mech) -> {
			for (String e : WEAPON_COMMON) {
				register("weapon." + weapon + "." + e);
			}
			for (String e : mech) {
				register("weapon." + weapon + "." + e);
			}
		});
	}

	private ModSounds() {
	}

	private static SoundEvent register(String path) {
		SoundEvent existing = EVENTS.get(path);
		if (existing != null) {
			return existing;
		}
		Identifier id = CaliberCraft.id(path);
		SoundEvent ev = Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
		EVENTS.put(path, ev);
		return ev;
	}

	/** Registered event for {@code calibercraft:<path>}, or null if no such sound exists. */
	public static SoundEvent get(String path) {
		return EVENTS.get(path);
	}

	public static void init() {
	}
}
