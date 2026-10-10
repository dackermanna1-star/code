package com.blademode.client.compat.mixin.visceral;

import com.blademode.client.gore.CorpseManager;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Visceral ragdolls whole bodies; a creature Blade Mode cut apart already has its pieces. */
@Pseudo
@Mixin(targets = "dev.visceral.client.ragdoll.RagdollManager", remap = false)
public abstract class RagdollManagerMixin {
	@Inject(method = "start", at = @At("HEAD"), cancellable = true, require = 0, remap = false)
	private void blademode$leaveSlicedCorpses(LivingEntity entity, CallbackInfo ci) {
		if (CorpseManager.isSliced(entity)) {
			ci.cancel();
		}
	}
}
