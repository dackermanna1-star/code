package dev.visceral.mixin.client;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.entity.AgeableMobRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(AgeableMobRenderer.class)
public interface AgeableMobRendererAccessor {
	@Accessor("adultModel")
	EntityModel<?> visceral$adultModel();

	@Accessor("babyModel")
	EntityModel<?> visceral$babyModel();
}
