package dev.visceral.mixin.client;

import dev.visceral.client.render.CorpseManager;
import dev.visceral.client.render.RenderHooks;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.state.LevelRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LevelRenderer.class)
public abstract class LevelRendererMixin {
	@Inject(method = "extractVisibleEntities", at = @At("HEAD"))
	private void visceral$beginExtract(Camera camera, Frustum frustum, DeltaTracker deltaTracker, LevelRenderState state, CallbackInfo ci) {
		RenderHooks.beginWorldExtraction();
	}

	@Inject(method = "extractVisibleEntities", at = @At("RETURN"))
	private void visceral$endExtract(Camera camera, Frustum frustum, DeltaTracker deltaTracker, LevelRenderState state, CallbackInfo ci) {
		try {
			CorpseManager.extract(state.entityRenderStates, deltaTracker.getGameTimeDeltaPartialTick(true));
		} finally {
			RenderHooks.endWorldExtraction();
		}
	}
}
