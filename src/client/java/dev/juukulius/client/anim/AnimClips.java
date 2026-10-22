package dev.juukulius.client.anim;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.juukulius.JuliusMod;
import dev.juukulius.animation.JuliusAnim;
import java.io.Reader;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.resources.FileToIdConverter;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.ResourceManagerReloadListener;
import org.jspecify.annotations.Nullable;

/** Loads every animation clip on resource reload, so resource packs can restyle the animations. */
public final class AnimClips implements ResourceManagerReloadListener {
	public static final AnimClips INSTANCE = new AnimClips();
	private static final FileToIdConverter LISTER = FileToIdConverter.json("julius_animations");

	private volatile Map<String, AnimClip> clips = Map.of();

	private AnimClips() {
	}

	public @Nullable AnimClip get(JuliusAnim animation) {
		return this.clips.get(animation.clipName);
	}

	public @Nullable AnimClip get(String name) {
		return this.clips.get(name);
	}

	@Override
	public void onResourceManagerReload(ResourceManager manager) {
		Map<String, AnimClip> loaded = new HashMap<>();
		for (Map.Entry<Identifier, Resource> entry : LISTER.listMatchingResources(manager).entrySet()) {
			Identifier id = LISTER.fileToId(entry.getKey());
			if (!id.getNamespace().equals(JuliusMod.MOD_ID)) {
				continue;
			}

			try (Reader reader = entry.getValue().openAsReader()) {
				JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
				loaded.put(id.getPath(), AnimClip.parse(id.getPath(), json));
			} catch (Exception e) {
				JuliusMod.LOGGER.error("Failed to load Julius animation {}", entry.getKey(), e);
			}
		}

		for (JuliusAnim animation : JuliusAnim.values()) {
			if (!loaded.containsKey(animation.clipName)) {
				JuliusMod.LOGGER.warn("Missing Julius animation clip '{}'", animation.clipName);
			}
		}

		this.clips = Map.copyOf(loaded);
		JuliusMod.LOGGER.info("Loaded {} Julius animation clips", loaded.size());
	}
}
