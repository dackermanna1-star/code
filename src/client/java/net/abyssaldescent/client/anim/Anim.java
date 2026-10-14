package net.abyssaldescent.client.anim;

import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.animation.KeyframeAnimations;

/** Terse builders for keyframe channels (degrees for rotation, model pixels for position, up = +y). */
public final class Anim {
	private Anim() {
	}

	public static Keyframe r(float time, float x, float y, float z) {
		return new Keyframe(time, KeyframeAnimations.degreeVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
	}

	public static Keyframe rl(float time, float x, float y, float z) {
		return new Keyframe(time, KeyframeAnimations.degreeVec(x, y, z), AnimationChannel.Interpolations.LINEAR);
	}

	public static Keyframe p(float time, float x, float y, float z) {
		return new Keyframe(time, KeyframeAnimations.posVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
	}

	public static Keyframe pl(float time, float x, float y, float z) {
		return new Keyframe(time, KeyframeAnimations.posVec(x, y, z), AnimationChannel.Interpolations.LINEAR);
	}

	public static Keyframe s(float time, double x, double y, double z) {
		return new Keyframe(time, KeyframeAnimations.scaleVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
	}

	public static AnimationChannel rot(Keyframe... frames) {
		return new AnimationChannel(AnimationChannel.Targets.ROTATION, frames);
	}

	public static AnimationChannel pos(Keyframe... frames) {
		return new AnimationChannel(AnimationChannel.Targets.POSITION, frames);
	}

	public static AnimationChannel scale(Keyframe... frames) {
		return new AnimationChannel(AnimationChannel.Targets.SCALE, frames);
	}
}
