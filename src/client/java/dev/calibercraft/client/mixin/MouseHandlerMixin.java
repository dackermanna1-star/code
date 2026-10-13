package dev.calibercraft.client.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.calibercraft.client.GunController;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.core.Stat;
import dev.calibercraft.data.AttachmentDefinition;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Scales mouse sensitivity while aiming so angular speed stays consistent with the zoom. */
@Mixin(MouseHandler.class)
abstract class MouseHandlerMixin {
	@WrapOperation(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
	private void calibercraft$aimSensitivity(LocalPlayer player, double yaw, double pitch, Operation<Void> original) {
		GunController c = GunController.INSTANCE;
		double factor = 1.0;
		if (c.active() && c.ads > 0) {
			ClientConfig cfg = ClientConfig.get();
			double zoom = Math.max(1.0, c.stats().get(Stat.ZOOM));
			boolean scope = c.optic().flatMap(AttachmentDefinition::optic).map(AttachmentDefinition.Optic::overlay).orElse(false);
			double target = (scope ? cfg.scopeSensitivity : cfg.aimSensitivity) / Math.pow(zoom, 0.85);
			factor = 1.0 + (target - 1.0) * c.ads;
		}
		c.onMouseTurn(pitch * factor);
		original.call(player, yaw * factor, pitch * factor);
	}
}
