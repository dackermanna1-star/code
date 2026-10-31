package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.sound.MusicController;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.Minecraft;
import net.minecraft.sounds.Music;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
	/** Domain themes and rival battle music. */
	@Inject(method = "getSituationalMusic", at = @At("HEAD"), cancellable = true)
	private void jjk$music(CallbackInfoReturnable<Music> cir) {
		Minecraft self = (Minecraft) (Object) this;
		if (self.screen != null) return;
		Music m = MusicController.situational();
		if (m != null) cir.setReturnValue(m);
	}

	/** Six Eyes: Gojo perceives cursed energy through walls. */
	@Inject(method = "shouldEntityAppearGlowing", at = @At("RETURN"), cancellable = true)
	private void jjk$sixEyes(Entity entity, CallbackInfoReturnable<Boolean> cir) {
		if (cir.getReturnValueZ()) return;
		Minecraft self = (Minecraft) (Object) this;
		if (self.player == null || entity == self.player || !ClientConfig.get().sixEyesOutlines) return;
		if (ClientState.character() != CharacterType.GOJO || !ClientState.serverConfig.characters.sixEyesSeeThroughWalls) return;
		if (!(entity instanceof LivingEntity) || !(entity instanceof Enemy || entity instanceof Player || entity instanceof SorcererBoss)) return;
		if (entity.distanceToSqr(self.player) > 28 * 28) return;
		if (!self.player.hasLineOfSight(entity)) cir.setReturnValue(true);
	}
}
