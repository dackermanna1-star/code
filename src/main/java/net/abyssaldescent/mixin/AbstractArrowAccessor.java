package net.abyssaldescent.mixin;

import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(AbstractArrow.class)
public interface AbstractArrowAccessor {
	@Accessor("baseDamage")
	double abyssal_descent$getBaseDamage();

	@Invoker("setPierceLevel")
	void abyssal_descent$setPierceLevel(byte level);
}
