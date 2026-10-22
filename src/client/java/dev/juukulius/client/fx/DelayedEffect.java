package dev.juukulius.client.fx;

import net.minecraft.client.multiplayer.ClientLevel;

/** Starts another effect after a delay (used to stagger pressure waves and shockwave echoes). */
public final class DelayedEffect extends WorldEffect {
	private final int delay;
	private final WorldEffect inner;

	public DelayedEffect(int delay, WorldEffect inner) {
		super(delay + inner.lifetime);
		this.delay = delay;
		this.inner = inner;
	}

	@Override
	public boolean tick(ClientLevel level) {
		this.age++;
		if (this.age <= this.delay) {
			return true;
		}

		return this.inner.tick(level);
	}

	@Override
	public void render(FxContext context) {
		if (this.age >= this.delay) {
			this.inner.render(context);
		}
	}
}
