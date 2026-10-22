package dev.juukulius.client.anim;

import dev.juukulius.animation.JuliusAnim;
import net.minecraft.util.Mth;

/** One playing action clip with blend-in, blend-out and an optional early fade (when interrupted). */
public final class Playback {
	public final JuliusAnim id;
	public final AnimClip clip;
	public final float start;
	public final float speed;
	private float fadeStart = -1.0F;
	private float fadeDuration = 0.1F;

	public Playback(JuliusAnim id, AnimClip clip, float start, float speed) {
		this.id = id;
		this.clip = clip;
		this.start = start;
		this.speed = Math.max(0.05F, speed);
	}

	public float time(float now) {
		float time = Math.max(0.0F, (now - this.start) * this.speed);
		return this.clip.loop ? time % Math.max(0.01F, this.clip.length) : Math.min(time, this.clip.length);
	}

	public float rawTime(float now) {
		return (now - this.start) * this.speed;
	}

	public float weight(float now) {
		float time = this.rawTime(now);
		float in = this.clip.blendIn <= 0.0F ? 1.0F : Mth.clamp(time / this.clip.blendIn, 0.0F, 1.0F);
		float out = 1.0F;
		if (!this.clip.loop) {
			out = this.clip.blendOut <= 0.0F ? (time < this.clip.length ? 1.0F : 0.0F) : Mth.clamp((this.clip.length - time) / this.clip.blendOut, 0.0F, 1.0F);
		}

		float weight = Math.min(in, out);
		if (this.fadeStart >= 0.0F) {
			weight *= Mth.clamp(1.0F - (now - this.fadeStart) / this.fadeDuration, 0.0F, 1.0F);
		}

		return weight * weight * (3.0F - 2.0F * weight);
	}

	public void fadeOut(float now, float duration) {
		if (this.fadeStart < 0.0F) {
			this.fadeStart = now;
			this.fadeDuration = Math.max(0.02F, duration);
		}
	}

	public boolean fading() {
		return this.fadeStart >= 0.0F;
	}

	public boolean finished(float now) {
		if (this.fadeStart >= 0.0F && now - this.fadeStart >= this.fadeDuration) {
			return true;
		}

		return !this.clip.loop && this.rawTime(now) >= this.clip.length;
	}
}
