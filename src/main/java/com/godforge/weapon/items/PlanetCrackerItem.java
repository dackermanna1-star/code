package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.CrackerShellEntity;
import com.godforge.entity.OrbitalStrikeEntity;
import com.godforge.entity.TargetMarkerEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
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
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.phys.Vec3;

/** The Planet Cracker — World-Ender. A siege cannon; its ultimate calls a sustained orbital bombardment. */
public class PlanetCrackerItem extends GodWeaponItem {
	public PlanetCrackerItem(Properties properties) {
		super(WeaponType.PLANET_CRACKER, properties);
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.NONE;
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CRACKER_CHARGE, 3.0F, mode.ultimate() ? 0.6F : 1.0F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.color(), 64);
			Fx.sound(level, player.position(), ModSounds.ASTEROID_LOCK, 1.0F, 1.8F);
		}
		if (used > mode.chargeTicks() && used % 8 == 0) {
			Fx.shake(level, player.position(), 0.12F, 8, 16);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
		if (charge < 0.2F || mode.ultimate() && charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		if (mode.ultimate()) {
			if (!OrbitalStrikeEntity.canSpawn()) {
				player.displayClientMessage(Component.translatable("message.godforge.too_many").withStyle(ChatFormatting.RED), true);
				return false;
			}
			Vec3 ground = Targeting.groundTarget(player, 256.0, 40.0);
			float radius = (float) (tuning.extra("barrageRadius", 52.0) * scale * Math.max(0.3F, settings.sizeFraction()));
			int strikes = Math.max(6, (int) (tuning.extra("barrageStrikes", 44.0) * settings.intensityFraction()));
			OrbitalStrikeEntity barrage = new OrbitalStrikeEntity(ModEntities.ORBITAL_STRIKE, level);
			barrage.setOwner(player);
			barrage.setPos(ground);
			barrage.configure(radius, strikes, (float) tuning.damage * 0.6F, 20 * 16, WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(ground)));
			level.addFreshEntity(barrage);
			TargetMarkerEntity marker = new TargetMarkerEntity(ModEntities.TARGET_MARKER, level);
			marker.setPos(ground);
			marker.configure(0xFF2A2A, radius, 20 * 16);
			level.addFreshEntity(marker);
			Fx.send(level, FxType.MUZZLE, handPosition(player, 1.0F), new Vec3(0, 1, 0), 2.0F, 1.0F, this.type.color(), 128);
			Fx.sound(level, player.position(), ModSounds.CRACKER_FIRE, 6.0F, 1.4F);
			player.displayClientMessage(Component.translatable("message.godforge.orbital_inbound").withStyle(ChatFormatting.RED), true);
			return true;
		}
		float crater = (float) (tuning.extra("craterRadius", 14.0) * scale * (0.35 + 0.65 * charge) * settings.sizeFraction());
		Vec3 look = player.getLookAngle();
		Vec3 muzzle = player.getEyePosition().add(look.scale(2.2)).add(0, -0.2, 0);
		CrackerShellEntity shell = new CrackerShellEntity(ModEntities.CRACKER_SHELL, level);
		shell.setOwner(player);
		shell.setPos(muzzle);
		shell.setDeltaMovement(look.scale(3.4 + charge * 1.6));
		shell.configure(Math.max(3.0F, crater), charge, (float) tuning.damage, WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition()));
		level.addFreshEntity(shell);
		Fx.send(level, FxType.MUZZLE, muzzle, look, 1.5F + charge * 2.0F, 1.0F, this.type.color(), 192);
		Fx.sound(level, muzzle, ModSounds.CRACKER_FIRE, 6.0F + charge * 6.0F, 1.0F - charge * 0.2F);
		Fx.shake(level, player.position(), 0.8F + charge * 0.8F, 14, 32);
		Combat.launch(player, look.scale(-0.6 - charge * 0.6));
		return true;
	}
}
