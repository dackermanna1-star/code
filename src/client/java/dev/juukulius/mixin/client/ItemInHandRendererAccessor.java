package dev.juukulius.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.world.entity.HumanoidArm;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(ItemInHandRenderer.class)
public interface ItemInHandRendererAccessor {
	@Invoker("renderPlayerArm")
	void julius$renderPlayerArm(PoseStack poseStack, SubmitNodeCollector collector, int light, float equipProgress, float swingProgress, HumanoidArm arm);
}
