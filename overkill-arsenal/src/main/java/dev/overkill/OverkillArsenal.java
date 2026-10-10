package dev.overkill;

import dev.overkill.network.ModNetworking;
import dev.overkill.registry.ModBlocks;
import dev.overkill.registry.ModComponents;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModEntities;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModItemGroup;
import dev.overkill.registry.ModItems;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.SafeLanding;
import dev.overkill.util.ServerProcesses;
import dev.overkill.weapon.StormcallerLogic;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class OverkillArsenal implements ModInitializer {
	public static final String MOD_ID = "overkill";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ModParticles.init();
		ModComponents.init();
		ModEffects.init();
		ModBlocks.init();
		ModItems.init();
		ModEntities.init();
		ModGameRules.init();
		ModItemGroup.init();
		ModNetworking.init();

		ServerProcesses.init();
		SafeLanding.init();
		StormcallerLogic.init();

		LOGGER.info("Overkill Arsenal armed: 5 weapons loaded.");
	}
}
