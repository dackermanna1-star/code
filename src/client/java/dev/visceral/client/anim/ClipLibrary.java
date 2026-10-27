package dev.visceral.client.anim;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.visceral.Visceral;
import java.io.Reader;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.ResourceManagerReloadListener;
import org.jspecify.annotations.Nullable;

/** Loads {@link AnimClip}s from resource packs ({@code visceral_animations/*.json}); reloads with F3+T. */
public final class ClipLibrary {
	private static final String DIR = "visceral_animations";
	private static volatile Map<String, AnimClip> clips = Map.of();

	private ClipLibrary() {
	}

	public static void init() {
		ResourceLoader.get(PackType.CLIENT_RESOURCES).registerReloader(Visceral.id("animations"),
			(ResourceManagerReloadListener) ClipLibrary::reload);
	}

	private static void reload(ResourceManager manager) {
		Map<String, AnimClip> loaded = new HashMap<>();
		Map<Identifier, Resource> found = manager.listResources(DIR, id -> id.getPath().endsWith(".json"));
		for (Map.Entry<Identifier, Resource> e : found.entrySet()) {
			Identifier id = e.getKey();
			String path = id.getPath();
			String name = path.substring(DIR.length() + 1, path.length() - ".json".length());
			try (Reader reader = e.getValue().openAsReader()) {
				JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
				loaded.put(name, AnimClip.parse(name, json));
			} catch (Exception ex) {
				Visceral.LOGGER.error("Failed to load animation {}", id, ex);
			}
		}
		clips = Map.copyOf(loaded);
		Visceral.LOGGER.info("Loaded {} Visceral animation clips", loaded.size());
	}

	public static @Nullable AnimClip get(String name) {
		return clips.get(name);
	}
}
