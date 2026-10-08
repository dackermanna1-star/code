package dev.portalgun;

import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.DimensionEffects;
import dev.portalgun.registry.ModAttachments;
import dev.portalgun.registry.ModBlocks;
import dev.portalgun.registry.ModCommands;
import dev.portalgun.registry.ModComponents;
import dev.portalgun.registry.ModCreatures;
import dev.portalgun.registry.ModEntities;
import dev.portalgun.registry.ModItemGroups;
import dev.portalgun.registry.ModItems;
import dev.portalgun.registry.ModNetworking;
import dev.portalgun.registry.ModParticles;
import dev.portalgun.registry.ModSounds;
import dev.portalgun.registry.ModWorldgen;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PortalGunMod implements ModInitializer {
	public static final String MOD_ID = "portalgun";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ContentSpec.load();
		ModComponents.init();
		ModSounds.init();
		ModParticles.init();
		ModBlocks.init();
		ModEntities.init();
		ModCreatures.init();
		ModItems.init();
		ModItemGroups.init();
		ModWorldgen.init();
		ModAttachments.init();
		ModNetworking.init();
		ModCommands.init();
		DimensionEffects.init();
		LOGGER.info("Portal Gun Multiverse loaded: {} dimensions, {} blocks, {} creatures",
			ContentSpec.get().dimensions.size(), ContentSpec.get().blocks.size(), ContentSpec.get().creatures.size());
	}
}
