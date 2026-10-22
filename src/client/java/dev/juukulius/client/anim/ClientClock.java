package dev.juukulius.client.anim;

/** Animation time in seconds; advances with client ticks (so it pauses with the game) and interpolates per frame. */
public final class ClientClock {
	private static long ticks;

	private ClientClock() {
	}

	public static void tick() {
		ticks++;
	}

	public static long ticks() {
		return ticks;
	}

	public static float seconds(float partialTick) {
		return (ticks + partialTick) / 20.0F;
	}
}
