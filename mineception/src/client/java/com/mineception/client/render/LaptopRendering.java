package com.mineception.client.render;

import com.mineception.Mineception;
import com.mineception.ModContent;
import com.mineception.dream.Theme;
import com.mineception.dream.render.NestedRenderer;
import com.mineception.dream.render.Raycaster;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.ResourceManagerReloadListener;

/**
 * Client rendering setup: the real-world laptop's live screen (block entity renderer), texture loading and session
 * bookkeeping. Holds the one dream renderer every session shares.
 */
public final class LaptopRendering {
	private static final ResourceTextureSource TEXTURES = new ResourceTextureSource();
	private static final Raycaster RAYCASTER = new Raycaster(TEXTURES);
	private static final NestedRenderer RENDERER = new NestedRenderer(RAYCASTER);

	private LaptopRendering() {
	}

	/** Called once from the client entrypoint. */
	public static void init() {
		BlockEntityRenderers.register(ModContent.LAPTOP_BLOCK_ENTITY, LaptopScreenRenderer::new);
		ClientTickEvents.END_CLIENT_TICK.register(DreamSession::tickAll);
		ResourceLoader.get(PackType.CLIENT_RESOURCES).registerReloader(Mineception.id("dream_textures"),
			(ResourceManagerReloadListener) resourceManager -> {
				TEXTURES.clear();
				RAYCASTER.invalidateTextures();
				// Decode the block textures now, behind the loading screen, rather than when a laptop first shows up
				for (Theme theme : Theme.values()) {
					RAYCASTER.prepareTextures(theme);
				}
			});
	}

	/** The raycaster drawing every dream level (textures from the active resource packs). */
	public static Raycaster raycaster() {
		return RAYCASTER;
	}

	/** Renders a level with the deeper levels on its laptop screens. */
	public static NestedRenderer renderer() {
		return RENDERER;
	}
}
