package dev.visceral;

import dev.visceral.network.VisceralNetworking;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.registry.VisceralDamageTypes;
import dev.visceral.registry.VisceralEffects;
import dev.visceral.wound.WoundService;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Visceral: wounds, blood and ragdolls.
 *
 * <p>The server decides <i>what</i> happened (wound type, where the blow landed, how hard),
 * stores it on the entity as a synced attachment and broadcasts a compact hit packet.
 * Everything visual (model decals, droplets, stains, pools, ragdolls) is derived on the client.
 */
public final class Visceral implements ModInitializer {
	public static final String MOD_ID = "visceral";
	public static final Logger LOGGER = LoggerFactory.getLogger("Visceral");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		VisceralConfig.load();
		VisceralEffects.init();
		VisceralDamageTypes.init();
		VisceralAttachments.init();
		VisceralNetworking.init();
		WoundService.init();
		LOGGER.info("Visceral initialized");
	}
}
