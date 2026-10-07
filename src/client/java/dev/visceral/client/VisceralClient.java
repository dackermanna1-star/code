package dev.visceral.client;

import dev.visceral.Visceral;
import dev.visceral.client.fx.BleedingFx;
import dev.visceral.client.fx.BloodDecals;
import dev.visceral.client.fx.BloodFx;
import dev.visceral.client.fx.BloodParticles;
import dev.visceral.client.fx.Footprints;
import dev.visceral.client.fx.ScreenBlood;
import dev.visceral.client.ragdoll.Ragdoll;
import dev.visceral.client.ragdoll.RagdollManager;
import dev.visceral.client.wound.ClientWounds;
import dev.visceral.client.wound.WoundLayer;
import dev.visceral.network.HitFxPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientWorldEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.culling.Frustum;

public final class VisceralClient implements ClientModInitializer {
	private static Frustum frustum;

	@Override
	@SuppressWarnings({"unchecked", "rawtypes"})
	public void onInitializeClient() {
		ClientPlayNetworking.registerGlobalReceiver(HitFxPayload.TYPE, (payload, context) -> BloodFx.onHit(payload));

		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((entityType, renderer, helper, context) ->
			helper.register(new WoundLayer(renderer))
		);

		ClientTickEvents.END_CLIENT_TICK.register(VisceralClient::tick);
		WorldRenderEvents.END_EXTRACTION.register(context -> frustum = context.frustum());
		WorldRenderEvents.BEFORE_ENTITIES.register(VisceralClient::render);
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> clearAll());
		ClientWorldEvents.AFTER_CLIENT_WORLD_CHANGE.register((client, world) -> clearAll());
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Visceral.id("screen_blood"), ScreenBlood::render);
		ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) -> VisceralCommands.register(dispatcher));
	}

	private static void tick(Minecraft minecraft) {
		ClientLevel level = minecraft.level;
		if (level == null || minecraft.isPaused()) {
			return;
		}
		RagdollManager ragdolls = RagdollManager.get();
		BloodParticles.tick(level);
		BloodDecals.tick(level);
		ragdolls.tick(level);
		BleedingFx.tick(level, ragdolls.corpseEntities());
		Footprints.tick(level);
		ScreenBlood.tick();
		if (level.getGameTime() % 100 == 0) {
			ClientWounds.retain(id -> level.getEntity(id) != null || hasCorpse(ragdolls, id));
		}
	}

	private static boolean hasCorpse(RagdollManager ragdolls, int entityId) {
		for (Ragdoll ragdoll : ragdolls.all()) {
			if (ragdoll.entityId == entityId) {
				return true;
			}
		}
		return false;
	}

	private static void render(WorldRenderContext context) {
		Minecraft minecraft = Minecraft.getInstance();
		ClientLevel level = minecraft.level;
		if (level == null) {
			return;
		}
		Camera camera = minecraft.gameRenderer.getMainCamera();
		float partialTick = minecraft.getDeltaTracker().getGameTimeDeltaPartialTick(false);
		try {
			BloodDecals.submit(context.commandQueue(), camera.position(), frustum);
			BloodParticles.submit(context.commandQueue(), level, camera, frustum, partialTick);
		} catch (RuntimeException e) {
			Visceral.LOGGER.error("Failed to render blood", e);
		}
	}

	public static void clearAll() {
		BloodParticles.clear();
		BloodDecals.clear();
		RagdollManager.get().clear();
		ClientWounds.clear();
		Footprints.clear();
		ScreenBlood.clear();
	}
}
