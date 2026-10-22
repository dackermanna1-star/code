package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.entity.RocketEntity;
import com.ordnance.explosion.BlastWaveManager;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModDamageTypes;
import com.ordnance.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;

/**
 * RPG-7: single-shot, shoulder-fired, recoilless. The exhaust vents backwards, so anything standing behind the
 * shooter is hit by the backblast.
 */
public class RocketLauncherItem extends MagazineWeaponItem {
	public RocketLauncherItem(Settings settings) {
		super(settings);
	}

	@Override
	public AmmoCategory ammoCategory() {
		return AmmoCategory.RPG_ROCKET;
	}

	@Override
	public int magazineSize() {
		return 1;
	}

	@Override
	public int reloadTicksPerRound() {
		return ConfigManager.get().weapons.rpg7.reloadTicks;
	}

	@Override
	protected int cooldownTicks() {
		return ConfigManager.get().weapons.rpg7.cooldownTicks;
	}

	@Override
	protected SoundEvent fireSound() {
		return ModSounds.RPG_FIRE;
	}

	@Override
	protected SoundEvent reloadSound() {
		return ModSounds.RPG_RELOAD;
	}

	@Override
	protected SoundEvent reloadDoneSound() {
		return ModSounds.RPG_RELOAD_DONE;
	}

	@Override
	protected void fire(ServerWorld world, PlayerEntity player, ItemStack weapon, AmmoItem round) {
		OrdnanceConfig.Rpg cfg = ConfigManager.get().weapons.rpg7;
		Vec3d look = player.getRotationVec(1.0F);
		RocketEntity rocket = new RocketEntity(world, player, new ItemStack(round));
		Vec3d muzzle = WeaponHelper.muzzle(player, 0.9, 0.18, 0.12);
		rocket.setPosition(muzzle);
		rocket.setVelocity(player, player.getPitch(), player.getYaw(), 0.0F, cfg.launchSpeed, 0.35F);
		world.spawnEntity(rocket);
		OrdnanceNetworking.sendMuzzleFlash(player, OrdnanceNetworking.MuzzleFlash.Kind.ROCKET);
		if (cfg.backblast) {
			this.backblast(world, player, look, cfg);
		}
	}

	private void backblast(ServerWorld world, PlayerEntity player, Vec3d look, OrdnanceConfig.Rpg cfg) {
		Vec3d origin = player.getEyePos().subtract(look.multiply(0.6));
		double range = cfg.backblastRange;
		DamageSource source = ModDamageTypes.create(world, ModDamageTypes.BACKBLAST, player, player);
		for (Entity entity : world.getOtherEntities(player, new Box(origin, origin).expand(range))) {
			if (!(entity instanceof LivingEntity) && !entity.isPushable()) {
				continue;
			}

			Vec3d to = entity.getBoundingBox().getCenter().subtract(origin);
			double distance = to.length();
			if (distance > range || distance < 1.0E-3) {
				continue;
			}

			// Inside a ~45 degree cone behind the shooter.
			double alignment = -to.normalize().dotProduct(look);
			if (alignment < 0.7) {
				continue;
			}

			double falloff = 1.0 - distance / range;
			Vec3d push = to.normalize().multiply(1.4 * falloff).add(0.0, 0.25 * falloff, 0.0);
			BlastWaveManager.apply(world, new BlastWaveManager.Hit(entity, (float)(cfg.backblastDamage * falloff), source, push, falloff > 0.6 ? 2.0F : 0.0F, player));
		}

		Vec3d exhaust = origin.subtract(look.multiply(0.8));
		world.spawnParticles(ParticleTypes.CAMPFIRE_COSY_SMOKE, exhaust.x, exhaust.y, exhaust.z, 6, 0.4, 0.3, 0.4, 0.02);
	}
}
