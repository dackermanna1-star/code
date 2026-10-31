package com.jjkshowdown.mixin.client;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.ClientAsset;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(AbstractClientPlayer.class)
public abstract class AbstractClientPlayerMixin {
	@Unique
	private static final PlayerSkin JJK_GOJO = PlayerSkin.insecure(new ClientAsset.ResourceTexture(JjkShowdown.id("entity/gojo")), null, null, PlayerModelType.WIDE);
	@Unique
	private static final PlayerSkin JJK_SUKUNA = PlayerSkin.insecure(new ClientAsset.ResourceTexture(JjkShowdown.id("entity/sukuna")), null, null, PlayerModelType.WIDE);

	/** Players who chose a character look like them (toggle: Character skins). */
	@Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
	private void jjk$skin(CallbackInfoReturnable<PlayerSkin> cir) {
		if (!ClientConfig.get().characterSkins) return;
		CharacterType c = ClientState.characterOf((AbstractClientPlayer) (Object) this);
		if (c == CharacterType.GOJO) cir.setReturnValue(JJK_GOJO);
		else if (c == CharacterType.SUKUNA) cir.setReturnValue(JJK_SUKUNA);
	}
}
