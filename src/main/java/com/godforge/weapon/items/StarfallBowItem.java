package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.StarBoltEntity;
import com.godforge.entity.TargetMarkerEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Scheduler;
import com.godforge.util.Targeting;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.phys.Vec3;

/**
 * The Starfall Bow — Celestial Judgment. Draw to loose miniature stars; hold longer to call a meteor
 * shower, or draw fully in Judgment mode to bring down a gigantic falling star.
 */
public class StarfallBowItem extends GodWeaponItem {
	public StarfallBowItem(Properties properties) {
		super(WeaponType.STARFALL_BOW, properties);
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.BOW;
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		if (mode.ultimate()) {
			Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 1.5F);
		}
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.color(), 64);
			Fx.sound(level, player.position(), ModSounds.STARFALL_SHOOT, 0.6F, 2.0F);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
		float damage = (float) tuning.damage;
		if (mode.key().equals("star_shot") || used < mode.chargeTicks() && !mode.ultimate()) {
			float power = BowItem.getPowerForTime(used);
			if (power < 0.1F) {
				return false;
			}
			this.shootStar(level, player, power, damage, settings.sizeFraction(), terrain);
			return true;
		}
		if (used < mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		Vec3 aim = Targeting.aimPoint(player, mode.ultimate() ? 256.0 : 160.0);
		Vec3 target = Targeting.ground(level, aim);
		if (target == null) {
			target = aim;
		}
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		boolean areaTerrain = WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(target));
		if (mode.ultimate()) {
			this.judgment(level, player, target, (float) (tuning.extra("judgmentRadius", 30.0) * scale * Math.max(0.3F, settings.sizeFraction())), damage, areaTerrain);
		} else {
			int stars = Math.max(4, (int) (tuning.extra("showerStars", 28.0) * settings.intensityFraction()));
			this.shower(level, player, target, stars, damage, settings.sizeFraction(), areaTerrain);
		}
		Fx.sound(level, player.position(), ModSounds.STARFALL_SHOOT, 3.0F, 0.6F);
		return true;
	}

	private void shootStar(ServerLevel level, ServerPlayer player, float power, float damage, float size, boolean terrain) {
		Vec3 look = player.getLookAngle();
		StarBoltEntity star = new StarBoltEntity(ModEntities.STAR_BOLT, level);
		star.setOwner(player);
		star.setPos(player.getEyePosition().add(look.scale(1.0)).add(0, -0.1, 0));
		star.setDeltaMovement(look.scale(1.5 + power * 4.0));
		star.configure(StarBoltEntity.SHOT, (0.35F + power * 0.6F) * Math.max(0.3F, size), damage * (0.4F + power * 0.6F), terrain);
		level.addFreshEntity(star);
		Fx.sound(level, player.position(), ModSounds.STARFALL_SHOOT, 1.5F, 0.8F + power * 0.5F);
		Fx.send(level, FxType.MUZZLE, star.position(), look, 0.6F, 0.0F, this.type.color(), 96);
	}

	private void shower(ServerLevel level, ServerPlayer player, Vec3 target, int stars, float damage, float size, boolean terrain) {
		RandomSource random = level.getRandom();
		this.marker(level, target, 14.0F, 80 + stars * 2);
		Fx.send(level, FxType.LOCK_ON, target, Vec3.ZERO, 14.0F, 30.0F, this.type.color(), 384);
		for (int i = 0; i < stars; i++) {
			int delay = 6 + i * 2 + random.nextInt(4);
			Scheduler.later(level, delay, () -> {
				double angle = random.nextDouble() * Math.PI * 2;
				double dist = Math.sqrt(random.nextDouble()) * 15.0;
				Vec3 hit = target.add(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
				Vec3 from = hit.add(-18 + random.nextDouble() * 6, 70 + random.nextDouble() * 25, -10 + random.nextDouble() * 20);
				StarBoltEntity star = new StarBoltEntity(ModEntities.STAR_BOLT, level);
				star.setOwner(player);
				star.setPos(from);
				star.setDeltaMovement(hit.subtract(from).normalize().scale(2.6 + random.nextDouble()));
				star.configure(StarBoltEntity.METEOR, (0.8F + random.nextFloat() * 0.8F) * Math.max(0.3F, size), damage, terrain);
				level.addFreshEntity(star);
			});
		}
	}

	private void judgment(ServerLevel level, ServerPlayer player, Vec3 target, float radius, float damage, boolean terrain) {
		Vec3 from = target.add(-30, Math.min(level.getMaxY() - target.y - 10, 150), 18);
		StarBoltEntity star = new StarBoltEntity(ModEntities.STAR_BOLT, level);
		star.setOwner(player);
		star.setPos(from);
		star.setDeltaMovement(target.subtract(from).normalize().scale(1.9));
		star.configure(StarBoltEntity.JUDGMENT, radius, damage, terrain);
		level.addFreshEntity(star);
		this.marker(level, target, radius, 140);
		Fx.send(level, FxType.LOCK_ON, target, Vec3.ZERO, radius, 60.0F, 0xFFF2B0, 512);
		Fx.flash(level, from, 0xFFF6D0, 0.4F, 20, 256);
		Fx.sound(level, target, ModSounds.STARFALL_JUDGMENT, 16.0F, 1.3F);
	}

	private void marker(ServerLevel level, Vec3 at, float radius, int lifetime) {
		TargetMarkerEntity marker = new TargetMarkerEntity(ModEntities.TARGET_MARKER, level);
		marker.setPos(at);
		marker.configure(this.type.color(), radius, lifetime);
		level.addFreshEntity(marker);
	}

	public static float pullProgress(int used) {
		return Mth.clamp(used / 20.0F, 0.0F, 1.0F);
	}
}
