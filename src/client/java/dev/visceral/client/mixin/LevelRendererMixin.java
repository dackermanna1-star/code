package dev.visceral.client.mixin;

import dev.visceral.client.ragdoll.RagdollManager;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.state.LevelRenderState;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Keeps drawing corpses after the game removed their entity (vanilla removes mobs 20 ticks after death). */
@Mixin(LevelRenderer.class)
abstract class LevelRendererMixin {
	@Shadow
	@Final
	private EntityRenderDispatcher entityRenderDispatcher;

	@Inject(method = "extractVisibleEntities", at = @At("TAIL"), require = 0)
	private void visceral$extractCorpses(Camera camera, Frustum frustum, DeltaTracker deltaTracker, LevelRenderState state, CallbackInfo ci) {
		RagdollManager.get().extractCorpses(camera, frustum, deltaTracker.getGameTimeDeltaPartialTick(false), state, this.entityRenderDispatcher);
	}
}
