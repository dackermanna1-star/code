package com.blademode.cut;

import com.blademode.BladeConfig;
import com.blademode.BladeMode;
import com.blademode.item.HighFrequencyBladeItem;
import com.blademode.net.SlashFxPayload;
import com.blademode.piece.PieceEntity;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.ServerTickRateManager;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/** Server side of a slash: validation, cutting the world, pieces and entities, effects. */
public final class SlashHandler {
	private static final Map<UUID, Long> LAST_SLASH = new HashMap<>();
	private static final Map<UUID, Long> IN_BLADE_MODE = new HashMap<>();
	private static float savedTickRate = -1;

	private SlashHandler() {
	}

	public static void handleSlash(ServerPlayer player, Vec3 clientEye, Vec3 dirA, Vec3 dirB) {
		if (!player.isAlive() || player.isSpectator()) {
			return;
		}
		ItemStack stack = player.getMainHandItem();
		if (!(stack.getItem() instanceof HighFrequencyBladeItem)) {
			return;
		}
		ServerLevel level = player.level();
		BladeConfig cfg = BladeConfig.get();
		long now = level.getGameTime();
		Long last = LAST_SLASH.get(player.getUUID());
		if (last != null && now - last < cfg.cooldownTicks && now >= last) {
			return;
		}
		LAST_SLASH.put(player.getUUID(), now);

		// Trust the client's eye position only if it is close to where the server thinks it is.
		Vec3 eye = player.getEyePosition();
		if (clientEye.isFinite() && clientEye.distanceToSqr(eye) < 36.0) {
			eye = clientEye;
		}
		Slash slash = Slash.of(eye, dirA, dirB, cfg.reach);
		if (slash == null) {
			return;
		}
		perform(level, player, slash);
		player.swing(InteractionHand.MAIN_HAND, true);
		if (!player.isCreative()) {
			stack.hurtAndBreak(1, player, EquipmentSlot.MAINHAND);
		}
	}

	/** Cuts everything the slash touches. Usable without a player (e.g. from tests). */
	public static void perform(ServerLevel level, @Nullable ServerPlayer player, Slash slash) {
		BladeConfig cfg = BladeConfig.get();
		AABB area = slash.bounds().inflate(1.0);
		// Pieces this very slash breaks off the world must not be cut again by it.
		List<PieceEntity> existing = level.getEntitiesOfClass(PieceEntity.class, area.inflate(4.0), e -> !e.isRemoved());
		CutEngine.Result result = CutEngine.cut(level, player, slash);

		int pieces = 0;
		for (PieceEntity piece : existing) {
			if (!piece.isRemoved() && touches(slash, piece.getBoundingBox())) {
				pieces += PieceCutter.cut(level, piece, slash);
			}
		}

		int hits = 0;
		List<Entity> targets = level.getEntities(player, area, e -> e.isAlive() && !(e instanceof PieceEntity)
			&& !(e instanceof ItemEntity) && !(e instanceof ExperienceOrb) && e != player
			&& !(player != null && e instanceof OwnableEntity own && own.getOwner() == player));
		for (Entity e : targets) {
			if (!touches(slash, e.getBoundingBox())) {
				continue;
			}
			boolean hurt = e.hurtServer(level, player != null ? level.damageSources().playerAttack(player) : level.damageSources().generic(), cfg.entityDamage);
			if (hurt) {
				hits++;
				Vec3 c = e.getBoundingBox().getCenter();
				level.sendParticles(ParticleTypes.DAMAGE_INDICATOR, c.x, c.y, c.z, 6, 0.2, 0.2, 0.2, 0.2);
				if (e instanceof LivingEntity living) {
					Vector3d push = slash.bladeDirection(c.x, c.y, c.z);
					living.knockback(0.4, -push.x, -push.z);
				}
			}
		}

		effects(level, player, slash, result.didSomething() || pieces > 0 || hits > 0);
		BladeMode.LOGGER.debug("Slash: sliced {} blocks, {} new pieces, {} piece fragments, {} entities", result.slicedBlocks(), result.fallingPieces(), pieces, hits);
	}

	/** Whether an axis-aligned box straddles the cut plane inside the swept sector. */
	public static boolean touches(Slash slash, AABB box) {
		double min = slash.worldPlane().minDist(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
		double max = slash.worldPlane().maxDist(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
		if (min > 0 || max < 0) {
			return false;
		}
		Vec3 c = box.getCenter();
		double dc = slash.dist(c.x, c.y, c.z);
		double margin = Math.max(box.getXsize(), Math.max(box.getYsize(), box.getZsize())) * 0.5;
		return slash.inSector(c.x - slash.n.x * dc, c.y - slash.n.y * dc, c.z - slash.n.z * dc, margin);
	}

	private static void effects(ServerLevel level, @Nullable ServerPlayer player, Slash slash, boolean hitSomething) {
		Vector3d e = slash.eye;
		double reach = Math.min(slash.reach, 24.0);
		// Sparks along the edge of the stroke.
		for (int i = 0; i <= 12; i++) {
			double t = i / 12.0;
			Vector3d dir = new Vector3d(slash.r1).mul(1 - t).fma(t, slash.r2).normalize();
			for (double dist = 2.0; dist < reach; dist += 3.0) {
				Vector3d p = new Vector3d(dir).mul(dist).add(e);
				if (level.random.nextFloat() < 0.35F) {
					level.sendParticles(ParticleTypes.ELECTRIC_SPARK, p.x, p.y, p.z, 1, 0.05, 0.05, 0.05, 0.02);
				}
			}
		}
		Vector3d mid = new Vector3d(slash.r1).add(slash.r2).normalize().mul(2.5).add(e);
		level.sendParticles(ParticleTypes.SWEEP_ATTACK, mid.x, mid.y, mid.z, 1, 0, 0, 0, 0);
		level.playSound(null, e.x, e.y, e.z, SoundEvents.PLAYER_ATTACK_SWEEP, SoundSource.PLAYERS, 1.0F, 1.3F + level.random.nextFloat() * 0.2F);
		if (hitSomething) {
			level.playSound(null, mid.x, mid.y, mid.z, SoundEvents.TRIDENT_HIT, SoundSource.PLAYERS, 0.6F, 1.8F);
		}

		SlashFxPayload fx = new SlashFxPayload(new Vec3(e.x, e.y, e.z), new Vec3(slash.r1.x, slash.r1.y, slash.r1.z),
			new Vec3(slash.r2.x, slash.r2.y, slash.r2.z), (float) slash.reach);
		for (ServerPlayer p : PlayerLookup.around(level, new Vec3(e.x, e.y, e.z), 96.0)) {
			ServerPlayNetworking.send(p, fx);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Blade mode slow motion (only when it would not disturb other players).

	public static void setBladeMode(ServerPlayer player, boolean active) {
		if (active && player.getMainHandItem().getItem() instanceof HighFrequencyBladeItem) {
			IN_BLADE_MODE.put(player.getUUID(), System.nanoTime());
		} else {
			IN_BLADE_MODE.remove(player.getUUID());
		}
		updateSlowMotion(player.level().getServer());
	}

	public static void onDisconnect(ServerPlayer player) {
		IN_BLADE_MODE.remove(player.getUUID());
		LAST_SLASH.remove(player.getUUID());
		updateSlowMotion(player.level().getServer());
	}

	public static void tick(MinecraftServer server) {
		if (IN_BLADE_MODE.isEmpty()) {
			return;
		}
		// A client that crashed or lagged out must not leave the world in slow motion.
		long now = System.nanoTime();
		if (IN_BLADE_MODE.values().removeIf(t -> now - t > 15_000_000_000L)) {
			updateSlowMotion(server);
		}
	}

	private static void updateSlowMotion(MinecraftServer server) {
		ServerTickRateManager ticks = server.tickRateManager();
		BladeConfig cfg = BladeConfig.get();
		boolean want = cfg.slowMotion && !IN_BLADE_MODE.isEmpty() && server.getPlayerCount() == 1;
		if (want && savedTickRate < 0) {
			savedTickRate = ticks.tickrate();
			if (savedTickRate > cfg.slowMotionTickRate) {
				ticks.setTickRate(cfg.slowMotionTickRate);
			} else {
				savedTickRate = -1;
			}
		} else if (!want && savedTickRate > 0) {
			ticks.setTickRate(savedTickRate);
			savedTickRate = -1;
		}
	}

	public static void onServerStopping() {
		IN_BLADE_MODE.clear();
		LAST_SLASH.clear();
		savedTickRate = -1;
	}
}
