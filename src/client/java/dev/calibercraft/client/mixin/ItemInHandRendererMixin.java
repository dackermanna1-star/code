package dev.calibercraft.client.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.calibercraft.client.render.FirstPersonRenderer;
import dev.calibercraft.item.WeaponStacks;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Hands first-person rendering of firearms to {@link FirstPersonRenderer}; weapons are held with both hands. */
@Mixin(ItemInHandRenderer.class)
abstract class ItemInHandRendererMixin {
	@Inject(method = "renderArmWithItem", at = @At("HEAD"), cancellable = true)
	private void calibercraft$renderFirearm(AbstractClientPlayer player, float partial, float pitch, InteractionHand hand, float swing,
			ItemStack stack, float equip, PoseStack pose, SubmitNodeCollector collector, int light, CallbackInfo ci) {
		if (hand == InteractionHand.MAIN_HAND && WeaponStacks.isFirearm(stack)) {
			if (FirstPersonRenderer.render(player, partial, pose, collector, light, stack)) {
				ci.cancel();
			}
		} else if (hand == InteractionHand.OFF_HAND && WeaponStacks.isFirearm(player.getMainHandItem())) {
			ci.cancel();
		}
	}
}
