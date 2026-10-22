package dev.juukulius;

import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusServerEvents;
import dev.juukulius.command.JuliusCommands;
import dev.juukulius.config.JuliusServerConfig;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.registry.JuliusEntities;
import dev.juukulius.registry.JuliusItems;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.registry.JuliusSounds;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Common entrypoint. Everything authoritative (state, cooldowns, mana, damage) lives on the logical server;
 * the client only predicts animations and renders effects.
 */
public class JuliusMod implements ModInitializer {
	public static final String MOD_ID = "julius_juukulius";
	public static final Logger LOGGER = LoggerFactory.getLogger("Julius Juukulius");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		JuliusServerConfig.load();
		JuliusSounds.init();
		JuliusParticles.init();
		JuliusItems.init();
		JuliusEntities.init();
		JuliusAttachments.init();
		JuliusNetworking.init();
		JuliusServerEvents.init();
		JuliusCommands.init();
		LOGGER.info("The Finest of Knights is ready. Six spirits answer the call.");
	}
}
