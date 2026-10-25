package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.LaserBeamEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.weapon.BeamColors;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.UltimateCooldowns;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.phys.Vec3;

/** The Laser Beam — Annihilation Cannon. A continuous, fully tunable beam of destruction. */
public class LaserBeamItem extends GodWeaponItem {
	public static final int OVERLOAD_DURATION = 100;
	private static final Map<UUID, LaserBeamEntity> BEAMS = new HashMap<>();

	static {
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> BEAMS.clear());
	}

	public LaserBeamItem(Properties properties) {
		super(WeaponType.LASER_BEAM, properties);
	}

	@Override
	protected boolean isChanneled(WeaponMode mode) {
		return true;
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.NONE;
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		if (mode.ultimate()) {
			Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 1.2F);
		} else {
			Fx.sound(level, player.position(), ModSounds.LASER_START, 1.5F, 1.0F);
		}
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		boolean overload = mode.ultimate();
		if (overload) {
			if (used < mode.chargeTicks()) {
				return;
			}
			if (used == mode.chargeTicks()) {
				UltimateCooldowns.start(player, this.type, this.tuning().ultimateCooldownTicks);
				Fx.sound(level, player.position(), ModSounds.LASER_OVERLOAD, 8.0F, 1.0F);
				Fx.flash(level, player.position(), BeamColors.rgb(settings(stack).color(), level.getGameTime()), 0.4F, 10, 48);
			}
			if (used > mode.chargeTicks() + OVERLOAD_DURATION) {
				this.stopBeam(player);
				return;
			}
			if (used % 5 == 0) {
				Fx.shake(level, player.position(), 0.35F, 6, 16);
			}
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		float maxRange = (float) tuning.extra("maxRange", 512.0);
		float maxWidth = (float) tuning.extra("maxWidth", 6.0);
		float range = overload ? maxRange : Math.min(settings.range(), maxRange);
		float width = overload ? Math.max(maxWidth, 6.0F) : Math.min(settings.width(), maxWidth);
		int power = overload ? 10 : Mth.clamp(settings.power(), 1, 10);
		float intensity = overload ? 1.0F : settings.intensityFraction();
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());

		LaserBeamEntity beam = BEAMS.get(player.getUUID());
		if (beam == null || beam.isRemoved() || beam.level() != level) {
			beam = new LaserBeamEntity(ModEntities.LASER_BEAM, level);
			Vec3 eye = player.getEyePosition();
			beam.setPos(eye.x, eye.y - 0.2, eye.z);
			beam.refresh(player, power, width, range, settings.color(), intensity, overload, (float) tuning.damage, (int) tuning.extra("maxBlocksPerTick", 900), terrain);
			level.addFreshEntity(beam);
			BEAMS.put(player.getUUID(), beam);
		} else {
			beam.refresh(player, power, width, range, settings.color(), intensity, overload, (float) tuning.damage, (int) tuning.extra("maxBlocksPerTick", 900), terrain);
		}
		if (used % 4 == 0) {
			Fx.send(level, FxType.MUZZLE, handPosition(player, 1.0F), player.getLookAngle(), width * 0.4F + power * 0.05F, 0.0F, BeamColors.rgb(settings.color(), level.getGameTime()), 96);
		}
	}

	private void stopBeam(ServerPlayer player) {
		LaserBeamEntity beam = BEAMS.remove(player.getUUID());
		if (beam != null && !beam.isRemoved()) {
			beam.discard();
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		this.stopBeam(player);
		if (mode.ultimate() && used < mode.chargeTicks()) {
			return false;
		}
		if (!UltimateCooldowns.bypass(player) && this.tuning().cooldownTicks > 0) {
			player.getCooldowns().addCooldown(stack, this.tuning().cooldownTicks);
		}
		return false;
	}

	@Override
	protected void onCancelled(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		this.stopBeam(player);
	}
}
