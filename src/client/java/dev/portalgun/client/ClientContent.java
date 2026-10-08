package dev.portalgun.client;

import dev.portalgun.client.creature.ClientCreatures;
import dev.portalgun.client.sky.ClientSky;

/** Client registration for spec-driven content. */
public final class ClientContent {
	private ClientContent() {
	}

	public static void init() {
		ClientBlocks.init();
		ClientCreatures.init();
		ClientSky.init();
	}
}
