package com.gojosatoru.client.mixin;

import com.gojosatoru.client.ClientGojo;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.util.Mth;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Camera shake for the big impacts. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "bobHurt", at = @At("HEAD"))
    private void gojo$shake(PoseStack poseStack, float partialTick, CallbackInfo ci) {
        float shake = ClientGojo.shakeAmount(partialTick);
        if (shake > 0.001F) {
            float t = (ClientGojo.time + partialTick) * 1.7F;
            poseStack.mulPose(Axis.ZP.rotationDegrees(Mth.sin(t * 2.7F) * shake * 2.0F));
            poseStack.mulPose(Axis.XP.rotationDegrees(Mth.sin(t * 3.9F + 1.3F) * shake * 1.5F));
            poseStack.mulPose(Axis.YP.rotationDegrees(Mth.cos(t * 3.1F) * shake * 1.5F));
        }
    }
}
