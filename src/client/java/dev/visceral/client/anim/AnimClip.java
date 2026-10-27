package dev.visceral.client.anim;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.HashMap;
import java.util.Map;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * A keyframed animation loaded from {@code assets/<ns>/visceral_animations/<name>.json}.
 *
 * <pre>
 * {
 *   "length": 0.7, "blend_in": 0.06, "blend_out": 0.15, "loop": false,
 *   "additive": ["root"],
 *   "bones": {
 *     "right_arm": { "rot": [[0.0, -20, 0, 10], [0.2, -150, 30, 15, -90, "linear"]] },
 *     "right_item": { "rot": [[0.0, -40, 0, 0]] },
 *     "root": { "rot": [[0.0, 0, 0, 0]], "pos": [[0.0, 0, 0, 0]] }
 *   }
 * }
 * </pre>
 *
 * Times are seconds at play speed 1 (one tick = 0.05 s). Bone rotations are ModelPart-style
 * Euler degrees [x, y, z] (applied Z*Y*X) relative to the parent bone, with an optional fourth
 * value twisting the limb about its own long axis first; keys are converted to quaternions and
 * interpolated smoothly (Catmull-Rom on aligned quaternions), so any Euler representation of a
 * key pose interpolates along a natural path. {@code pos} offsets are pixels. Item channels
 * ({@code right_item}/{@code left_item}) are [pitch towards the arm, roll about the arm]
 * degrees for the held item. Root rotations are [pitch forward, yaw left, roll right] degrees
 * about the feet; root position is [right, up, forward] blocks. Keys interpolate smoothly unless
 * marked {@code "linear"} or {@code "step"}.
 */
public final class AnimClip {
	public static final int ROOT = Bone.COUNT;
	public static final int RIGHT_ITEM = Bone.COUNT + 1;
	public static final int LEFT_ITEM = Bone.COUNT + 2;
	private static final int CHANNELS = Bone.COUNT + 3;

	public final String name;
	public final float length;
	public final boolean loop;
	public final float blendIn, blendOut;
	final QuatTrack[] boneRot = new QuatTrack[Bone.COUNT];
	final Track[] vec = new Track[CHANNELS];
	final Track[] pos = new Track[CHANNELS];
	final boolean[] additive = new boolean[CHANNELS];
	public final Map<String, Float> events = new HashMap<>();
	/** Root rotations pivot about the hips instead of the feet (lying, kneeling, crawling). */
	public boolean pivotHip;

	private AnimClip(String name, float length, boolean loop, float blendIn, float blendOut) {
		this.name = name;
		this.length = length;
		this.loop = loop;
		this.blendIn = blendIn;
		this.blendOut = blendOut;
	}

	public boolean animates(int bone) {
		return (bone < Bone.COUNT && boneRot[bone] != null) || vec[bone] != null || pos[bone] != null;
	}

	public boolean animatesLegs() {
		return animates(Bone.RIGHT_LEG.ordinal()) || animates(Bone.LEFT_LEG.ordinal());
	}

	public boolean isAdditive(int channel) {
		return additive[channel];
	}

	/** Bone rotation at {@code t}, or null if the clip does not drive it. */
	public @Nullable Quaternionf sampleBone(int bone, float t, Quaternionf out) {
		QuatTrack tr = boneRot[bone];
		return tr == null ? null : tr.sample(t, loop ? length : -1, out);
	}

	/** Root rotation / item rotation vector at {@code t}. */
	public @Nullable Vector3f sampleVec(int channel, float t, Vector3f out) {
		Track tr = vec[channel];
		return tr == null ? null : tr.sample(t, loop ? length : -1, out);
	}

	public @Nullable Vector3f samplePos(int channel, float t, Vector3f out) {
		Track tr = pos[channel];
		return tr == null ? null : tr.sample(t, loop ? length : -1, out);
	}

	public float event(String key, float fallback) {
		Float v = events.get(key);
		return v == null ? fallback : v;
	}

	public static AnimClip parse(String name, JsonObject json) {
		float length = json.has("length") ? json.get("length").getAsFloat() : 1f;
		AnimClip clip = new AnimClip(name, length,
			json.has("loop") && json.get("loop").getAsBoolean(),
			json.has("blend_in") ? json.get("blend_in").getAsFloat() : 0.08f,
			json.has("blend_out") ? json.get("blend_out").getAsFloat() : 0.15f);
		clip.additive[ROOT] = true;
		clip.pivotHip = json.has("root_pivot") && "hip".equals(json.get("root_pivot").getAsString());
		if (json.has("additive")) {
			java.util.Arrays.fill(clip.additive, false);
			for (JsonElement e : json.getAsJsonArray("additive")) {
				int idx = channelIndex(e.getAsString());
				if (idx >= 0) clip.additive[idx] = true;
			}
		}
		if (json.has("events")) {
			for (Map.Entry<String, JsonElement> e : json.getAsJsonObject("events").entrySet()) clip.events.put(e.getKey(), e.getValue().getAsFloat());
		}
		JsonObject bones = json.getAsJsonObject("bones");
		if (bones != null) {
			for (Map.Entry<String, JsonElement> e : bones.entrySet()) {
				int idx = channelIndex(e.getKey());
				if (idx < 0) throw new IllegalArgumentException("Unknown channel '" + e.getKey() + "' in " + name);
				JsonObject b = e.getValue().getAsJsonObject();
				if (b.has("rot")) {
					if (idx < Bone.COUNT) clip.boneRot[idx] = QuatTrack.parse(b.getAsJsonArray("rot"));
					else clip.vec[idx] = Track.parse(b.getAsJsonArray("rot"));
				}
				if (b.has("pos")) clip.pos[idx] = Track.parse(b.getAsJsonArray("pos"));
			}
		}
		return clip;
	}

	static int channelIndex(String name) {
		return switch (name) {
			case "root" -> ROOT;
			case "right_item" -> RIGHT_ITEM;
			case "left_item" -> LEFT_ITEM;
			default -> {
				Bone b = Bone.byName(name);
				yield b == null ? -1 : b.ordinal();
			}
		};
	}

	static final int SMOOTH = 0, LINEAR = 1, STEP = 2;

	private static int interpOf(JsonArray k) {
		JsonElement last = k.get(k.size() - 1);
		if (last.isJsonPrimitive() && last.getAsJsonPrimitive().isString()) {
			return switch (last.getAsString()) {
				case "linear" -> LINEAR;
				case "step" -> STEP;
				default -> SMOOTH;
			};
		}
		return SMOOTH;
	}

	private static int numberCount(JsonArray k) {
		int n = 0;
		for (JsonElement e : k) if (e.isJsonPrimitive() && e.getAsJsonPrimitive().isNumber()) n++;
		return n;
	}

	/** Segment lookup shared by both track kinds. Returns segment index, writes local u to out[0]. */
	private static int segment(float[] times, float t, float[] u) {
		int n = times.length;
		int i = 0;
		while (i < n - 2 && t >= times[i + 1]) i++;
		float t0 = times[i], t1 = times[i + 1];
		u[0] = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 1f;
		return i;
	}

	private static float wrapTime(float t, float loopLength) {
		return loopLength > 0 ? ((t % loopLength) + loopLength) % loopLength : t;
	}

	private static float hermite(float p0, float p1, float p2, float p3, float dt0, float dt1, float dt2, float u) {
		float u2 = u * u, u3 = u2 * u;
		float h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
		float m1 = ((p1 - p0) / Math.max(dt0, 1e-4f) + (p2 - p1) / Math.max(dt1, 1e-4f)) * 0.5f * dt1;
		float m2 = ((p2 - p1) / Math.max(dt1, 1e-4f) + (p3 - p2) / Math.max(dt2, 1e-4f)) * 0.5f * dt1;
		return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
	}

	/** Vector track (positions, root angles, item angles). */
	static final class Track {
		final float[] times;
		final float[][] values;
		final int[] interp;

		Track(float[] times, float[][] values, int[] interp) {
			this.times = times;
			this.values = values;
			this.interp = interp;
		}

		static Track parse(JsonArray arr) {
			int n = arr.size();
			float[] times = new float[n];
			float[][] values = new float[n][3];
			int[] interp = new int[n];
			for (int i = 0; i < n; i++) {
				JsonArray k = arr.get(i).getAsJsonArray();
				times[i] = k.get(0).getAsFloat();
				int nums = numberCount(k);
				for (int dIdx = 0; dIdx < Math.min(3, nums - 1); dIdx++) values[i][dIdx] = k.get(1 + dIdx).getAsFloat();
				interp[i] = interpOf(k);
				if (i > 0 && times[i] < times[i - 1]) throw new IllegalArgumentException("Keyframes out of order");
			}
			return new Track(times, values, interp);
		}

		Vector3f sample(float t, float loopLength, Vector3f out) {
			int n = times.length;
			if (n == 1) return out.set(values[0][0], values[0][1], values[0][2]);
			t = wrapTime(t, loopLength);
			if (t <= times[0]) return out.set(values[0][0], values[0][1], values[0][2]);
			if (t >= times[n - 1]) return out.set(values[n - 1][0], values[n - 1][1], values[n - 1][2]);
			float[] uu = new float[1];
			int i = segment(times, t, uu);
			float u = uu[0];
			float[] a = values[i], b = values[i + 1];
			int mode = interp[i + 1];
			if (mode == STEP) return out.set(a[0], a[1], a[2]);
			if (mode == LINEAR) return out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
			float[] p0 = i > 0 ? values[i - 1] : a;
			float[] p3 = i + 2 < n ? values[i + 2] : b;
			float dt1 = times[i + 1] - times[i];
			float dt0 = i > 0 ? times[i] - times[i - 1] : dt1;
			float dt2 = i + 2 < n ? times[i + 2] - times[i + 1] : dt1;
			return out.set(hermite(p0[0], a[0], b[0], p3[0], dt0, dt1, dt2, u), hermite(p0[1], a[1], b[1], p3[1], dt0, dt1, dt2, u),
				hermite(p0[2], a[2], b[2], p3[2], dt0, dt1, dt2, u));
		}
	}

	/** Rotation track: quaternion keys, sign-aligned, smoothly interpolated and renormalised. */
	static final class QuatTrack {
		final float[] times;
		final float[][] q;
		final int[] interp;

		QuatTrack(float[] times, float[][] q, int[] interp) {
			this.times = times;
			this.q = q;
			this.interp = interp;
		}

		static QuatTrack parse(JsonArray arr) {
			int n = arr.size();
			float[] times = new float[n];
			float[][] qs = new float[n][4];
			int[] interp = new int[n];
			Quaternionf tmp = new Quaternionf();
			for (int i = 0; i < n; i++) {
				JsonArray k = arr.get(i).getAsJsonArray();
				times[i] = k.get(0).getAsFloat();
				int nums = numberCount(k);
				float x = nums > 1 ? k.get(1).getAsFloat() : 0, y = nums > 2 ? k.get(2).getAsFloat() : 0, z = nums > 3 ? k.get(3).getAsFloat() : 0;
				float twist = nums > 4 ? k.get(4).getAsFloat() : 0;
				tmp.rotationZYX(z * AnimPose.DEG, y * AnimPose.DEG, x * AnimPose.DEG);
				if (twist != 0) tmp.rotateY(twist * AnimPose.DEG);
				if (i > 0) {
					float dot = tmp.x * qs[i - 1][0] + tmp.y * qs[i - 1][1] + tmp.z * qs[i - 1][2] + tmp.w * qs[i - 1][3];
					if (dot < 0) tmp.set(-tmp.x, -tmp.y, -tmp.z, -tmp.w);
				}
				qs[i][0] = tmp.x;
				qs[i][1] = tmp.y;
				qs[i][2] = tmp.z;
				qs[i][3] = tmp.w;
				interp[i] = interpOf(k);
				if (i > 0 && times[i] < times[i - 1]) throw new IllegalArgumentException("Keyframes out of order");
			}
			return new QuatTrack(times, qs, interp);
		}

		Quaternionf sample(float t, float loopLength, Quaternionf out) {
			int n = times.length;
			if (n == 1) return set(out, q[0]);
			t = wrapTime(t, loopLength);
			if (t <= times[0]) return set(out, q[0]);
			if (t >= times[n - 1]) return set(out, q[n - 1]);
			float[] uu = new float[1];
			int i = segment(times, t, uu);
			float u = uu[0];
			float[] a = q[i], b = q[i + 1];
			int mode = interp[i + 1];
			if (mode == STEP) return set(out, a);
			if (mode == LINEAR) return set(out, a).slerp(new Quaternionf(b[0], b[1], b[2], b[3]), u);
			float[] p0 = i > 0 ? q[i - 1] : a;
			float[] p3 = i + 2 < n ? q[i + 2] : b;
			float dt1 = times[i + 1] - times[i];
			float dt0 = i > 0 ? times[i] - times[i - 1] : dt1;
			float dt2 = i + 2 < n ? times[i + 2] - times[i + 1] : dt1;
			out.set(hermite(p0[0], a[0], b[0], p3[0], dt0, dt1, dt2, u), hermite(p0[1], a[1], b[1], p3[1], dt0, dt1, dt2, u),
				hermite(p0[2], a[2], b[2], p3[2], dt0, dt1, dt2, u), hermite(p0[3], a[3], b[3], p3[3], dt0, dt1, dt2, u));
			return out.normalize();
		}

		private static Quaternionf set(Quaternionf out, float[] v) {
			return out.set(v[0], v[1], v[2], v[3]);
		}
	}
}
