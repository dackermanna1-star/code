package dev.portalgun.client.creature;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.creature.SpecCreature;
import dev.portalgun.registry.ModCreatures;
import java.util.Map;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.world.entity.EntityType;

/** Creature renderers and model layers (owned by the creature module). */
public final class ClientCreatures {
	private ClientCreatures() {
	}

	public static void init() {
		EntityRendererRegistry.register(ModCreatures.ORB, CreatureOrbRenderer::new);
		int n = 0;
		for (Map.Entry<String, EntityType<SpecCreature>> e : ModCreatures.TYPES.entrySet()) {
			String id = e.getKey();
			EntityType<SpecCreature> type = e.getValue();
			ContentSpec.CreatureSpec spec = ModCreatures.spec(type);
			CreatureGeometry geo = CreatureGeometry.load(id);
			ModelLayerLocation layer = new ModelLayerLocation(PortalGunMod.id(id), "main");
			EntityModelLayerRegistry.registerModelLayer(layer, geo::layer);
			EntityRendererRegistry.register(type, ctx -> new CreatureRenderer(ctx, spec, layer, geo));
			n++;
		}
		PortalGunMod.LOGGER.debug("Registered {} creature renderers", n);
	}
}
