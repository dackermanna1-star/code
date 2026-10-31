package com.jjkshowdown.entity.boss;

import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.util.Fx;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Summons a rival sorcerer in front of a player. */
public final class BossSpawner {
	private BossSpawner() {
	}

	@Nullable
	public static SorcererBoss summonRival(ServerPlayer player, CharacterType type) {
		ServerLevel level = player.level();
		SorcererBoss boss = type == CharacterType.SUKUNA ? ModEntities.SUKUNA.create(level, EntitySpawnReason.MOB_SUMMONED)
				: ModEntities.GOJO.create(level, EntitySpawnReason.MOB_SUMMONED);
		if (boss == null) return null;
		Vec3 look = player.getLookAngle().multiply(1, 0, 1).normalize();
		Vec3 want = player.position().add(look.scale(9));
		Vec3 spot = Casting.safeSpot(level, boss, want.add(0, 1, 0), player.position());
		if (spot == null) spot = player.position().add(0, 1, 0);
		float yaw = Casting.yawTowards(spot, player.position());
		boss.snapTo(spot.x, spot.y, spot.z, yaw, 0);
		boss.setYHeadRot(yaw);
		boss.setTarget(player);
		level.addFreshEntity(boss);
		Fx.burst(level, type == CharacterType.GOJO ? ModParticles.BLUE_SPARK : ModParticles.CE_WISP_RED, spot.add(0, 1, 0), 80, 0.8);
		Fx.particles(level, ModParticles.IMPACT_FLASH, spot.add(0, 1, 0), 2, 0.2, 0);
		Fx.sound(level, spot, ModSounds.CINEMATIC_HIT, 2.5f, 0.8f);
		return boss;
	}
}
