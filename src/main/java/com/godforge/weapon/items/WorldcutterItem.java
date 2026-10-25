package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.RealityCutEntity;
import com.godforge.entity.RiftSlashEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/** The Worldcutter — Reality-Splitting Blade. */
public class WorldcutterItem extends GodWeaponItem {
	public WorldcutterItem(Properties properties) {
		super(WeaponType.WORLDCUTTER, properties);
	}

	@Override
	protected boolean fireInstant(ServerLevel level, ServerPlayer player, InteractionHand hand, ItemStack stack, WeaponMode mode) {
		Vec3 look = player.getLookAngle();
		RiftSlashEntity slash = new RiftSlashEntity(ModEntities.RIFT_SLASH, level);
		slash.setOwner(player);
		Vec3 start = player.getEyePosition().add(look.scale(1.2)).add(0, -0.3, 0);
		slash.setPos(start);
		slash.setDeltaMovement(look.scale(2.6));
		slash.setYRot(player.getYRot());
		slash.setXRot(player.getXRot());
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
		slash.configure((float) this.tuning().damage, 7.0F, terrain);
		level.addFreshEntity(slash);
		Fx.send(level, FxType.SLASH, start, look.scale(6.0), 7.0F, 0.0F, this.type.color(), 128);
		Fx.sound(level, start, ModSounds.WORLDCUTTER_SLASH, 2.0F, 0.9F + level.getRandom().nextFloat() * 0.2F);
		return true;
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 0.6F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.WORLDCUTTER_RUMBLE, 2.0F, 1.4F);
			Fx.send(level, FxType.CHARGE, handOf(player), Vec3.ZERO, 1.0F, 0.0F, this.type.accent(), 64);
		}
		if (used > mode.chargeTicks() && used % 10 == 0) {
			Fx.shake(level, player.position(), 0.15F, 10, 24);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used < mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		WeaponSettings settings = settings(stack);
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		float length = (float) (Math.min(settings.range(), tuning.extra("cutLength", 256)) * scale);
		float gap = (float) (Math.min(settings.width(), tuning.extra("cutGap", 24)) * scale);
		float depth = (float) Math.min(settings.power(), tuning.extra("cutDepth", 96));
		float yaw = player.getYRot();
		Vec3 dir = new Vec3(-Mth.sin(yaw * Mth.DEG_TO_RAD), 0, Mth.cos(yaw * Mth.DEG_TO_RAD));
		Vec3 origin = player.position().add(dir.scale(2.0));
		int x = Mth.floor(origin.x);
		int z = Mth.floor(origin.z);
		int ground = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
		origin = new Vec3(origin.x, Math.min(ground, player.getY() + 1), origin.z);
		RealityCutEntity cut = new RealityCutEntity(ModEntities.REALITY_CUT, level);
		cut.setOwner(player);
		cut.setPos(origin);
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(origin));
		cut.configure(yaw, length, gap, depth, (float) tuning.damage * 1.5F, terrain);
		level.addFreshEntity(cut);
		player.swing(InteractionHand.MAIN_HAND, true);
		return true;
	}

	@Override
	public void postHurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		if (attacker.level() instanceof ServerLevel level) {
			float bonus = (float) this.tuning().extra("meleeBonus", 20.0);
			target.invulnerableTime = 0;
			if (Combat.canAffect(level, attacker, target)) {
				Combat.hurt(level, target, ModDamageTypes.source(level, WeaponType.WORLDCUTTER, attacker, attacker), bonus);
			}
			Vec3 at = target.getBoundingBox().getCenter();
			Fx.send(level, FxType.SHATTER, at, Vec3.ZERO, 1.5F, 0.0F, this.type.color(), 64);
			Fx.sound(level, at, ModSounds.WORLDCUTTER_SLASH, 1.0F, 1.5F);
		}
	}

	private static Vec3 handOf(ServerPlayer player) {
		return handPosition(player, 1.0F);
	}
}
