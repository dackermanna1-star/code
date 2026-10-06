package com.gojosatoru.client.mixin;

import com.gojosatoru.GojoMod;
import com.gojosatoru.client.ClientGojo;
import com.gojosatoru.power.GojoForm;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.ClientAsset;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Dresses transformed players as Gojo: blindfold normally, Six Eyes uncovered for his big techniques. */
@Mixin(AbstractClientPlayer.class)
public abstract class AbstractClientPlayerMixin {
    @Unique
    private static final ClientAsset.ResourceTexture GOJO_BLINDFOLD = new ClientAsset.ResourceTexture(GojoMod.id("entity/gojo_blindfold"));
    @Unique
    private static final ClientAsset.ResourceTexture GOJO_SIX_EYES = new ClientAsset.ResourceTexture(GojoMod.id("entity/gojo_six_eyes"));

    @Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
    private void gojo$useGojoSkin(CallbackInfoReturnable<PlayerSkin> cir) {
        GojoForm form = ClientGojo.form((AbstractClientPlayer) (Object) this);
        if (form.transformed()) {
            PlayerSkin skin = cir.getReturnValue();
            cir.setReturnValue(new PlayerSkin(form.sixEyes() ? GOJO_SIX_EYES : GOJO_BLINDFOLD, skin.cape(), skin.elytra(),
                    PlayerModelType.WIDE, skin.secure()));
        }
    }
}
