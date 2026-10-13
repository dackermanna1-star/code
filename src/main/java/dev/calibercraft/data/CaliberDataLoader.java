package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import com.mojang.serialization.JsonOps;
import dev.calibercraft.CaliberCraft;
import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.core.Stat;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.resources.FileToIdConverter;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimpleJsonResourceReloadListener;
import net.minecraft.server.packs.resources.SimplePreparableReloadListener;
import net.minecraft.util.profiling.ProfilerFiller;

/**
 * Loads every CaliberCraft definition from data packs:
 * {@code data/<namespace>/calibercraft/{weapon,attachment,ammo,skin}/<path>.json}.
 * Malformed files are logged and skipped by the vanilla scanner; cross references are validated afterwards.
 */
public final class CaliberDataLoader extends SimplePreparableReloadListener<CaliberData> {
	public static final Identifier ID = CaliberCraft.id("definitions");

	@Override
	protected CaliberData prepare(ResourceManager manager, ProfilerFiller profiler) {
		Map<Identifier, WeaponDefinition> weapons = scan(manager, "weapon", WeaponDefinition.CODEC);
		Map<Identifier, AttachmentDefinition> attachments = scan(manager, "attachment", AttachmentDefinition.CODEC);
		Map<Identifier, AmmoDefinition> ammo = scan(manager, "ammo", AmmoDefinition.CODEC);
		Map<Identifier, SkinDefinition> skins = scan(manager, "skin", SkinDefinition.CODEC);
		applyConfigOverrides(weapons);
		return new CaliberData(weapons, attachments, ammo, skins).validated();
	}

	@Override
	protected void apply(CaliberData data, ResourceManager manager, ProfilerFiller profiler) {
		CaliberDataHolder.setServer(data);
		CaliberCraft.LOGGER.info("Loaded {} weapons, {} attachments, {} ammunition types, {} skins",
			data.weapons().size(), data.attachments().size(), data.ammo().size(), data.skins().size());
	}

	private static <T> Map<Identifier, T> scan(ResourceManager manager, String folder, Codec<T> codec) {
		Map<Identifier, T> out = new HashMap<>();
		SimpleJsonResourceReloadListener.scanDirectory(manager, FileToIdConverter.json("calibercraft/" + folder),
			JsonOps.INSTANCE, codec, out);
		return out;
	}

	/** Applies {@code weapon_overrides} from the server config on top of the data pack values. */
	private static void applyConfigOverrides(Map<Identifier, WeaponDefinition> weapons) {
		Map<String, Map<String, Double>> overrides = ServerConfig.get().weaponOverrides;
		if (overrides == null || overrides.isEmpty()) {
			return;
		}
		overrides.forEach((weaponId, stats) -> {
			Identifier id = Identifier.tryParse(weaponId);
			WeaponDefinition def = id == null ? null : weapons.get(id);
			if (def == null) {
				CaliberCraft.LOGGER.warn("Config weapon_overrides references unknown weapon '{}'", weaponId);
				return;
			}
			Map<Stat, Double> parsed = new EnumMap<>(Stat.class);
			stats.forEach((key, value) -> {
				Stat stat = Stat.byKey(key);
				if (stat == null || value == null) {
					CaliberCraft.LOGGER.warn("Config weapon_overrides for {} has unknown stat '{}'", weaponId, key);
				} else {
					parsed.put(stat, value);
				}
			});
			weapons.put(id, def.withStats(def.stats().with(parsed)));
		});
	}
}
