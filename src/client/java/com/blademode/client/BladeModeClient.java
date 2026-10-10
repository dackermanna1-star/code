package com.blademode.client;

import com.blademode.BladeMode;
import com.blademode.client.gore.CorpseManager;
import com.blademode.client.gore.CorpseRenderer;
import com.blademode.client.render.CutBlockRenderer;
import com.blademode.client.render.PieceRenderer;
import com.blademode.client.render.SlashTrails;
import com.blademode.net.MobSlicePayload;
import com.blademode.net.SlashFxPayload;
import com.blademode.registry.ModBlocks;
import com.blademode.registry.ModEntities;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

public class BladeModeClient implements ClientModInitializer {
	private static KeyMapping toggleLineMode;

	@Override
	public void onInitializeClient() {
		EntityRenderers.register(ModEntities.PIECE, PieceRenderer::new);
		BlockEntityRenderers.register(ModBlocks.CUT_BLOCK_ENTITY, CutBlockRenderer::new);

		HudElementRegistry.attachElementAfter(VanillaHudElements.CROSSHAIR, BladeMode.id("blade_mode"), BladeHud::render);
		WorldRenderEvents.BEFORE_TRANSLUCENT.register(SlashTrails::render);
		WorldRenderEvents.END_EXTRACTION.register(CorpseRenderer::extract);
		WorldRenderEvents.BEFORE_ENTITIES.register(CorpseRenderer::render);

		ClientPlayNetworking.registerGlobalReceiver(SlashFxPayload.TYPE, (payload, context) -> {
			SlashTrails.add(payload);
			CorpseManager.onSlash(payload);
		});
		ClientPlayNetworking.registerGlobalReceiver(MobSlicePayload.TYPE, (payload, context) -> CorpseManager.onSlice(payload));
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			BladeInput.cancel();
			CorpseManager.clear();
		});

		toggleLineMode = KeyBindingHelper.registerKeyBinding(new KeyMapping(
			"key.blademode.toggle_line_mode", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_V, KeyMapping.Category.GAMEPLAY));

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			BladeInput.tick(mc);
			CorpseManager.tick(mc);
			while (toggleLineMode.consumeClick()) {
				BladeInput.toggleMode();
				if (mc.player != null) {
					mc.player.displayClientMessage(Component.translatable(BladeInput.mode() == BladeInput.LineMode.CENTERED
						? "message.blademode.mode.centered" : "message.blademode.mode.crosshair"), true);
				}
			}
		});
	}
}
