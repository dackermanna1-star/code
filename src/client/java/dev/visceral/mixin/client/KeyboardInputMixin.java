package dev.visceral.mixin.client;

import dev.visceral.client.input.MovementController;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.ClientInput;
import net.minecraft.client.player.KeyboardInput;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardInput.class)
public abstract class KeyboardInputMixin {
	@Inject(method = "tick", at = @At("TAIL"))
	private void visceral$process(CallbackInfo ci) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.player.input != (Object) this) return;
		ClientInput self = (ClientInput) (Object) this;
		ClientInputAccessor acc = (ClientInputAccessor) self;
		self.keyPresses = MovementController.process(mc.player, self.keyPresses, self.getMoveVector(), acc::visceral$setMoveVector);
	}
}
