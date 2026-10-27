package dev.visceral;

import dev.visceral.command.VisceralCommand;
import dev.visceral.config.CommonConfig;
import dev.visceral.net.Payloads;
import dev.visceral.net.ServerNet;
import dev.visceral.registry.VisceralRegistry;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Common entry point: registries, networking, server-side combat and physics. */
public class Visceral implements ModInitializer {
	public static final String MOD_ID = "visceral";
	public static final Logger LOGGER = LoggerFactory.getLogger("Visceral");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		CommonConfig.load();
		VisceralRegistry.register();
		Payloads.register();
		ServerNet.init();
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> VisceralCommand.register(dispatcher));
		LOGGER.info("Visceral initialised");
	}
}
