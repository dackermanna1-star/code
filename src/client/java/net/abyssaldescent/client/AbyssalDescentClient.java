package net.abyssaldescent.client;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.fx.CameraShake;
import net.abyssaldescent.client.fx.ClientEffects;
import net.abyssaldescent.client.hud.DungeonBossBar;
import net.abyssaldescent.client.hud.ExpeditionHud;
import net.abyssaldescent.client.hud.TooltipWrap;
import net.abyssaldescent.client.model.BarrowKnightModel;
import net.abyssaldescent.client.model.CryptGhoulModel;
import net.abyssaldescent.client.model.WailingSkullModel;
import net.abyssaldescent.client.particle.ModParticleProviders;
import net.abyssaldescent.client.render.BoneSkeletonRenderer;
import net.abyssaldescent.client.render.DelverMerchantRenderer;
import net.abyssaldescent.client.render.DungeonMobRenderer;
import net.abyssaldescent.client.render.HollowWardenRenderer;
import net.abyssaldescent.client.render.ModModelLayers;
import net.abyssaldescent.client.render.RisenRenderer;
import net.abyssaldescent.client.render.SoulBoltRenderer;
import net.abyssaldescent.client.render.TelegraphRenderer;
import net.abyssaldescent.dungeon.run.Unsecured;
import net.abyssaldescent.network.CameraShakePayload;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.registry.ModEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.ChatFormatting;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.AnimationState;

public final class AbyssalDescentClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ModModelLayers.init();
		registerEntityRenderers();
		ModParticleProviders.init();
		registerBlockLayers();
		registerHud();
		registerEvents();
	}

	private static void registerEntityRenderers() {
		EntityRendererRegistry.register(ModEntities.RISEN, RisenRenderer::new);
		EntityRendererRegistry.register(ModEntities.BONE_ARCHER, ctx -> new BoneSkeletonRenderer<>(ctx, "bone_archer"));
		EntityRendererRegistry.register(ModEntities.BONE_SHIELDBEARER, ctx -> new BoneSkeletonRenderer<>(ctx, "bone_shieldbearer"));
		EntityRendererRegistry.register(ModEntities.CRYPT_GHOUL, ctx -> new DungeonMobRenderer<>(ctx,
			new CryptGhoulModel(ctx.bakeLayer(ModModelLayers.CRYPT_GHOUL)), 0.6F, "crypt_ghoul",
			e -> new AnimationState[] {e.crouchAnimation, e.leapAnimation, e.dazedAnimation}, false));
		EntityRendererRegistry.register(ModEntities.WAILING_SKULL, ctx -> new DungeonMobRenderer<>(ctx,
			new WailingSkullModel(ctx.bakeLayer(ModModelLayers.WAILING_SKULL)), 0.3F, "wailing_skull",
			e -> new AnimationState[] {e.chargeAnimation}, true));
		EntityRendererRegistry.register(ModEntities.BARROW_KNIGHT, ctx -> new DungeonMobRenderer<>(ctx,
			new BarrowKnightModel(ctx.bakeLayer(ModModelLayers.BARROW_KNIGHT)), 0.8F, "barrow_knight",
			e -> new AnimationState[] {e.smashAnimation, e.bashAnimation}, true));
		EntityRendererRegistry.register(ModEntities.HOLLOW_WARDEN, HollowWardenRenderer::new);
		EntityRendererRegistry.register(ModEntities.DELVER_MERCHANT, DelverMerchantRenderer::new);
		EntityRendererRegistry.register(ModEntities.SOUL_BOLT, SoulBoltRenderer::new);
		EntityRendererRegistry.register(ModEntities.TELEGRAPH, TelegraphRenderer::new);
	}

	private static void registerBlockLayers() {
		BlockRenderLayerMap.putBlocks(ChunkSectionLayer.TRANSLUCENT, ModBlocks.RUNIC_SEAL, ModBlocks.DESCENT_RIFT);
		BlockRenderLayerMap.putBlocks(ChunkSectionLayer.CUTOUT, ModBlocks.ABYSSAL_GATE, ModBlocks.WAYSTONE, ModBlocks.SPIKE_TRAP, ModBlocks.DART_TRAP,
			ModBlocks.CRUMBLING_STONE_BRICKS,
			ModBlocks.RELIQUARY, ModBlocks.BURIAL_URN, ModBlocks.ALTAR_OF_TRIALS, ModBlocks.CURSED_IDOL, ModBlocks.SOUL_BRAZIER,
			ModBlocks.RUNE_STONE);
	}

	private static void registerHud() {
		HudElementRegistry.attachElementAfter(VanillaHudElements.BOSS_BAR, AbyssalDescent.id("expedition"), ExpeditionHud::render);
		HudElementRegistry.replaceElement(VanillaHudElements.BOSS_BAR, vanilla -> (graphics, delta) -> {
			if (!DungeonBossBar.render(graphics, delta)) {
				vanilla.render(graphics, delta);
			}
		});
	}

	private static void registerEvents() {
		ClientTickEvents.END_CLIENT_TICK.register(minecraft -> {
			CameraShake.tick();
			if (minecraft.player == null) {
				return;
			}
			ExpeditionHud.tick(minecraft);
			DungeonBossBar.tick(minecraft);
			ClientEffects.tick(minecraft);
		});
		ClientPlayNetworking.registerGlobalReceiver(CameraShakePayload.TYPE, (payload, context) ->
			CameraShake.add(payload.intensity(), payload.duration()));
		ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
			if (Unsecured.isUnsecured(stack)) {
				int at = Math.min(1, lines.size());
				lines.add(at, Component.translatable("tooltip.abyssal_descent.unsecured").withStyle(ChatFormatting.GOLD));
				lines.add(at + 1, Component.translatable("tooltip.abyssal_descent.unsecured.hint").withStyle(ChatFormatting.DARK_GRAY,
					ChatFormatting.ITALIC));
			}
			if (BuiltInRegistries.ITEM.getKey(stack.getItem()).getNamespace().equals(AbyssalDescent.MOD_ID)) {
				TooltipWrap.wrap(lines);
			}
		});
	}
}
