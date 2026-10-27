package com.realweather.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.realweather.weather.Climate;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Makes vanilla gameplay agree with cold snaps: where RealWeather renders snow, vanilla also treats the
 * precipitation as snow (no rain damage to endermen, no fire extinguishing, powder snow in cauldrons, no lightning).
 */
@Mixin(Level.class)
abstract class LevelMixin {
	@ModifyReturnValue(method = "precipitationAt", at = @At("RETURN"))
	private Biome.Precipitation realweather$applyColdSnap(Biome.Precipitation original, BlockPos pos) {
		if (original != Biome.Precipitation.RAIN) {
			return original;
		}
		Level level = (Level) (Object) this;
		float coldSnap = Climate.coldSnapFor(level);
		if (coldSnap <= 0.0F) {
			return original;
		}
		Biome biome = level.getBiome(pos).value();
		return Climate.effectiveTemperature(level, biome, pos, coldSnap) < Climate.SNOW_TEMPERATURE ? Biome.Precipitation.SNOW : original;
	}
}
