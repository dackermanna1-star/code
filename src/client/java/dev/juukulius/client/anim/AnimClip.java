package dev.juukulius.client.anim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/**
 * A keyframed action animation loaded from {@code assets/julius_juukulius/julius_animations/<name>.json}.
 * <p>
 * Format: {@code length} (seconds), {@code blend_in}/{@code blend_out} (seconds), {@code override} (bones whose vanilla
 * pose is replaced; other animated bones are additive), {@code bones} → {@code {bone: {rotation: [[t, x, y, z, easing],
 * ...], position: [...]}}} with rotations in degrees and positions in pixels, {@code trail} → {@code [[start, end, style]]}
 * windows during which the blade leaves a trail, and {@code first_person_offhand} to show the casting hand in first person.
 */
public final class AnimClip {
	public final String name;
	public final float length;
	public final float blendIn;
	public final float blendOut;
	public final boolean loop;
	public final Set<Bone> overrides;
	public final boolean showOffhandFirstPerson;
	private final @Nullable Track[] rotation = new Track[Bone.COUNT];
	private final @Nullable Track[] position = new Track[Bone.COUNT];
	public final List<TrailWindow> trails;

	private AnimClip(String name, float length, float blendIn, float blendOut, boolean loop, Set<Bone> overrides, boolean showOffhand,
		List<TrailWindow> trails) {
		this.name = name;
		this.length = length;
		this.blendIn = blendIn;
		this.blendOut = blendOut;
		this.loop = loop;
		this.overrides = overrides;
		this.showOffhandFirstPerson = showOffhand;
		this.trails = trails;
	}

	public @Nullable Track rotation(Bone bone) {
		return this.rotation[bone.ordinal()];
	}

	public @Nullable Track position(Bone bone) {
		return this.position[bone.ordinal()];
	}

	public boolean animates(Bone bone) {
		return this.rotation[bone.ordinal()] != null || this.position[bone.ordinal()] != null;
	}

	public @Nullable TrailWindow trailAt(float time) {
		for (TrailWindow window : this.trails) {
			if (time >= window.start && time <= window.end) {
				return window;
			}
		}

		return null;
	}

	public static AnimClip parse(String name, JsonObject json) {
		float length = json.has("length") ? json.get("length").getAsFloat() : 1.0F;
		float blendIn = json.has("blend_in") ? json.get("blend_in").getAsFloat() : 0.06F;
		float blendOut = json.has("blend_out") ? json.get("blend_out").getAsFloat() : 0.15F;
		boolean loop = json.has("loop") && json.get("loop").getAsBoolean();
		boolean offhand = json.has("first_person_offhand") && json.get("first_person_offhand").getAsBoolean();
		Set<Bone> overrides = EnumSet.noneOf(Bone.class);
		if (json.has("override")) {
			for (JsonElement element : json.getAsJsonArray("override")) {
				Bone bone = Bone.byName(element.getAsString());
				if (bone != null) {
					overrides.add(bone);
				}
			}
		}

		List<TrailWindow> trails = new ArrayList<>();
		if (json.has("trail")) {
			for (JsonElement element : json.getAsJsonArray("trail")) {
				JsonArray window = element.getAsJsonArray();
				trails.add(new TrailWindow(window.get(0).getAsFloat(), window.get(1).getAsFloat(),
					window.size() > 2 ? TrailStyle.byName(window.get(2).getAsString()) : TrailStyle.RAINBOW));
			}
		}

		AnimClip clip = new AnimClip(name, length, blendIn, blendOut, loop, overrides, offhand, trails);
		if (json.has("bones")) {
			for (Map.Entry<String, JsonElement> entry : json.getAsJsonObject("bones").entrySet()) {
				Bone bone = Bone.byName(entry.getKey());
				if (bone == null) {
					continue;
				}

				JsonObject channels = entry.getValue().getAsJsonObject();
				if (channels.has("rotation")) {
					clip.rotation[bone.ordinal()] = parseTrack(channels.getAsJsonArray("rotation"));
				}

				if (channels.has("position")) {
					clip.position[bone.ordinal()] = parseTrack(channels.getAsJsonArray("position"));
				}
			}
		}

		return clip;
	}

	private static Track parseTrack(JsonArray keys) {
		int count = keys.size();
		float[] times = new float[count];
		float[][] values = new float[count][3];
		Easing[] easings = new Easing[count];
		for (int i = 0; i < count; i++) {
			JsonArray key = keys.get(i).getAsJsonArray();
			times[i] = key.get(0).getAsFloat();
			values[i][0] = key.get(1).getAsFloat();
			values[i][1] = key.get(2).getAsFloat();
			values[i][2] = key.get(3).getAsFloat();
			easings[i] = key.size() > 4 ? Easing.byName(key.get(4).getAsString()) : Easing.LINEAR;
		}

		return new Track(times, values, easings);
	}

	public record TrailWindow(float start, float end, TrailStyle style) {
	}

	public enum TrailStyle {
		/** Blue-violet end of the spectrum. */
		COOL,
		/** Red-gold end of the spectrum. */
		WARM,
		/** Full rainbow. */
		RAINBOW,
		/** Wide, bright rainbow for heavy and charged strikes. */
		WIDE;

		public static TrailStyle byName(String name) {
			try {
				return valueOf(name.toUpperCase(java.util.Locale.ROOT));
			} catch (IllegalArgumentException e) {
				return RAINBOW;
			}
		}
	}
}
