package com.blademode.client.mixin;

import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(GameRenderer.class)
public interface GameRendererAccessor {
	/** The vertical field of view actually used for the current frame. */
	@Invoker("getFov")
	float blademode$getFov(Camera camera, float partialTick, boolean useFovSetting);
}
