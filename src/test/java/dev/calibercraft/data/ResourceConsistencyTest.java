package dev.calibercraft.data;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.Codec;
import com.mojang.serialization.JsonOps;
import dev.calibercraft.core.ReloadSpec;
import dev.calibercraft.core.Timeline;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Checks that the shipped data and assets are complete and consistent: every definition decodes with its codec,
 * cross-references resolve, and every model, texture, sound and translation that something points at exists.
 * Registry-level checks (every registered item/sound has assets) live in the server game tests.
 */
class ResourceConsistencyTest {
	private static final Path RES = Path.of("src/main/resources");
	private static final Path ASSETS = RES.resolve("assets/calibercraft");
	private static final Path DATA = RES.resolve("data/calibercraft");
	private static final String NS = "calibercraft";

	private static CaliberData data;
	private static JsonObject lang;

	@BeforeAll
	static void load() throws IOException {
		data = new CaliberData(decodeAll("weapon", WeaponDefinition.CODEC), decodeAll("attachment", AttachmentDefinition.CODEC),
			decodeAll("ammo", AmmoDefinition.CODEC), decodeAll("skin", SkinDefinition.CODEC));
		lang = read(ASSETS.resolve("lang/en_us.json")).getAsJsonObject();
	}

	private static JsonElement read(Path p) throws IOException {
		try (Reader r = Files.newBufferedReader(p)) {
			return JsonParser.parseReader(r);
		}
	}

	private static List<Path> jsonFiles(Path dir) throws IOException {
		if (!Files.isDirectory(dir)) {
			return List.of();
		}
		try (Stream<Path> s = Files.walk(dir)) {
			return s.filter(p -> p.toString().endsWith(".json")).sorted().toList();
		}
	}

	private static String stem(Path root, Path file) {
		String rel = root.relativize(file).toString().replace('\\', '/');
		return rel.substring(0, rel.length() - ".json".length());
	}

	private static <T> Map<Identifier, T> decodeAll(String folder, Codec<T> codec) throws IOException {
		Path dir = DATA.resolve("calibercraft").resolve(folder);
		Map<Identifier, T> out = new HashMap<>();
		for (Path f : jsonFiles(dir)) {
			JsonElement json = read(f);
			T value = codec.parse(JsonOps.INSTANCE, json).getOrThrow(msg -> new AssertionError(f + ": " + msg));
			out.put(Identifier.fromNamespaceAndPath(NS, stem(dir, f)), value);
		}
		return out;
	}

	/** Visits every string value in a JSON tree together with the key it is stored under (null in arrays). */
	private static void strings(JsonElement e, String key, BiConsumer<String, String> visitor) {
		if (e.isJsonObject()) {
			e.getAsJsonObject().entrySet().forEach(en -> strings(en.getValue(), en.getKey(), visitor));
		} else if (e.isJsonArray()) {
			e.getAsJsonArray().forEach(c -> strings(c, key, visitor));
		} else if (e.isJsonPrimitive() && e.getAsJsonPrimitive().isString()) {
			visitor.accept(key, e.getAsString());
		}
	}

	private static String ownPath(String ref) {
		return ref.startsWith(NS + ":") ? ref.substring(NS.length() + 1) : null;
	}

	private static boolean itemExists(String path) {
		return Files.isRegularFile(ASSETS.resolve("items/" + path + ".json"));
	}

	private static void report(List<String> problems) {
		if (!problems.isEmpty()) {
			fail(problems.size() + " problem(s):\n  " + String.join("\n  ", problems.subList(0, Math.min(40, problems.size()))));
		}
	}

	@Test
	void everyJsonFileParses() throws IOException {
		List<String> problems = new ArrayList<>();
		for (Path f : jsonFiles(RES)) {
			try {
				read(f);
			} catch (RuntimeException ex) {
				problems.add(f + ": " + ex.getMessage());
			}
		}
		report(problems);
	}

	@Test
	void contentMeetsTheMinimumScope() {
		assertTrue(data.weapons().size() >= 12, "at least 12 weapons, got " + data.weapons().size());
		assertTrue(data.attachments().size() >= 20, "attachments: " + data.attachments().size());
		assertTrue(data.skins().size() >= 5, "skins: " + data.skins().size());
		int variants = 0;
		for (WeaponDefinition def : data.weapons().values()) {
			variants += def.skins().isEmpty() ? data.skins().size() : def.skins().size();
		}
		assertTrue(variants >= 60, "at least 60 weapon skin variants, got " + variants);
	}

	@Test
	void weaponDefinitionsAreConsistent() {
		List<String> problems = new ArrayList<>();
		data.weapons().forEach((id, def) -> {
			def.attachments().forEach((slot, list) -> list.forEach(a -> {
				AttachmentDefinition ad = data.attachments().get(a);
				if (ad == null) {
					problems.add(id + " allows unknown attachment " + a);
				} else if (ad.slot() != slot) {
					problems.add(id + " lists " + a + " under " + slot + " but it is a " + ad.slot() + " attachment");
				}
			}));
			def.defaultAttachments().forEach((slot, a) -> {
				if (!def.attachments().getOrDefault(slot, List.of()).contains(a)) {
					problems.add(id + " default " + a + " is not allowed in slot " + slot);
				}
			});
			if (data.ammoForCaliber(def.caliber()).isEmpty()) {
				problems.add(id + " has no ammunition for caliber " + def.caliber());
			}
			for (Identifier skin : def.skins()) {
				if (!data.skins().containsKey(skin)) {
					problems.add(id + " lists unknown skin " + skin);
				}
			}
			if (def.fireModes().isEmpty()) {
				problems.add(id + " has no fire modes");
			}
			checkTimeline(problems, id + " cycle", def.cycle());
			ReloadSpec reload = def.reload();
			if (reload.type() == ReloadSpec.Type.SINGLE) {
				if (reload.single().isEmpty()) {
					problems.add(id + " uses single-round reloading without a 'single' section");
				}
			} else {
				checkTimeline(problems, id + " tactical reload", reload.tactical());
				checkTimeline(problems, id + " empty reload", reload.empty());
				if (reload.tactical().length() <= 0 && reload.empty().length() <= 0) {
					problems.add(id + " has no reload timeline");
				}
			}
			if (!itemExists(id.getPath())) {
				problems.add(id + " has no item model definition");
			}
			if (!Files.isRegularFile(ASSETS.resolve("weapon_render/" + id.getPath() + ".json"))) {
				problems.add(id + " has no weapon_render file");
			}
		});
		report(problems);
	}

	private static void checkTimeline(List<String> problems, String what, Timeline t) {
		if (t.length() <= 0) {
			return; // not used by this weapon
		}
		if (t.commit() > t.length() || t.chamber() > t.length()) {
			problems.add(what + " has an invalid timeline: " + t);
		}
	}

	@Test
	void attachmentAndAmmoItemsExist() {
		List<String> problems = new ArrayList<>();
		data.attachments().forEach((id, def) -> {
			if (!def.item().getNamespace().equals(NS) || !itemExists(def.item().getPath())) {
				problems.add("attachment " + id + " item " + def.item() + " has no item model definition");
			}
		});
		data.ammo().forEach((id, def) -> {
			if (!def.item().getNamespace().equals(NS) || !itemExists(def.item().getPath())) {
				problems.add("ammo " + id + " item " + def.item() + " has no item model definition");
			}
		});
		report(problems);
	}

	@Test
	void itemModelDefinitionsReferenceExistingModels() throws IOException {
		List<String> problems = new ArrayList<>();
		for (Path f : jsonFiles(ASSETS.resolve("items"))) {
			strings(read(f), null, (key, value) -> {
				String path = ownPath(value);
				if ("model".equals(key) && path != null && !Files.isRegularFile(ASSETS.resolve("models/" + path + ".json"))) {
					problems.add(f + " -> missing model " + value);
				}
			});
		}
		report(problems);
	}

	@Test
	void modelsReferenceExistingParentsAndTextures() throws IOException {
		List<String> problems = new ArrayList<>();
		for (Path f : jsonFiles(ASSETS.resolve("models"))) {
			JsonObject model = read(f).getAsJsonObject();
			if (model.has("parent")) {
				String path = ownPath(model.get("parent").getAsString());
				if (path != null && !Files.isRegularFile(ASSETS.resolve("models/" + path + ".json"))) {
					problems.add(f + " -> missing parent " + model.get("parent").getAsString());
				}
			}
			if (model.has("textures")) {
				model.getAsJsonObject("textures").entrySet().forEach(en -> {
					String path = ownPath(en.getValue().getAsString());
					if (path != null && !Files.isRegularFile(ASSETS.resolve("textures/" + path + ".png"))) {
						problems.add(f + " -> missing texture " + en.getValue().getAsString());
					}
				});
			}
		}
		for (Path f : jsonFiles(ASSETS.resolve("blockstates"))) {
			strings(read(f), null, (key, value) -> {
				String path = ownPath(value);
				if ("model".equals(key) && path != null && !Files.isRegularFile(ASSETS.resolve("models/" + path + ".json"))) {
					problems.add(f + " -> missing model " + value);
				}
			});
		}
		for (Path f : jsonFiles(ASSETS.resolve("particles"))) {
			strings(read(f), null, (key, value) -> {
				String path = ownPath(value);
				if (path != null && !Files.isRegularFile(ASSETS.resolve("textures/particle/" + path + ".png"))) {
					problems.add(f + " -> missing particle texture " + value);
				}
			});
		}
		report(problems);
	}

	@Test
	void modelFacesUseResolvableTextureVariables() throws IOException {
		Path models = ASSETS.resolve("models");
		Map<String, JsonObject> byId = new HashMap<>();
		for (Path f : jsonFiles(models)) {
			byId.put(NS + ":" + stem(models, f), read(f).getAsJsonObject());
		}
		// Templates leave variables to their children, so resolve from every concrete (leaf) model.
		java.util.Set<String> parents = new java.util.HashSet<>();
		byId.values().forEach(m -> {
			if (m.has("parent")) {
				parents.add(m.get("parent").getAsString());
			}
		});
		java.util.Set<String> problems = new java.util.TreeSet<>();
		byId.keySet().stream().filter(id -> !parents.contains(id)).forEach(id -> {
			JsonObject withElements = null;
			for (String cur = id; cur != null && byId.containsKey(cur); ) {
				JsonObject m = byId.get(cur);
				if (m.has("elements")) {
					withElements = m;
					break;
				}
				cur = m.has("parent") ? m.get("parent").getAsString() : null;
			}
			if (withElements == null) {
				return;
			}
			withElements.getAsJsonArray("elements").forEach(e -> e.getAsJsonObject().getAsJsonObject("faces").entrySet().forEach(face -> {
				String tex = face.getValue().getAsJsonObject().get("texture").getAsString();
				if (!tex.startsWith("#")) {
					problems.add(id + " face uses a texture id instead of a #variable: " + tex);
				} else if (resolveTexture(byId, id, tex, 0) == null) {
					problems.add(id + " face texture " + tex + " does not resolve");
				}
			}));
		});
		report(new ArrayList<>(problems));
	}

	/** Resolves a texture variable through the model's own textures and its parents (vanilla parents are not followed). */
	private static String resolveTexture(Map<String, JsonObject> models, String id, String ref, int depth) {
		JsonObject model = models.get(id);
		if (model == null || depth > 16) {
			return null;
		}
		String var = ref.substring(1);
		// Variables resolve from the most specific model (the one being rendered) upward, so check the chain.
		for (String cur = id; cur != null && models.containsKey(cur); ) {
			JsonObject m = models.get(cur);
			if (m.has("textures") && m.getAsJsonObject("textures").has(var)) {
				String value = m.getAsJsonObject("textures").get(var).getAsString();
				return value.startsWith("#") ? resolveTexture(models, id, value, depth + 1) : value;
			}
			cur = m.has("parent") ? m.get("parent").getAsString() : null;
		}
		return null;
	}

	@Test
	void soundsHaveFilesAndSubtitles() throws IOException {
		List<String> problems = new ArrayList<>();
		JsonObject sounds = read(ASSETS.resolve("sounds.json")).getAsJsonObject();
		assertTrue(sounds.size() > 50, "sounds.json defines " + sounds.size() + " events");
		sounds.entrySet().forEach(en -> {
			JsonObject event = en.getValue().getAsJsonObject();
			if (event.has("subtitle") && !lang.has(event.get("subtitle").getAsString())) {
				problems.add(en.getKey() + " -> missing subtitle translation " + event.get("subtitle").getAsString());
			}
			event.getAsJsonArray("sounds").forEach(s -> {
				boolean isEvent = s.isJsonObject() && s.getAsJsonObject().has("type") && "event".equals(s.getAsJsonObject().get("type").getAsString());
				String name = s.isJsonObject() ? s.getAsJsonObject().get("name").getAsString() : s.getAsString();
				String path = ownPath(name);
				if (!isEvent && path != null && !Files.isRegularFile(ASSETS.resolve("sounds/" + path + ".ogg"))) {
					problems.add(en.getKey() + " -> missing sound file " + name);
				}
			});
		});
		report(problems);
	}

	@Test
	void everyItemAndDefinitionIsTranslated() throws IOException {
		List<String> problems = new ArrayList<>();
		Path items = ASSETS.resolve("items");
		try (Stream<Path> s = Files.list(items)) {
			s.filter(p -> p.toString().endsWith(".json")).forEach(f -> {
				String id = stem(items, f);
				if (!lang.has("item." + NS + "." + id) && !lang.has("block." + NS + "." + id)) {
					problems.add("no translation for item " + id);
				}
			});
		}
		data.skins().keySet().forEach(id -> {
			if (!lang.has(NS + ".skin." + id.getPath())) {
				problems.add("no translation for skin " + id);
			}
		});
		report(problems);
	}

	@Test
	void recipesAndLootTablesReferenceExistingItems() throws IOException {
		List<String> problems = new ArrayList<>();
		List<Path> files = new ArrayList<>(jsonFiles(DATA.resolve("recipe")));
		files.addAll(jsonFiles(DATA.resolve("loot_table")));
		for (Path f : files) {
			strings(read(f), null, (key, value) -> {
				String path = ownPath(value);
				if (path == null || "value".equals(key) && path.startsWith("inject/")) {
					return;
				}
				if (("id".equals(key) || "name".equals(key) || key == null || "ingredients".equals(key) || "item".equals(key))
						&& !path.startsWith("inject/") && !itemExists(path)) {
					problems.add(f + " -> unknown item " + value);
				}
			});
		}
		assertEquals(3, jsonFiles(DATA.resolve("loot_table/inject")).size(), "inject loot tables");
		report(problems);
	}
}
