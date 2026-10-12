package com.chaosunleashed;

import com.chaosunleashed.block.ChaosControlPanelInteraction;
import com.chaosunleashed.command.ChaosCommand;
import com.chaosunleashed.core.ChaosConfig;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.events.solarflare.RedstoneSuppression;
import com.chaosunleashed.network.ChaosNetworking;
import com.chaosunleashed.registry.ModBlockEntities;
import com.chaosunleashed.registry.ModBlocks;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItemGroups;
import com.chaosunleashed.registry.ModItems;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModResourceConditions;
import com.chaosunleashed.registry.ModSounds;
import com.chaosunleashed.registry.ModTags;
import com.chaosunleashed.events.alien.UfoEntity;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ChaosUnleashed implements ModInitializer {
	public static final String MOD_ID = "chaosunleashed";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.of(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ChaosConfig.load();
		ModSounds.init();
		ModParticles.init();
		ModTags.init();
		ModEntities.init();
		ModBlocks.init();
		ModItems.init();
		ModBlockEntities.init();
		ModItemGroups.init();
		ModResourceConditions.init();
		ChaosNetworking.init();
		ChaosCommand.init();
		ChaosControlPanelInteraction.init();
		ChaosEventManager.init();
		RedstoneSuppression.init();
		// Shot-down UFOs crash instead of dying outright.
		ServerLivingEntityEvents.ALLOW_DEATH.register((entity, source, amount) ->
			!(entity instanceof UfoEntity ufo) || ufo.interceptDeath(source));
		LOGGER.info("Chaos Unleashed initialized: {} events loaded", com.chaosunleashed.core.ChaosEventType.values().length);
	}
}
