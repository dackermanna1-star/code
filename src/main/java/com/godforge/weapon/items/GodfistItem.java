package com.godforge.weapon.items;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.TempBlocksJob;
import com.godforge.destruction.WaveJob;
import com.godforge.entity.Impacts;
import com.godforge.entity.KineticFistEntity;
import com.godforge.entity.KineticVictims;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModBlocks;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.FallGuard;
import com.godforge.util.Loaded;
import com.godforge.util.Scheduler;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The Godfist — Fist of Absolute Destruction. Every punch is a kinetic event: struck creatures are
 * launched across enormous distances and shatter terrain where they land, punched blocks explode
 * into rubble, charged punches project giant fists, and the ultimate is a world-shaking ground slam.
 */
public class GodfistItem extends GodWeaponItem {
	private static final Map<UUID, Long> BLOCK_PUNCH = new HashMap<>();

	public GodfistItem(Properties properties) {
		super(WeaponType.GODFIST, properties);
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.BLOCK;
	}

	// ---------------------------------------------------------------- melee

	@Override
	public void postHurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		if (!(attacker.level() instanceof ServerLevel level)) {
			return;
		}
		WeaponSettings settings = settings(stack);
		double power = this.tuning().extra("launchPower", 5.5) * Math.max(0.1F, settings.power() / 100.0F);
		Vec3 look = attacker.getLookAngle();
		Vec3 launch = new Vec3(look.x, Math.max(0.15, look.y + 0.25), look.z).normalize().scale(power);
		Combat.launch(target, launch);
		KineticVictims.track(level, target, attacker, (float) this.tuning().damage * 0.75F, 80);
		Vec3 at = target.getBoundingBox().getCenter();
		Fx.send(level, FxType.KINETIC, at, look, 2.5F, 0.0F, this.type.accent(), 128);
		Fx.sound(level, at, ModSounds.GODFIST_PUNCH, 3.0F, 0.8F + level.getRandom().nextFloat() * 0.3F);
		Fx.shake(level, attacker.position(), 0.35F, 8, 12);
	}

	/** Left-clicking a block with the Godfist detonates it (called from the attack-block event). */
	public void punchBlock(ServerLevel level, ServerPlayer player, ItemStack stack, BlockPos pos) {
		long now = level.getGameTime();
		Long last = BLOCK_PUNCH.get(player.getUUID());
		if (last != null && now - last < 8) {
			return;
		}
		BLOCK_PUNCH.put(player.getUUID(), now);
		Vec3 at = Vec3.atCenterOf(pos);
		if (WeaponAccess.terrainAllowed(level, player, stack, pos)) {
			Impacts.debris(level, at, 2.5, 6, 0.5, 0.6);
			CraterJob.builder(level, pos, 2.6).vertical(0.9).noise(0.3).lining(Palette.KINETIC, 0.9).submit();
		}
		Combat.sphere(level, ModDamageTypes.source(level, WeaponType.GODFIST, player, player), player, at, 4.0, (float) this.tuning().damage * 0.5F, 1.0, 1.5, 0.6);
		Fx.send(level, FxType.KINETIC, at, player.getLookAngle(), 2.0F, 0.0F, this.type.accent(), 96);
		Fx.sound(level, at, ModSounds.GODFIST_PUNCH, 2.0F, 1.1F);
	}

	// ---------------------------------------------------------------- charged abilities

	@Override
	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
		Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 2.0F, 0.8F);
	}

	@Override
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int used) {
		if (used == mode.chargeTicks()) {
			Fx.send(level, FxType.CHARGE, handPosition(player, 1.0F), Vec3.ZERO, 1.0F, 0.0F, this.type.accent(), 64);
			Fx.sound(level, player.position(), ModSounds.GODFIST_SHOCKWAVE, 1.0F, 1.6F);
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
		boolean terrain = WeaponAccess.terrainAllowed(level, player, stack, player.blockPosition());
		if (mode.ultimate()) {
			float radius = (float) (tuning.extra("slamRadius", 26.0) * scale * Math.max(0.2F, settings.sizeFraction()));
			player.setDeltaMovement(player.getDeltaMovement().x, 1.15, player.getDeltaMovement().z);
			player.hurtMarked = true;
			FallGuard.protect(player, 140);
			Fx.sound(level, player.position(), ModSounds.CHARGE_UP, 3.0F, 1.6F);
			Scheduler.later(level, 12, () -> {
				if (player.isAlive() && player.level() == level) {
					player.setDeltaMovement(player.getDeltaMovement().x, -2.6, player.getDeltaMovement().z);
					player.hurtMarked = true;
				}
			});
			Scheduler.later(level, 18, () -> {
				if (player.isAlive() && player.level() == level) {
					this.worldbreaker(level, player, radius, (float) tuning.damage, terrain);
				}
			});
			return true;
		}
		float size = Mth.lerp(charge, 2.5F, 7.0F) * Math.max(0.2F, settings.sizeFraction()) * (float) Math.min(scale, 2.0);
		Vec3 look = player.getLookAngle();
		KineticFistEntity fist = new KineticFistEntity(ModEntities.KINETIC_FIST, level);
		fist.setOwner(player);
		fist.setPos(player.getEyePosition().add(look.scale(1.5 + size * 0.5)).add(0, -0.4, 0));
		fist.setDeltaMovement(look.scale(1.7));
		fist.setYRot(player.getYRot());
		fist.setXRot(player.getXRot());
		double launch = tuning.extra("launchPower", 5.5) * Math.max(0.1F, settings.power() / 100.0F);
		fist.configure(size, charge, (float) tuning.damage * (1.0F + charge), (float) launch, 18 + (int) (charge * 16), terrain);
		level.addFreshEntity(fist);
		player.swing(net.minecraft.world.InteractionHand.MAIN_HAND, true);
		Fx.send(level, FxType.KINETIC, fist.position(), look, size, 0.0F, this.type.accent(), 128);
		Fx.sound(level, player.position(), ModSounds.GODFIST_SHOCKWAVE, 4.0F, 0.7F);
		Fx.shake(level, player.position(), 0.6F, 12, 24);
		return true;
	}

	/** The ultimate ground slam. */
	private void worldbreaker(ServerLevel level, ServerPlayer player, float radius, float damage, boolean terrainAtStart) {
		int x = Mth.floor(player.getX());
		int z = Mth.floor(player.getZ());
		int groundY = Math.min(Mth.floor(player.getY()), level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z));
		BlockPos center = new BlockPos(x, groundY, z);
		Vec3 at = Vec3.atBottomCenterOf(center);
		boolean terrain = terrainAtStart && WeaponAccess.terrainAllowed(level, player, (ItemStack) null, center);
		DamageSource source = ModDamageTypes.source(level, WeaponType.GODFIST, player, player);
		FallGuard.protect(player, 100);
		if (terrain) {
			Impacts.debris(level, at, radius * 0.7, 60, 1.4, 1.8);
			CraterJob.builder(level, center, radius).vertical(0.42).noise(0.25).lining(Palette.KINETIC, 2.0).submit();
			DestructionManager.submit(new WaveJob(level, center, radius * 2.8, 1.25, 4.5, 7.0, crest -> this.waveCrest(level, player, at, crest, damage, source)).delayed(4));
			this.cracks(level, center, radius);
		}
		Combat.sphere(level, source, player, at, radius * 1.3, damage * 4.0F, 0.8, 3.0, 2.2);
		Impacts.shockwaves(level, at, 5, radius * 3.5, 4, this.type.accent(), damage, source, player);
		Fx.send(level, FxType.KINETIC, at, new Vec3(0, -1, 0), radius * 1.6F, 1.0F, this.type.accent(), 768);
		Impacts.blastFx(level, at, radius, 0xBFF6FF, 1.0F, 3.0F);
		Fx.skyFlash(level, at, 5, radius * 12);
		Fx.sound(level, at, ModSounds.GODFIST_SLAM, 24.0F, 0.8F);
		Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 20.0F, 0.45F);
	}

	private void waveCrest(ServerLevel level, ServerPlayer player, Vec3 center, double crest, float damage, DamageSource source) {
		double inner = crest - 3.0;
		AABB box = new AABB(center, center).inflate(crest + 1.0, 12.0, crest + 1.0);
		for (Entity e : level.getEntities(player, box, e -> e.isAlive() && !(e instanceof EffectEntity))) {
			double h = Math.sqrt(e.distanceToSqr(center.x, e.getY(), center.z));
			if (h < inner || h > crest + 1.0) {
				continue;
			}
			Vec3 out = new Vec3(e.getX() - center.x, 0, e.getZ() - center.z);
			out = out.lengthSqr() < 1.0E-4 ? new Vec3(1, 0, 0) : out.normalize();
			if (e instanceof LivingEntity && Combat.canAffect(level, player, e)) {
				Combat.hurt(level, e, source, damage * 0.4F);
			}
			Combat.launch(e, out.scale(0.6).add(0, 1.1, 0));
		}
		if (((int) crest) % 3 == 0) {
			Fx.send(level, FxType.DEBRIS_RING, center, Vec3.ZERO, (float) crest, 0.0F, 0x8C7B6B, 256);
		}
	}

	/** Glowing fissures racing outward from the impact, restored after a while. */
	private void cracks(ServerLevel level, BlockPos center, float radius) {
		TempBlocksJob job = new TempBlocksJob(level, 20 * 14, false);
		RandomSource random = level.getRandom();
		int lines = 10 + random.nextInt(5);
		BlockState fissure = ModBlocks.KINETIC_FRACTURE.defaultBlockState();
		for (int i = 0; i < lines; i++) {
			double angle = Math.PI * 2 * i / lines + random.nextDouble() * 0.4;
			double x = center.getX() + 0.5;
			double z = center.getZ() + 0.5;
			double length = radius * (1.2 + random.nextDouble() * 1.2);
			for (double t = radius * 0.6; t < length; t += 0.8) {
				angle += (random.nextDouble() - 0.5) * 0.35;
				int bx = Mth.floor(x + Math.cos(angle) * t);
				int bz = Mth.floor(z + Math.sin(angle) * t);
				if (Loaded.chunk(level, bx, bz) == null) {
					break;
				}
				int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, bx, bz) - 1;
				if (Math.abs(top - center.getY()) > 10) {
					continue;
				}
				BlockPos pos = new BlockPos(bx, top, bz);
				BlockState state = Loaded.state(level, pos);
				if (state != null && state.isSolid() && !BlockOps.isProtected(level, pos, state) && !state.hasBlockEntity()) {
					job.add(pos, fissure);
					if (random.nextFloat() < 0.4F) {
						job.add(pos.below(), fissure);
					}
				}
			}
		}
		DestructionManager.submit(job.delayed(2));
	}

	public static boolean isHolding(Player player) {
		return player.getMainHandItem().getItem() instanceof GodfistItem;
	}
}
