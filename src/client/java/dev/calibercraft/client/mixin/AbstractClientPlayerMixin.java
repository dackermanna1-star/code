package dev.calibercraft.client.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.calibercraft.client.GunController;
import dev.calibercraft.core.Stat;
import dev.calibercraft.server.GunService;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Aim-down-sights zoom (field of view divided by the weapon's zoom), and the weapon's own movement-speed
 * modifier is excluded from vanilla's speed-based FOV change so aiming does not "breathe" the view.
 */
@Mixin(AbstractClientPlayer.class)
abstract class AbstractClientPlayerMixin {
	@ModifyExpressionValue(method = "getFieldOfViewModifier", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/player/AbstractClientPlayer;getAttributeValue(Lnet/minecraft/core/Holder;)D"))
	private double calibercraft$ignoreHandlingSpeed(double value) {
		AbstractClientPlayer self = (AbstractClientPlayer) (Object) this;
		AttributeInstance attr = self.getAttribute(Attributes.MOVEMENT_SPEED);
		if (attr != null) {
			AttributeModifier m = attr.getModifier(GunService.handlingModifierId());
			if (m != null && m.amount() > -0.99) {
				return value / (1.0 + m.amount());
			}
		}
		return value;
	}

	@Inject(method = "getFieldOfViewModifier", at = @At("RETURN"), cancellable = true)
	private void calibercraft$aimZoom(boolean firstPerson, float effectScale, CallbackInfoReturnable<Float> cir) {
		if (!((Object) this instanceof LocalPlayer) || !firstPerson) {
			return;
		}
		GunController c = GunController.INSTANCE;
		if (c.active() && c.ads > 0) {
			float zoom = (float) Math.max(1.0, c.stats().get(Stat.ZOOM));
			float t = c.ads * c.ads * (3 - 2 * c.ads);
			cir.setReturnValue(cir.getReturnValueF() / (1 + (zoom - 1) * t));
		}
	}
}
