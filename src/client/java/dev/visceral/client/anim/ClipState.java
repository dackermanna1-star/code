package dev.visceral.client.anim;

import org.joml.Quaternionf;
import org.joml.Vector3f;

/** A clip being played: time, speed and fade weight. */
public final class ClipState {
	public final AnimClip clip;
	public final float speed;
	public float time;
	/** Clip-time at which to start fading out; defaults to the clip's length. */
	public float endTime;
	public boolean stopping;
	public float fadeOut;
	private float stopWeight = 1f;

	private static final Vector3f TMP = new Vector3f();
	private static final Quaternionf QTMP = new Quaternionf();

	public ClipState(AnimClip clip, float speed) {
		this.clip = clip;
		this.speed = speed;
		this.endTime = clip.length;
	}

	public void advance(float dt) {
		time += dt * speed;
		if (stopping) {
			fadeOut += dt;
			stopWeight = Math.max(0, 1 - fadeOut / Math.max(0.05f, clip.blendOut));
		}
	}

	public boolean finished() {
		if (clip.loop) return stopping && stopWeight <= 0;
		return time >= endTime + clip.blendOut || (stopping && stopWeight <= 0);
	}

	public void stop() {
		stopping = true;
	}

	public float weight() {
		float w = 1f;
		if (clip.blendIn > 0) w = Math.min(w, time / clip.blendIn);
		if (!clip.loop && time > endTime) w = Math.min(w, 1 - (time - endTime) / Math.max(0.01f, clip.blendOut));
		w = Math.max(0, Math.min(1, w));
		return smooth(w) * stopWeight;
	}

	private static float smooth(float x) {
		return x * x * (3 - 2 * x);
	}

	/** Blends this clip into the pose. {@code legs} false leaves legs to locomotion. */
	public void applyTo(AnimPose pose, float intensity, boolean legs) {
		applyTo(pose, intensity, legs, 1f, 0.75f);
	}

	/** @param rootScale scales authored root offsets to this body's size; @param hipHeight blocks. */
	public void applyTo(AnimPose pose, float intensity, boolean legs, float rootScale, float hipHeight) {
		float w = weight() * intensity;
		if (w <= 0) return;
		float t = Math.min(time, clip.length);
		for (int i = 0; i < Bone.COUNT; i++) {
			if (!legs && (i == Bone.RIGHT_LEG.ordinal() || i == Bone.LEFT_LEG.ordinal())) continue;
			Quaternionf q = clip.sampleBone(i, t, QTMP);
			if (q != null) {
				if (clip.isAdditive(i)) {
					pose.local[i].mul(new Quaternionf().slerp(q, w));
				} else {
					pose.local[i].slerp(q, w);
					pose.vanilla[i] *= 1 - w;
					if (w > 0.5f) pose.vanillaBase[i] = false;
				}
			}
			Vector3f p = clip.samplePos(i, t, TMP);
			if (p != null) {
				if (clip.isAdditive(i)) pose.offset[i].fma(w, p);
				else pose.offset[i].lerp(p, w);
			}
		}
		int root = AnimClip.ROOT;
		Vector3f rr = clip.sampleVec(root, t, TMP);
		if (rr != null) {
			if (clip.isAdditive(root)) {
				pose.rootPitch += rr.x * w;
				pose.rootYaw += rr.y * w;
				pose.rootRoll += rr.z * w;
			} else {
				pose.rootPitch += (rr.x - pose.rootPitch) * w;
				pose.rootYaw += (rr.y - pose.rootYaw) * w;
				pose.rootRoll += (rr.z - pose.rootRoll) * w;
			}
		}
		if (clip.pivotHip) pose.rootPivotY += (hipHeight - pose.rootPivotY) * w;
		Vector3f rp = clip.samplePos(root, t, TMP);
		if (rp != null) {
			rp.mul(rootScale);
			if (clip.isAdditive(root)) {
				pose.rootX += rp.x * w;
				pose.rootY += rp.y * w;
				pose.rootZ += rp.z * w;
			} else {
				pose.rootX += (rp.x - pose.rootX) * w;
				pose.rootY += (rp.y - pose.rootY) * w;
				pose.rootZ += (rp.z - pose.rootZ) * w;
			}
		}
		Vector3f ri = clip.sampleVec(AnimClip.RIGHT_ITEM, t, TMP);
		if (ri != null) {
			pose.rightItemPitch += (ri.x - pose.rightItemPitch) * w;
			pose.rightItemRoll += (ri.y - pose.rightItemRoll) * w;
		}
		Vector3f li = clip.sampleVec(AnimClip.LEFT_ITEM, t, TMP);
		if (li != null) {
			pose.leftItemPitch += (li.x - pose.leftItemPitch) * w;
			pose.leftItemRoll += (li.y - pose.leftItemRoll) * w;
		}
	}
}
