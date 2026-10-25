package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.entity.AsteroidEntity;
import com.godforge.entity.TargetMarkerEntity;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModComponents;
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
import net.minecraft.core.GlobalPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The Asteroid Gun — Planetfall. Tap to designate a target, hold to charge, release to call down an
 * asteroid whose size scales with the charge.
 */
public class AsteroidGunItem extends GodWeaponItem {
	public static final int TAP_TICKS = 6;

	public AsteroidGunItem(Properties properties) {
		super(WeaponType.ASTEROID_GUN, properties);
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.SPYGLASS;
	}

	@Override
	public float chargeFraction(ItemStack stack, int usedTicks) {
		WeaponMode mode = this.mode(stack);
		return Mth.clamp((usedTicks - TAP_TICKS) / (float) mode.chargeTicks(), 0.0F, 1.0F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == TAP_TICKS) {
			Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 0.7F);
		}
		if (used == TAP_TICKS + mode.chargeTicks()) {
			Fx.sound(level, player.position(), ModSounds.ASTEROID_LOCK, 2.0F, 1.6F);
		}
	}

	@Override
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		GodforgeConfig.WeaponTuning tuning = this.tuning();
		double range = tuning.extra("targetRange", 384.0);
		if (used < TAP_TICKS) {
			this.designate(level, player, stack, range);
			return false;
		}
		float charge = this.chargeFraction(stack, used);
		if (charge < 0.1F || mode.ultimate() && charge < 1.0F) {
			Fx.sound(level, player.position(), ModSounds.MODE_SWITCH, 0.6F, 0.5F);
			return false;
		}
		Vec3 target = this.resolveTarget(level, player, stack, range);
		if (target == null) {
			player.displayClientMessage(Component.translatable("message.godforge.no_target").withStyle(ChatFormatting.RED), true);
			return false;
		}
		WeaponSettings settings = settings(stack);
		double scale = GodforgeConfig.get().general.destructionScale * tuning.sizeScale;
		boolean ultimate = mode.ultimate();
		float crater = ultimate
			? (float) (tuning.extra("ultimateCraterRadius", 34.0) * scale)
			: (float) (Mth.lerp(charge, 4.0F, (float) tuning.extra("maxCraterRadius", 16.0)) * settings.sizeFraction() * scale);
		float rock = Math.max(1.0F, crater / 2.8F);
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, BlockPos.containing(target));
		float damage = (float) tuning.damage * (ultimate ? 3.0F : 0.6F + charge * 0.6F);
		Vec3 approach = target.subtract(player.position());
		double height = Math.min(level.getMaxY() - target.y - 8, 110 + crater * 3.0);
		this.spawnAsteroid(level, player, target, approach, height, rock, crater, damage, ultimate ? 1 : 0, terrain, ultimate ? 0.9 : 1.4);
		if (ultimate) {
			// a swarm of fragments races ahead of the planet-killer
			for (int i = 0; i < 6; i++) {
				double angle = level.getRandom().nextDouble() * Math.PI * 2;
				double dist = crater * (1.2 + level.getRandom().nextDouble() * 1.4);
				Vec3 fragTarget = new Vec3(target.x + Math.cos(angle) * dist, target.y, target.z + Math.sin(angle) * dist);
				Vec3 ground = Targeting.ground(level, fragTarget);
				if (ground != null) {
					this.spawnAsteroid(level, player, ground, approach, height * (0.6 + level.getRandom().nextDouble() * 0.2), 1.6F, 6.0F, damage * 0.25F, 2, terrain, 2.0);
				}
			}
		}
		this.marker(level, target, crater, 240);
		stack.remove(ModComponents.TARGET);
		Fx.send(level, FxType.MUZZLE, handPosition(player, 1.0F), Vec3.ZERO.add(0, 1, 0), 1.5F, 1.0F, this.type.color(), 96);
		Fx.sound(level, player.position(), ModSounds.ASTEROID_LOCK, 3.0F, 0.6F);
		Fx.sound(level, target, ModSounds.ASTEROID_INCOMING, 16.0F + crater * 0.5F, ultimate ? 0.5F : 0.8F);
		return true;
	}

	private void spawnAsteroid(ServerLevel level, ServerPlayer player, Vec3 target, Vec3 approach, double height, float rock, float crater, float damage, int variant,
		boolean terrain, double speed) {
		AsteroidEntity asteroid = new AsteroidEntity(ModEntities.ASTEROID, level);
		asteroid.setOwner(player);
		asteroid.configure(target, rock, crater, damage, variant, terrain);
		asteroid.launchTowards(target, approach, height, speed);
		level.addFreshEntity(asteroid);
	}

	private void designate(ServerLevel level, ServerPlayer player, ItemStack stack, double range) {
		Vec3 ground = aimedGround(level, player, range);
		if (ground == null) {
			player.displayClientMessage(Component.translatable("message.godforge.no_target").withStyle(ChatFormatting.RED), true);
			return;
		}
		stack.set(ModComponents.TARGET, GlobalPos.of(level.dimension(), BlockPos.containing(ground)));
		this.marker(level, ground, 4.0F, 200);
		Fx.send(level, FxType.LOCK_ON, ground, Vec3.ZERO, 5.0F, 20.0F, this.type.color(), 384);
		Fx.sound(level, player.position(), ModSounds.ASTEROID_LOCK, 1.5F, 1.2F);
		player.displayClientMessage(
			Component.translatable("message.godforge.target_locked", Mth.floor(ground.x), Mth.floor(ground.y), Mth.floor(ground.z))
				.withStyle(ChatFormatting.GOLD),
			true
		);
	}

	private @Nullable Vec3 resolveTarget(ServerLevel level, ServerPlayer player, ItemStack stack, double range) {
		GlobalPos stored = stack.get(ModComponents.TARGET);
		if (stored != null && stored.dimension() == level.dimension() && stored.pos().closerToCenterThan(player.position(), range * 1.5)) {
			return Vec3.atBottomCenterOf(stored.pos());
		}
		return aimedGround(level, player, range);
	}

	/** The ground under whatever the player is aiming at, or null when the aim hits nothing in loaded terrain. */
	private static @Nullable Vec3 aimedGround(ServerLevel level, ServerPlayer player, double range) {
		HitResult hit = Targeting.aim(player, range);
		return hit.getType() == HitResult.Type.MISS ? null : Targeting.ground(level, hit.getLocation());
	}

	private void marker(ServerLevel level, Vec3 at, float radius, int lifetime) {
		TargetMarkerEntity marker = new TargetMarkerEntity(ModEntities.TARGET_MARKER, level);
		marker.setPos(at);
		marker.configure(this.type.color(), radius, lifetime);
		level.addFreshEntity(marker);
	}
}
