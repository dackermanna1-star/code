package com.chaosunleashed.mixin;

import com.chaosunleashed.core.ChaosEnvironment;
import net.minecraft.world.World;
import net.minecraft.world.attribute.WorldEnvironmentAttributeAccess;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Adds the Chaos sky/fog/light/gameplay modifiers to every world's environment attributes (client and server). */
@Mixin(WorldEnvironmentAttributeAccess.class)
public abstract class WorldEnvironmentAttributeAccessMixin {
	@Inject(method = "addModifiersFromWorld", at = @At("TAIL"))
	private static void chaosunleashed$addChaosModifiers(WorldEnvironmentAttributeAccess.Builder builder, World world, CallbackInfo ci) {
		ChaosEnvironment.addModifiers(builder, world);
	}
}
