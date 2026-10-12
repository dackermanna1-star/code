package com.extremesports.client;

import com.extremesports.ExtremeSports;
import com.extremesports.client.anim.BailAnimations;
import com.extremesports.client.anim.ClientAnimSync;
import com.extremesports.client.anim.RideAnimState;
import com.extremesports.client.camera.CameraEffects;
import com.extremesports.client.fx.RideFx;
import com.extremesports.client.hud.SportsHud;
import com.extremesports.client.input.ClientRideInput;
import com.extremesports.client.input.Keybinds;
import com.extremesports.client.render.EquipmentModel;
import com.extremesports.client.render.EquipmentRenderer;
import com.extremesports.client.render.RampModels;
import com.extremesports.client.render.SkatesLayer;
import com.extremesports.client.screen.SportsMenuScreen;
import com.extremesports.client.screen.WorkshopScreen;
import com.extremesports.client.sound.RideSounds;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.Payloads;
import com.extremesports.physics.RideController;
import com.extremesports.registry.ModBlocks;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModSounds;
import com.extremesports.sport.EquipmentKind;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

public class ExtremeSportsClient implements ClientModInitializer {
	private static boolean wasRiding;
	private static CameraType cameraBeforeRiding = CameraType.FIRST_PERSON;
	private static boolean restoreAfterBail;

	@Override
	public void onInitializeClient() {
		ClientConfig.load();
		applyConfig();
		Keybinds.init();

		for (EquipmentKind kind : EquipmentKind.values()) {
			EntityModelLayerRegistry.registerModelLayer(EquipmentRenderer.LAYERS.get(kind), () -> EquipmentRenderer.SPECS.get(kind).layer());
		}
		EntityRendererRegistry.register(ModEntities.SKATEBOARD, EquipmentRenderer::new);
		EntityRendererRegistry.register(ModEntities.BMX, EquipmentRenderer::new);
		EntityRendererRegistry.register(ModEntities.SCOOTER, EquipmentRenderer::new);
		EntityRendererRegistry.register(ModEntities.SKATES, EquipmentRenderer::new);
		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((entityType, renderer, helper, context) -> {
			if (renderer instanceof AvatarRenderer<?> avatarRenderer) {
				@SuppressWarnings("unchecked")
				var parent = (net.minecraft.client.renderer.entity.RenderLayerParent<AvatarRenderState, PlayerModel>) (Object) avatarRenderer;
				EquipmentModel skate = new EquipmentModel(context.bakeLayer(EquipmentRenderer.LAYERS.get(EquipmentKind.SKATES)),
					EquipmentRenderer.SPECS.get(EquipmentKind.SKATES));
				helper.register(new SkatesLayer(parent, skate));
			}
		});
		RampModels.register();
		com.extremesports.client.render.EquipmentColorTint.register();
		net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap.putBlocks(net.minecraft.client.renderer.chunk.ChunkSectionLayer.CUTOUT,
			ModBlocks.GRIND_RAIL, ModBlocks.GRIND_RAIL_INCLINE, ModBlocks.START_GATE, ModBlocks.CHECKPOINT_GATE, ModBlocks.FINISH_GATE);

		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, ExtremeSports.id("hud"), SportsHud::render);

		SportEquipmentEntity.clientInput = ClientRideInput::poll;
		SportEquipmentEntity.clientAfterTick = entity -> {
			if (entity.ride.events != ClientRideEvents.INSTANCE) {
				entity.ride.events = ClientRideEvents.INSTANCE;
			}
			ClientAnimSync.afterTick(entity);
		};

		ClientTickEvents.END_CLIENT_TICK.register(ExtremeSportsClient::tick);
		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
			ClientSportsState.reset();
			RideSounds.clear();
			sendSettings();
		});
		registerReceivers();
	}

	public static void applyConfig() {
		ClientConfig config = ClientConfig.get();
		SportEquipmentEntity.cameraFollowsSteering = config.steering == ClientConfig.SteeringMode.KEYBOARD;
	}

	public static void sendSettings() {
		if (ClientPlayNetworking.canSend(Payloads.Settings.TYPE)) {
			ClientConfig config = ClientConfig.get();
			ClientPlayNetworking.send(new Payloads.Settings(config.preset, config.goofy, config.autoPickup));
		}
	}

	private static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			wasRiding = false;
			return;
		}
		CameraEffects.tick();
		for (Entity entity : mc.level.entitiesForRendering()) {
			if (entity instanceof SportEquipmentEntity equipment) {
				RideAnimState state = RideAnimState.of(equipment);
				state.tick(equipment);
				if (equipment.getControllingPassenger() != null) {
					RideFx.tick(equipment, state.contact == RideController.Contact.GRIND,
						(state.flags & SportEquipmentEntity.FLAG_POWERSLIDE) != 0, state.contact == RideController.Contact.AIR, state.speed.value);
				}
				RideSounds.tick(equipment);
			}
		}

		boolean riding = mc.player.getVehicle() instanceof SportEquipmentEntity;
		if (riding != wasRiding && ClientConfig.get().autoThirdPerson) {
			if (riding) {
				if (!restoreAfterBail) {
					cameraBeforeRiding = mc.options.getCameraType();
				}
				restoreAfterBail = false;
				if (mc.options.getCameraType().isFirstPerson()) {
					mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
				}
			} else if (BailAnimations.isBailing(mc.player, BailAnimations.TOTAL)) {
				restoreAfterBail = true;
			} else {
				mc.options.setCameraType(cameraBeforeRiding);
			}
		}
		if (restoreAfterBail && !riding && !BailAnimations.isBailing(mc.player, BailAnimations.TOTAL)) {
			restoreAfterBail = false;
			mc.options.setCameraType(cameraBeforeRiding);
		}
		wasRiding = riding;
		if (!riding) {
			ClientRideInput.discardTaps();
		}

		while (Keybinds.MENU.consumeClick()) {
			mc.setScreen(new SportsMenuScreen(null));
		}
		while (Keybinds.REMOUNT.consumeClick()) {
			ClientPlayNetworking.send(new Payloads.Remount());
		}
		while (Keybinds.PRACTICE_RESET.consumeClick()) {
			ClientPlayNetworking.send(new Payloads.ChallengeAction("practice_return", ""));
		}
	}

	private static void registerReceivers() {
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ComboScored.TYPE, (payload, context) -> {
			if (payload.accepted() && payload.landed()) {
				ClientSportsState.finishedScore = payload.total();
				ClientSportsState.finishedMultiplier = payload.multiplier();
				ClientSportsState.sessionScore += payload.total();
				ClientSportsState.sessionBest = Math.max(ClientSportsState.sessionBest, payload.total());
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.BailAnim.TYPE, (payload, context) -> {
			Minecraft mc = context.client();
			if (mc.level == null) {
				return;
			}
			Entity entity = mc.level.getEntity(payload.playerId());
			if (entity instanceof Player player) {
				if (player == mc.player) {
					player.setDeltaMovement(new Vec3(payload.vx(), payload.vy(), payload.vz()));
					if (!BailAnimations.isBailing(player, 5)) {
						BailAnimations.start(player, player.getYRot());
					}
				} else {
					BailAnimations.start(player, player.getYRot());
				}
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.OpenWorkshop.TYPE, (payload, context) -> context.client().setScreen(new WorkshopScreen(payload.pos(), null)));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ChallengeState.TYPE, (payload, context) -> {
			ClientSportsState.challenge = payload;
			if (context.client().level != null) {
				ClientSportsState.challengeTime = context.client().level.getGameTime();
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Unlocked.TYPE, (payload, context) -> {
			ClientSportsState.toasts.addLast(Component.translatable("unlock.extremesports." + payload.unlock()));
			Minecraft mc = context.client();
			if (mc.player != null) {
				mc.player.level().playLocalSound(mc.player.getX(), mc.player.getY(), mc.player.getZ(), ModSounds.UI_UNLOCK, SoundSource.PLAYERS, 0.6F, 1.0F, false);
			}
		});
	}
}
