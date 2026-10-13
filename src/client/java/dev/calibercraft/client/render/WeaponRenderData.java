package dev.calibercraft.client.render;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.calibercraft.CaliberCraft;
import java.io.Reader;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.FileToIdConverter;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimplePreparableReloadListener;
import net.minecraft.util.profiling.ProfilerFiller;
import org.joml.Vector3f;

/**
 * First-person presentation metadata produced by the model generator ({@code assets/<ns>/weapon_render/<id>.json}):
 * part pivots and animation hints, hand/ejection points, sight heights and muzzle positions, all in model pixels.
 * Resource packs can override it together with the models. Missing data falls back to safe defaults.
 */
public record WeaponRenderData(String category, Vector3f boundsMin, Vector3f boundsMax, List<String> animatedParts,
		Map<String, PartAnim> parts, Map<String, Vector3f> points, Map<String, Sight> sights, Map<String, Vector3f> muzzle,
		Map<String, Float> muzzleLength) {
	public static final WeaponRenderData FALLBACK = new WeaponRenderData("rifle", new Vector3f(6, 0, -16), new Vector3f(10, 12, 24), List.of(),
		Map.of(), Map.of("grip", new Vector3f(8, 3, 10), "support", new Vector3f(8, 6, -6), "ejection", new Vector3f(9.5f, 8.5f, 4)),
		Map.of("iron", new Sight(11.5f, 8)), Map.of("default", new Vector3f(8, 8, -16)), Map.of());

	private static final Map<Identifier, WeaponRenderData> DATA = new HashMap<>();

	public record Sight(float y, float z) {
	}

	/** Animation hints for one moving part (unused keys stay at their defaults). */
	public record PartAnim(Vector3f pivot, String style, Vector3f travel, float liftDeg, float swingDeg, Vector3f spinCenter, int chambers,
			float cockDeg, float openDeg, String follow, Vector3f from, Vector3f to) {
	}

	public static WeaponRenderData get(Identifier weapon) {
		return weapon == null ? FALLBACK : DATA.getOrDefault(weapon, FALLBACK);
	}

	public Vector3f point(String name) {
		Vector3f p = points.get(name);
		return p != null ? p : FALLBACK.points.getOrDefault(name, new Vector3f(8, 8, 8));
	}

	public PartAnim part(String name) {
		return parts.get(name);
	}

	public Sight sight(Identifier optic) {
		if (optic != null) {
			Sight s = sights.get(optic.toString());
			if (s != null) {
				return s;
			}
		}
		Sight iron = sights.get("iron");
		return iron != null ? iron : new Sight(boundsMax.y - 0.5f, 6);
	}

	/** Muzzle position (model px) for the installed barrel, extended by the muzzle device. */
	public Vector3f muzzlePoint(Identifier barrel, Identifier muzzleDevice) {
		Vector3f m = barrel != null ? muzzle.get(barrel.toString()) : null;
		if (m == null) {
			m = muzzle.getOrDefault("default", new Vector3f(8, 8, boundsMin.z));
		}
		float extra = muzzleDevice == null ? 0 : muzzleLength.getOrDefault(muzzleDevice.toString(), 0f);
		return new Vector3f(m.x, m.y, m.z - extra);
	}

	// ------------------------------------------------------------------------------------------------ loading

	public static final class Loader extends SimplePreparableReloadListener<Map<Identifier, WeaponRenderData>> {
		public static final Identifier ID = CaliberCraft.id("weapon_render");
		private static final FileToIdConverter FILES = FileToIdConverter.json("weapon_render");

		@Override
		protected Map<Identifier, WeaponRenderData> prepare(ResourceManager manager, ProfilerFiller profiler) {
			Map<Identifier, WeaponRenderData> out = new HashMap<>();
			for (Map.Entry<Identifier, Resource> e : FILES.listMatchingResources(manager).entrySet()) {
				Identifier id = FILES.fileToId(e.getKey());
				try (Reader r = e.getValue().openAsReader()) {
					out.put(id, parse(JsonParser.parseReader(r).getAsJsonObject()));
				} catch (Exception ex) {
					CaliberCraft.LOGGER.error("Invalid weapon render data {}: {}", e.getKey(), ex.toString());
				}
			}
			return out;
		}

		@Override
		protected void apply(Map<Identifier, WeaponRenderData> data, ResourceManager manager, ProfilerFiller profiler) {
			DATA.clear();
			DATA.putAll(data);
		}
	}

	static WeaponRenderData parse(JsonObject o) {
		JsonObject bounds = o.getAsJsonObject("bounds");
		Vector3f min = vec(bounds == null ? null : bounds.get("min"), new Vector3f(6, 0, -16));
		Vector3f max = vec(bounds == null ? null : bounds.get("max"), new Vector3f(10, 12, 24));
		List<String> animated = new java.util.ArrayList<>();
		if (o.has("animated_parts")) {
			for (JsonElement e : o.getAsJsonArray("animated_parts")) {
				animated.add(e.getAsString());
			}
		}
		Map<String, PartAnim> parts = new HashMap<>();
		if (o.has("parts")) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("parts").entrySet()) {
				JsonObject p = e.getValue().getAsJsonObject();
				parts.put(e.getKey(), new PartAnim(vec(p.get("pivot"), new Vector3f(8, 8, 8)), str(p, "style", "drop"),
					vec(p.get("travel"), new Vector3f()), num(p, "lift_deg", 0), num(p, "swing_deg", 0), vec(p.get("spin_center"), null),
					(int) num(p, "chambers", 6), num(p, "cock_deg", 0), num(p, "open_deg", 0), str(p, "follow", ""),
					vec(p.get("from"), null), vec(p.get("to"), null)));
			}
		}
		Map<String, Vector3f> points = new HashMap<>();
		if (o.has("points")) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("points").entrySet()) {
				points.put(e.getKey(), vec(e.getValue(), new Vector3f(8, 8, 8)));
			}
		}
		Map<String, Sight> sights = new HashMap<>();
		if (o.has("sights")) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("sights").entrySet()) {
				JsonObject s = e.getValue().getAsJsonObject();
				sights.put(e.getKey(), new Sight(num(s, "y", 11), num(s, "z", 6)));
			}
		}
		Map<String, Vector3f> muzzle = new HashMap<>();
		if (o.has("muzzle")) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("muzzle").entrySet()) {
				muzzle.put(e.getKey(), vec(e.getValue(), new Vector3f(8, 8, -16)));
			}
		}
		Map<String, Float> lengths = new HashMap<>();
		if (o.has("muzzle_length")) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("muzzle_length").entrySet()) {
				lengths.put(e.getKey(), e.getValue().getAsFloat());
			}
		}
		return new WeaponRenderData(str(o, "category", "rifle"), min, max, List.copyOf(animated), parts, points, sights, muzzle, lengths);
	}

	private static Vector3f vec(JsonElement e, Vector3f def) {
		if (e == null || !e.isJsonArray()) {
			return def;
		}
		JsonArray a = e.getAsJsonArray();
		return a.size() == 3 ? new Vector3f(a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()) : def;
	}

	private static float num(JsonObject o, String key, float def) {
		return o.has(key) ? o.get(key).getAsFloat() : def;
	}

	private static String str(JsonObject o, String key, String def) {
		return o.has(key) ? o.get(key).getAsString() : def;
	}
}
