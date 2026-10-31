package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.render.DomainClientState;
import com.jjkshowdown.domain.DomainType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.fog.FogRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(FogRenderer.class)
public abstract class FogRendererMixin {
	/** Malevolent Shrine fills the air with a crimson haze. */
	@ModifyVariable(method = "updateBuffer", at = @At("HEAD"), ordinal = 0, argsOnly = true)
	private float jjk$fogStart(float start) {
		return shrine() ? Math.min(start, 6f) : start;
	}

	@ModifyVariable(method = "updateBuffer", at = @At("HEAD"), ordinal = 1, argsOnly = true)
	private float jjk$fogEnd(float end) {
		return shrine() ? Math.min(end, 64f) : end;
	}

	private static boolean shrine() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || !ClientConfig.get().domainAtmosphere) return false;
		return DomainClientState.insideType(mc.gameRenderer.getMainCamera().position()) == DomainType.MALEVOLENT_SHRINE;
	}
}
