package dev.juukulius.client;

import dev.juukulius.JuliusMod;
import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.client.anim.AnimClips;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.client.config.JuliusClientConfig;
import dev.juukulius.client.fx.BladeTrails;
import dev.juukulius.client.fx.CameraShake;
import dev.juukulius.client.fx.EffectManager;
import dev.juukulius.client.fx.FxContext;
import dev.juukulius.client.fx.FxHandler;
import dev.juukulius.client.fx.SpiritOrbit;
import dev.juukulius.client.hud.JuliusHud;
import dev.juukulius.client.input.ClientCombat;
import dev.juukulius.client.input.JuliusKeys;
import dev.juukulius.client.particle.JuliusParticleProviders;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.entity.ClaristaWaveRenderer;
import dev.juukulius.client.render.entity.ClauzeriaVortexRenderer;
import dev.juukulius.client.render.entity.FirestormRenderer;
import dev.juukulius.client.render.entity.SpiritBoltRenderer;
import dev.juukulius.client.render.entity.StoneSpikeRenderer;
import dev.juukulius.client.render.item.CladProperty;
import dev.juukulius.client.render.player.JuliusModelLayers;
import dev.juukulius.client.render.player.JuliusOutfitLayer;
import dev.juukulius.client.render.player.JuliusOutfitModel;
import dev.juukulius.client.render.player.RainbowAuraLayer;
import dev.juukulius.config.JuliusServerConfig;
import dev.juukulius.network.ActionRequestPayload;
import dev.juukulius.network.ActionResultPayload;
import dev.juukulius.network.AnimationPayload;
import dev.juukulius.network.FxPayload;
import dev.juukulius.network.ServerRulesPayload;
import dev.juukulius.mixin.client.PlayerModelAccessor;
import dev.juukulius.registry.JuliusEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.item.properties.conditional.ConditionalItemModelProperties;
import net.minecraft.server.packs.PackType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import org.joml.Matrix4f;
import org.joml.Quaternionf;

/** Client entrypoint: input, prediction, animation, rendering, particles, HUD and settings. */
public class JuliusClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		JuliusClientConfig.load();
		JuliusRenderTypes.init();
		JuliusKeys.init();
		JuliusModelLayers.init();
		JuliusParticleProviders.init();
		ConditionalItemModelProperties.ID_MAPPER.put(JuliusMod.id("clad"), CladProperty.MAP_CODEC);
		ResourceLoader.get(PackType.CLIENT_RESOURCES).registerReloader(JuliusMod.id("animations"), AnimClips.INSTANCE);

		EntityRenderers.register(JuliusEntities.SPIRIT_BOLT, SpiritBoltRenderer::new);
		EntityRenderers.register(JuliusEntities.AL_CLARISTA_WAVE, ClaristaWaveRenderer::new);
		EntityRenderers.register(JuliusEntities.AL_CLAUZERIA_VORTEX, ClauzeriaVortexRenderer::new);
		EntityRenderers.register(JuliusEntities.STONE_SPIKE, StoneSpikeRenderer::new);
		EntityRenderers.register(JuliusEntities.UL_GORA_FIRESTORM, FirestormRenderer::new);

		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((entityType, renderer, helper, context) -> {
			if (entityType == EntityType.PLAYER && renderer instanceof AvatarRenderer<?> avatarRenderer) {
				boolean slim = ((PlayerModelAccessor) avatarRenderer.getModel()).julius$isSlim();
				@SuppressWarnings("unchecked")
				AvatarRenderer<AbstractClientPlayer> parent = (AvatarRenderer<AbstractClientPlayer>) avatarRenderer;
				helper.register(new JuliusOutfitLayer(parent, new JuliusOutfitModel(context.bakeLayer(slim ? JuliusModelLayers.OUTFIT_SLIM : JuliusModelLayers.OUTFIT))));
				helper.register(new RainbowAuraLayer(parent, new PlayerModel(context.bakeLayer(slim ? JuliusModelLayers.AURA_SLIM : JuliusModelLayers.AURA), slim)));
			}
		});

		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, JuliusMod.id("hud"), JuliusHud::render);

		registerNetworking();
		registerTicking();
		registerRendering();
	}

	private static void registerNetworking() {
		ClientPlayNetworking.registerGlobalReceiver(AnimationPayload.TYPE, (payload, context) -> {
			Minecraft minecraft = context.client();
			if (minecraft.level == null) {
				return;
			}

			Entity entity = minecraft.level.getEntity(payload.entityId());
			if (!(entity instanceof AbstractClientPlayer player)) {
				return;
			}

			JuliusAnim animation = JuliusAnim.byId(payload.animation());
			float now = ClientClock.seconds(0.0F);
			var animator = AnimatorManager.get(player.getId());
			if (player == minecraft.player && !payload.correction() && animator.recentlyStarted(animation, now, 0.5F)) {
				return;
			}

			animator.play(animation, payload.speed(), now);
			if (payload.correction() && player == minecraft.player) {
				ClientCombat.onCorrection(animation);
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(FxPayload.TYPE, (payload, context) -> FxHandler.handle(payload));
		ClientPlayNetworking.registerGlobalReceiver(ActionResultPayload.TYPE, (payload, context) ->
			ClientCombat.onDenied(ActionRequestPayload.Action.byId(payload.action()), ActionResultPayload.DenyReason.byId(payload.reason())));
		ClientPlayNetworking.registerGlobalReceiver(ServerRulesPayload.TYPE, (payload, context) ->
			JuliusServerConfig.applyFromServer(payload.manaCostMultiplier(), payload.cooldownMultiplier()));

		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> client.execute(JuliusClient::resetAll));
		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> client.execute(JuliusClient::resetAll));
	}

	private static void resetAll() {
		AnimatorManager.clear();
		EffectManager.clear();
		SpiritOrbit.clear();
		BladeTrails.clear();
		CameraShake.reset();
		ClientCombat.reset();
		ClientJulius.reset();
	}

	private static void registerTicking() {
		ClientTickEvents.END_CLIENT_TICK.register(minecraft -> {
			if (minecraft.isPaused()) {
				return;
			}

			ClientClock.tick();
			CameraShake.tick();
			if (minecraft.level == null || minecraft.player == null) {
				return;
			}

			ClientJulius.tick();
			ClientCombat.tick(minecraft);
			AnimatorManager.tick(minecraft.level);
			EffectManager.tick(minecraft.level);
			SpiritOrbit.tick(minecraft.level);
			if (ClientClock.ticks() % 100 == 0) {
				BladeTrails.prune(ClientClock.seconds(0.0F));
			}
		});
	}

	private static void registerRendering() {
		WorldRenderEvents.AFTER_ENTITIES.register(context -> {
			Minecraft minecraft = Minecraft.getInstance();
			if (minecraft.level == null) {
				return;
			}

			float partialTick = minecraft.getDeltaTracker().getGameTimeDeltaPartialTick(false);
			var camera = minecraft.gameRenderer.getMainCamera();
			Matrix4f matrix = new Matrix4f(context.matrices().last().pose());
			FxContext fx = new FxContext(context.consumers(), matrix, camera.position(), new Quaternionf(camera.rotation()), partialTick,
				ClientClock.seconds(partialTick), minecraft.options.getCameraType().isFirstPerson());
			SpiritOrbit.render(fx, minecraft.level);
			BladeTrails.renderWorld(fx);
			EffectManager.render(fx);
		});
	}
}
