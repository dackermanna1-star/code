package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.ArtificialSunEntity;
import com.godforge.entity.MiniSunEntity;
import com.godforge.entity.SolarBoltEntity;
import com.godforge.entity.TargetMarkerEntity;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * The Sunforge — Portable Star. Solar bolts, a court of orbiting suns, a hand-forged unstable stellar
 * core, and an artificial sun that ends in an apocalyptic eruption.
 */
public class SunforgeItem extends GodWeaponItem {
	private static final Map<UUID, SolarBoltEntity> CORES = new HashMap<>();

	static {
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> CORES.clear());
	}

	public SunforgeItem(Properties properties) {
		super(WeaponType.SUNFORGE, properties);
	}

	@Override
	protected boolean fireInstant(ServerLevel level, ServerPlayer player, InteractionHand hand, ItemStack stack, WeaponMode mode) {
		WeaponSettings settings = settings(stack);
		float damage = (float) this.tuning().damage;
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
		Vec3 look = player.getLookAngle();
		if (mode.key().equals("solar_bolt")) {
			SolarBoltEntity bolt = new SolarBoltEntity(ModEntities.SOLAR_BOLT, level);
			bolt.setOwner(player);
			bolt.setPos(player.getEyePosition().add(look.scale(1.2)).add(0, -0.15, 0));
			bolt.setDeltaMovement(look.scale(3.2));
			bolt.configure(SolarBoltEntity.BOLT, 0.6F, damage, terrain);
			level.addFreshEntity(bolt);
			Fx.send(level, FxType.MUZZLE, bolt.position(), look, 0.8F, 0.0F, this.type.color(), 96);
			Fx.sound(level, player.position(), ModSounds.SUNFORGE_BOLT, 2.0F, 1.0F + level.getRandom().nextFloat() * 0.2F);
			return true;
		}
		// orbiting suns: summon a court of suns, or hurl one of them as a homing nova
		List<MiniSunEntity> suns = MiniSunEntity.ownedBy(level, player);
		if (suns.isEmpty()) {
			int count = Mth.clamp(settings.power(), 1, Math.max(1, (int) this.tuning().extra("maxOrbiters", 6.0)));
			for (int i = 0; i < count; i++) {
				MiniSunEntity sun = new MiniSunEntity(ModEntities.MINI_SUN, level);
				sun.configure(player, i, count, damage * 0.6F);
				sun.setPos(sun.orbitPosition(player, 0.0F));
				level.addFreshEntity(sun);
			}
			Fx.send(level, FxType.SOLAR, player.position().add(0, 1, 0), Vec3.ZERO, 3.0F, 0.0F, this.type.color(), 96);
			Fx.sound(level, player.position(), ModSounds.SUN_LOOP, 2.0F, 1.6F);
			return true;
		}
		MiniSunEntity sun = suns.get(0);
		Vec3 from = sun.position();
		Vec3 target = Targeting.aimPoint(player, 96.0);
		SolarBoltEntity nova = new SolarBoltEntity(ModEntities.SOLAR_BOLT, level);
		nova.setOwner(player);
		nova.setPos(from);
		nova.setDeltaMovement(target.subtract(from).normalize().scale(2.4));
		nova.configure(SolarBoltEntity.NOVA, 0.9F, damage * 1.4F, terrain);
		level.addFreshEntity(nova);
		sun.discard();
		Fx.send(level, FxType.MUZZLE, from, nova.getDeltaMovement(), 1.0F, 0.0F, this.type.color(), 96);
		Fx.sound(level, from, ModSounds.SUNFORGE_BOLT, 2.0F, 0.7F);
		return true;
	}

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, mode.ultimate() ? 0.5F : 1.0F);
		if (mode.key().equals("stellar_core")) {
			SolarBoltEntity core = new SolarBoltEntity(ModEntities.SOLAR_BOLT, level);
			core.setOwner(player);
			core.configure(SolarBoltEntity.CORE, 0.4F, (float) this.tuning().damage, WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition()));
			core.hold(player);
			core.setPos(player.getEyePosition().add(player.getLookAngle().scale(2.0)).add(0, 0.8, 0));
			level.addFreshEntity(core);
			SolarBoltEntity previous = CORES.put(player.getUUID(), core);
			if (previous != null && previous.isHeld()) {
				previous.discard();
			}
		}
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (mode.key().equals("stellar_core")) {
			SolarBoltEntity core = CORES.get(player.getUUID());
			if (core != null && !core.isRemoved() && core.isHeld()) {
				float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
				float maxSize = (float) (this.tuning().extra("coreRadius", 9.0) * GodforgeConfig.get().general.destructionScale) * settings(stack).sizeFraction();
				core.refreshHold(Math.max(0.4F, maxSize * charge), charge);
				if (used % 10 == 0) {
					Fx.sound(level, core.position(), ModSounds.SUN_LOOP, 0.8F + charge * 2.0F, 0.8F + charge * 0.8F);
				}
				if (charge >= 1.0F && used % 6 == 0) {
					Fx.shake(level, player.position(), 0.2F, 6, 16);
				}
			}
		}
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.color(), 64);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		float charge = Mth.clamp(used / (float) mode.chargeTicks(), 0.0F, 1.0F);
		if (mode.key().equals("stellar_core")) {
			SolarBoltEntity core = CORES.remove(player.getUUID());
			if (core == null || core.isRemoved()) {
				return false;
			}
			if (charge < 0.15F) {
				core.discard();
				Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
				return false;
			}
			core.release(player.getLookAngle().scale(1.0 + charge * 0.6));
			Fx.sound(level, core.position(), ModSounds.SUNFORGE_BOLT, 4.0F, 0.5F);
			Fx.shake(level, player.position(), 0.4F + charge * 0.4F, 12, 24);
			return true;
		}
		if (!mode.ultimate() || charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		if (!ArtificialSunEntity.canSpawn()) {
			player.displayClientMessage(Component.translatable("message.godforge.too_many").withStyle(ChatFormatting.RED), true);
			return false;
		}
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		WeaponSettings settings = settings(stack);
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		Vec3 ground = Targeting.groundTarget(player, 192.0, 24.0);
		float area = (float) (tuning.extra("sunRadius", 42.0) * scale * Math.max(0.25F, settings.sizeFraction()));
		float sunRadius = Math.max(3.0F, area * 0.18F);
		ArtificialSunEntity sun = new ArtificialSunEntity(ModEntities.ARTIFICIAL_SUN, level);
		sun.setOwner(player);
		double height = Math.min(level.getMaxY() - 4, ground.y + 26 + sunRadius * 1.5);
		sun.setPos(ground.x, height, ground.z);
		sun.configure(sunRadius, area, (float) tuning.damage, ground.y, 220, WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(ground)));
		level.addFreshEntity(sun);
		TargetMarkerEntity marker = new TargetMarkerEntity(ModEntities.TARGET_MARKER, level);
		marker.setPos(ground);
		marker.configure(this.type.color(), area, 220);
		level.addFreshEntity(marker);
		Fx.sound(level, ground, ModSounds.SOLAR_ERUPTION, 10.0F, 1.6F);
		return true;
	}

	@Override
	protected void onCancelled(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		SolarBoltEntity core = CORES.remove(player.getUUID());
		if (core != null && core.isHeld()) {
			core.discard();
		}
	}
}
