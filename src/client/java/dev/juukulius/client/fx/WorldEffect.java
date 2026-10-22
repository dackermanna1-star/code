package dev.juukulius.client.fx;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.Mth;

/** A short-lived client-side visual (magic circle, shockwave, flash...). */
public abstract class WorldEffect {
	protected final int lifetime;
	protected int age;

	protected WorldEffect(int lifetime) {
		this.lifetime = Math.max(1, lifetime);
	}

	/** @return false once the effect is finished */
	public boolean tick(ClientLevel level) {
		return ++this.age < this.lifetime;
	}

	public float progress(float partialTick) {
		return Mth.clamp((this.age + partialTick) / this.lifetime, 0.0F, 1.0F);
	}

	/** Fade in over {@code in} and out over {@code out} (both as fractions of the lifetime). */
	protected float envelope(float partialTick, float in, float out) {
		float p = this.progress(partialTick);
		float a = in <= 0.0F ? 1.0F : Mth.clamp(p / in, 0.0F, 1.0F);
		float b = out <= 0.0F ? 1.0F : Mth.clamp((1.0F - p) / out, 0.0F, 1.0F);
		return Math.min(a, b);
	}

	public abstract void render(FxContext context);
}
