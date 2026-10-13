package dev.calibercraft.client.mixin;

import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.registry.ModTags;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * While a firearm is held, attack = fire and use = aim (handled by the gun controller), so vanilla attacking,
 * block breaking and item use are suppressed — except right-clicking interactive blocks (doors, chests,
 * the gunsmith bench...) and entities, which keeps the world usable without switching items.
 */
@Mixin(Minecraft.class)
abstract class MinecraftMixin {
	@Shadow
	public @Nullable LocalPlayer player;
	@Shadow
	public @Nullable HitResult hitResult;
	@Shadow
	public @Nullable ClientLevel level;

	private boolean calibercraft$holdingGun() {
		return player != null && WeaponStacks.isFirearm(player.getMainHandItem());
	}

	@Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
	private void calibercraft$noAttack(CallbackInfoReturnable<Boolean> cir) {
		if (calibercraft$holdingGun()) {
			cir.setReturnValue(false);
		}
	}

	@Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
	private void calibercraft$noMining(boolean attacking, CallbackInfo ci) {
		if (calibercraft$holdingGun()) {
			ci.cancel();
		}
	}

	@Inject(method = "startUseItem", at = @At("HEAD"), cancellable = true)
	private void calibercraft$aimInsteadOfUse(CallbackInfo ci) {
		if (!calibercraft$holdingGun() || level == null) {
			return;
		}
		if (hitResult instanceof BlockHitResult bhr && hitResult.getType() == HitResult.Type.BLOCK
			&& level.getBlockState(bhr.getBlockPos()).is(ModTags.GUN_INTERACTABLE) && !player.isSecondaryUseActive()) {
			return;
		}
		if (hitResult != null && hitResult.getType() == HitResult.Type.ENTITY) {
			return;
		}
		ci.cancel();
	}
}
