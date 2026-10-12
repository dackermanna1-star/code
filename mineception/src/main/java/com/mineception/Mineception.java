package com.mineception;

import com.mineception.network.LaptopEdits;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Mineception: a laptop that runs Minecraft, which has a laptop that runs Minecraft... four dream levels deep. */
public class Mineception implements ModInitializer {
	public static final String MOD_ID = "mineception";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ModContent.init();
		LaptopEdits.init();
	}
}
