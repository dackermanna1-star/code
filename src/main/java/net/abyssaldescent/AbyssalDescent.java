package net.abyssaldescent;

import net.abyssaldescent.command.AbyssalCommands;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.run.RunEvents;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.registry.ModBlockEntities;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.registry.ModComponents;
import net.abyssaldescent.registry.ModCreativeTab;
import net.abyssaldescent.registry.ModEffects;
import net.abyssaldescent.registry.ModEntities;
import net.abyssaldescent.registry.ModItems;
import net.abyssaldescent.registry.ModLoot;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModPotions;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.registry.ModWorldgen;
import net.abyssaldescent.item.combat.CombatEvents;
import net.abyssaldescent.network.ModNetworking;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class AbyssalDescent implements ModInitializer {
	public static final String MOD_ID = "abyssal_descent";
	public static final Logger LOGGER = LoggerFactory.getLogger("Abyssal Descent");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		AdConfig.load();

		ModComponents.init();
		ModSounds.init();
		ModParticles.init();
		ModEffects.init();
		ModPotions.init();
		ModBlocks.init();
		ModBlockEntities.init();
		ModEntities.init();
		ModItems.init();
		ModCreativeTab.init();
		ModAttachments.init();
		ModLoot.init();
		ModWorldgen.init();
		ModNetworking.init();

		// Combat hooks first: Deathward must get a chance before a lethal blow counts as a dungeon defeat.
		CombatEvents.init();
		RunEvents.init();
		AbyssalCommands.init();
		net.abyssaldescent.dev.SelfTest.init();

		LOGGER.info("The abyss stirs.");
	}
}
