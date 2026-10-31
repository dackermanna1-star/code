package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.render.DomainClientState;
import com.jjkshowdown.domain.DomainType;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.ARGB;
import net.minecraft.world.attribute.EnvironmentAttributeSystem;
import net.minecraft.world.attribute.EnvironmentAttributes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(ClientLevel.class)
public abstract class ClientLevelMixin {
	/** Domain atmosphere: the sky and fog take on the domain's colour around the camera. */
	@Inject(method = "addEnvironmentAttributeLayers", at = @At("RETURN"))
	private void jjk$domainAtmosphere(EnvironmentAttributeSystem.Builder builder, CallbackInfoReturnable<EnvironmentAttributeSystem.Builder> cir) {
		builder.addPositionalLayer(EnvironmentAttributes.SKY_COLOR, (color, pos, interp) -> tint(color, pos, 0x000006, 0x3A0006));
		builder.addPositionalLayer(EnvironmentAttributes.FOG_COLOR, (color, pos, interp) -> tint(color, pos, 0x04040C, 0x2A0008));
		builder.addPositionalLayer(EnvironmentAttributes.CLOUD_COLOR, (color, pos, interp) -> tint(color, pos, 0x101018, 0x500010));
	}

	private static Integer tint(Integer color, net.minecraft.world.phys.Vec3 pos, int voidColor, int shrineColor) {
		if (pos == null || !ClientConfig.get().domainAtmosphere) return color;
		DomainType t = DomainClientState.insideType(pos);
		if (t == null) return color;
		float a = DomainClientState.atmosphere(pos);
		int target = (t == DomainType.UNLIMITED_VOID ? voidColor : shrineColor) | 0xFF000000;
		return ARGB.srgbLerp(a, color, target);
	}
}
