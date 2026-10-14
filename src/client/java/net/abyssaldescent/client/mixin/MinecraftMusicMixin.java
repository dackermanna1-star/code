package net.abyssaldescent.client.mixin;

import net.abyssaldescent.client.fx.BossMusic;
import net.minecraft.client.Minecraft;
import net.minecraft.sounds.Music;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Vanilla only plays boss music in the End; the depths get their own zone themes while a boss bar requests music. */
@Mixin(Minecraft.class)
public abstract class MinecraftMusicMixin {
	@Inject(method = "getSituationalMusic", at = @At("HEAD"), cancellable = true)
	private void abyssal_descent$bossMusic(CallbackInfoReturnable<Music> cir) {
		Music music = BossMusic.select((Minecraft) (Object) this);
		if (music != null) {
			cir.setReturnValue(music);
		}
	}
}
