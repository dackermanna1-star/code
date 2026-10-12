package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.core.ChaosConfig;
import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import net.fabricmc.fabric.api.resource.conditions.v1.ResourceCondition;
import net.fabricmc.fabric.api.resource.conditions.v1.ResourceConditionType;
import net.fabricmc.fabric.api.resource.conditions.v1.ResourceConditions;
import net.minecraft.registry.RegistryOps;
import org.jetbrains.annotations.Nullable;

import java.util.Locale;

/**
 * {@code chaosunleashed:panel_recipe} resource condition: the Chaos Control Panel recipe JSONs use it so the
 * config option {@code controlPanelRecipe} ("diamond", "nether_star" or "disabled") picks which recipe loads.
 * Takes effect on world load or {@code /reload}.
 */
public final class ModResourceConditions {
	public record PanelRecipeCondition(String variant) implements ResourceCondition {
		public static final MapCodec<PanelRecipeCondition> CODEC = Codec.STRING.fieldOf("variant").xmap(PanelRecipeCondition::new, PanelRecipeCondition::variant);

		@Override
		public ResourceConditionType<?> getType() {
			return PANEL_RECIPE;
		}

		@Override
		public boolean test(RegistryOps.@Nullable RegistryInfoGetter registryInfo) {
			return ChaosConfig.get().controlPanelRecipe.toLowerCase(Locale.ROOT).equals(this.variant);
		}
	}

	public static final ResourceConditionType<PanelRecipeCondition> PANEL_RECIPE =
		ResourceConditionType.create(ChaosUnleashed.id("panel_recipe"), PanelRecipeCondition.CODEC);

	private ModResourceConditions() {
	}

	public static void init() {
		ResourceConditions.register(PANEL_RECIPE);
	}
}
