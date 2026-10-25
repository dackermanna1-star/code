package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.PrismOrbEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** The Orb Eraser — Rainbow Singularity. Charge to grow the orb; a full ultimate charge unleashes Prismatic Annihilation. */
public class OrbEraserItem extends GodWeaponItem {
	public OrbEraserItem(Properties properties) {
		super(WeaponType.ORB_ERASER, properties);
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.ORB_CHARGE, 2.0F, mode.ultimate() ? 0.8F : 1.0F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used > 0 && used % 25 == 0 && used <= mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.ORB_CHARGE, 1.5F, 1.0F + used / (float) mode.chargeTicks() * 0.6F);
		}
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 1.0F, 0xFFFFFF, 64);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
		if (charge < 0.12F || mode.ultimate() && charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		float maxRadius = (float) (tuning.extra("maxRadius", 9.0) * scale);
		float maxSpeed = (float) tuning.extra("maxSpeed", 100.0);
		boolean ultimate = mode.ultimate();
		float radius = ultimate ? maxRadius * 1.6F : Mth.lerp(charge, 1.2F, maxRadius) * settings.sizeFraction();
		float speed = ultimate ? maxSpeed : Mth.lerp(charge, 6.0F, maxSpeed) * (settings.power() / 100.0F);
		speed = Math.max(2.0F, speed);
		Vec3 look = player.getLookAngle();
		Vec3 start = player.getEyePosition().add(look.scale(1.5 + radius));
		PrismOrbEntity orb = new PrismOrbEntity(ModEntities.PRISM_ORB, level);
		orb.setOwner(player);
		orb.setPos(start);
		orb.setDeltaMovement(look.scale(speed));
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
		orb.configure(radius, charge, (float) tuning.damage, tuning.extra("maxRange", 640.0), ultimate, terrain);
		level.addFreshEntity(orb);
		Fx.send(level, FxType.MUZZLE, start, look, radius, 1.0F, 0xFFFFFF, 192);
		Fx.sound(level, start, ModSounds.ORB_FIRE, ultimate ? 12.0F : 4.0F + radius, ultimate ? 0.7F : 1.0F);
		Fx.shake(level, player.position(), ultimate ? 1.2F : 0.3F + charge * 0.4F, ultimate ? 25 : 10, 32);
		Combat.launch(player, look.scale(-0.4 - charge * (ultimate ? 1.0 : 0.4)));
		if (ultimate) {
			Fx.flash(level, start, 0xFFFFFF, 0.5F, 12, 96);
		}
		return true;
	}
}
