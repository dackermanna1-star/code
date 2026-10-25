package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.SingularityEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Targeting;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** The Black Hole — Event Horizon. Launches a gravitational singularity; the ultimate births a supermassive one. */
public class BlackHoleItem extends GodWeaponItem {
	public BlackHoleItem(Properties properties) {
		super(WeaponType.BLACK_HOLE, properties);
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 0.5F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used % 20 == 10 && used <= mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.BLACKHOLE_LAUNCH, 0.8F, 0.5F + used / (float) mode.chargeTicks());
		}
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.color(), 64);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
		if (charge < 0.15F || mode.ultimate() && charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		if (!SingularityEntity.canSpawn()) {
			player.displayClientMessage(Component.translatable("message.godforge.too_many").withStyle(ChatFormatting.RED), true);
			return false;
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		boolean ultimate = mode.ultimate();
		float strength = settings.intensityFraction();
		int lifetime = (int) (tuning.extra("lifetimeTicks", 240.0) * settings.sizeFraction());
		SingularityEntity hole = new SingularityEntity(ModEntities.SINGULARITY, level);
		hole.setOwner(player);
		Vec3 look = player.getLookAngle();
		boolean terrain;
		if (ultimate) {
			Vec3 target = Targeting.aimPoint(player, 112.0);
			Vec3 ground = Targeting.ground(level, target);
			Vec3 at = (ground != null ? ground : target).add(0, 8, 0);
			hole.setPos(at);
			terrain = WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(at));
			hole.configure(160.0F, (float) (tuning.extra("ultimatePullRadius", 64.0) * scale), 1.4F * Math.max(0.4F, strength),
				(float) tuning.damage * 1.5F, Math.max(160, (int) (lifetime * 1.5F)), true, terrain);
			hole.anchor();
			Fx.send(level, FxType.IMPLOSION, at, Vec3.ZERO, 12.0F, 30.0F, this.type.color(), 512);
			Fx.flash(level, at, 0x1A0A33, 0.6F, 20, 160);
		} else {
			Vec3 start = player.getEyePosition().add(look.scale(2.5));
			hole.setPos(start);
			hole.setDeltaMovement(look.scale(0.9 + charge * 0.8));
			terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
			hole.configure(8.0F + charge * 40.0F, (float) (tuning.extra("pullRadius", 26.0) * scale * (0.5 + 0.5 * charge)), strength,
				(float) tuning.damage, Math.max(60, lifetime), false, terrain);
		}
		if (level.addFreshEntity(hole)) {
			hole.markCounted();
		}
		Fx.sound(level, hole.position(), ModSounds.BLACKHOLE_LAUNCH, ultimate ? 12.0F : 3.0F, ultimate ? 0.5F : 0.8F);
		Fx.distort(level, hole.position(), ultimate ? 1.0F : 0.4F, 30, ultimate ? 200 : 64);
		return true;
	}
}
