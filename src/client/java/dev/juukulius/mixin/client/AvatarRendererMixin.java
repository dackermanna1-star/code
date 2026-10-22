package dev.juukulius.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.client.anim.PoseSnapshot;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.client.render.player.JuliusPlayerRendering;
import dev.juukulius.client.render.player.JuliusRenderInfo;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.entity.player.PlayerModelType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Hooks Julius into player rendering: render-state data, the skin swap, root motion and the first-person arm skin. */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {
	@Inject(
		method = "extractRenderState(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
		at = @At("TAIL")
	)
	private void julius$extract(Avatar avatar, AvatarRenderState state, float partialTick, CallbackInfo ci) {
		if (avatar instanceof AbstractClientPlayer player) {
			JuliusPlayerRendering.extract(player, state, partialTick);
		} else {
			state.setData(JuliusRenderInfo.POSE, null);
			state.setData(JuliusRenderInfo.INFO, null);
		}
	}

	@Inject(
		method = "getTextureLocation(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;)Lnet/minecraft/resources/Identifier;",
		at = @At("HEAD"),
		cancellable = true
	)
	private void julius$skin(AvatarRenderState state, CallbackInfoReturnable<Identifier> cir) {
		JuliusRenderInfo info = state.getData(JuliusRenderInfo.INFO);
		if (info != null && info.juliusSkin) {
			cir.setReturnValue(state.skin.model() == PlayerModelType.SLIM ? JuliusTextures.SKIN_SLIM : JuliusTextures.SKIN_WIDE);
		}
	}

	@Inject(
		method = "setupRotations(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;FF)V",
		at = @At("TAIL")
	)
	private void julius$rootMotion(AvatarRenderState state, PoseStack poseStack, float bodyRot, float scale, CallbackInfo ci) {
		PoseSnapshot pose = state.getData(JuliusRenderInfo.POSE);
		if (pose != null && !state.isFallFlying && state.swimAmount <= 0.0F) {
			pose.applyRoot(poseStack);
		}
	}

	/** First-person arms use the skin passed in explicitly; swap it for Julius's sleeve while transformed. */
	@ModifyVariable(method = "renderHand", at = @At("HEAD"), argsOnly = true)
	private Identifier julius$handSkin(Identifier skin) {
		AbstractClientPlayer player = Minecraft.getInstance().player;
		if (player != null && JuliusAttachments.appearance(player).transformed()) {
			return player.getSkin().model() == PlayerModelType.SLIM ? JuliusTextures.SKIN_SLIM : JuliusTextures.SKIN_WIDE;
		}

		return skin;
	}
}
