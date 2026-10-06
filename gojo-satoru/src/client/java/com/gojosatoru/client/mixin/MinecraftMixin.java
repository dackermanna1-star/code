package com.gojosatoru.client.mixin;

import com.gojosatoru.client.ClientGojo;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The Six Eyes outline every hostile mob nearby, even through walls. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @Inject(method = "shouldEntityAppearGlowing", at = @At("HEAD"), cancellable = true)
    private void gojo$sixEyes(Entity entity, CallbackInfoReturnable<Boolean> cir) {
        if (ClientGojo.sixEyesSees(entity)) {
            cir.setReturnValue(true);
        }
    }
}
