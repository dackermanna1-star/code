package com.realweather.client.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.sound.WeatherSounds;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Vanilla plays thunder at the very instant of the flash. RealWeather instead registers the flash (for sky, cloud
 * and world illumination) and lets the thunder arrive after the distance-based delay of sound.
 */
@Mixin(LightningBolt.class)
abstract class LightningBoltMixin {
	@WrapWithCondition(
		method = "tick",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/Level;playLocalSound(DDDLnet/minecraft/sounds/SoundEvent;Lnet/minecraft/sounds/SoundSource;FFZ)V")
	)
	private boolean realweather$delayThunder(Level level, double x, double y, double z, SoundEvent sound, SoundSource source, float volume, float pitch,
			boolean distanceDelay) {
		if (!level.isClientSide()) {
			return true;
		}
		// Called twice in the same tick (thunder + impact); register the event once.
		boolean thunder = sound == SoundEvents.LIGHTNING_BOLT_THUNDER;
		if (thunder) {
			LightningBolt bolt = (LightningBolt) (Object) this;
			ClientWeather.get().addFlash(x, y, z, 1.0F, true, bolt.getUUID().getLeastSignificantBits());
		}
		if (!ClientConfig.get().ambientSounds) {
			return true;
		}
		if (thunder) {
			WeatherSounds.get().onLightning(new Vec3(x, y + 30.0, z), 1.0F, true);
		}
		return false;
	}
}
