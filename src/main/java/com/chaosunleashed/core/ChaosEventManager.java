package com.chaosunleashed.core;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.network.ChaosNetworking;
import com.chaosunleashed.network.ChaosStatusPayload;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.boss.BossBar;
import net.minecraft.entity.boss.ServerBossBar;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Server-side scheduler and registry of running events. One instance per running server.
 * <p>
 * Responsibilities: random triggering (only events toggled ON, respecting chance, cooldown, minimum world day and
 * the concurrency limit), ticking events through their phases, boss bars, block change budget, entity cleanup
 * (including leftovers found after a restart) and syncing status to clients (Control Panel GUI, sky effects).
 */
public final class ChaosEventManager {
	@Nullable
	private static ChaosEventManager instance;

	private final MinecraftServer server;
	private final List<ChaosEvent> events = new ArrayList<>();
	private final Map<ChaosEvent, ServerBossBar> bossBars = new HashMap<>();
	private final Map<UUID, ChaosEvent> trackedOwners = new HashMap<>();
	private final List<Entity> pendingDiscard = new ArrayList<>();
	private final BlockChangeQueue blockQueue = new BlockChangeQueue();
	private final Random random = Random.create();
	private int randomTimer;
	private int syncTimer;
	private boolean dirty = true;

	private ChaosEventManager(MinecraftServer server) {
		this.server = server;
	}

	public static void init() {
		ServerLifecycleEvents.SERVER_STARTING.register(server -> instance = new ChaosEventManager(server));
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
			if (instance != null) {
				instance.shutdown();
			}
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> instance = null);
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			if (instance != null && instance.server == server) {
				instance.tick();
			}
		});
		ServerEntityEvents.ENTITY_LOAD.register((entity, world) -> {
			if (instance != null) {
				instance.onEntityLoad(entity);
			}
		});
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (instance != null) {
				for (ChaosEvent event : new ArrayList<>(instance.events)) {
					event.dispatchDeath(entity, source);
				}
			}
		});
		ServerLivingEntityEvents.MOB_CONVERSION.register((previous, converted, keepEquipment) -> {
			if (instance != null) {
				ChaosEvent owner = instance.trackedOwners.get(previous.getUuid());
				if (owner != null && !owner.isEnded()) {
					owner.adopt(converted);
				}
			}
		});
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			if (instance != null) {
				instance.markDirty();
			}
		});
	}

	@Nullable
	public static ChaosEventManager get() {
		return instance;
	}

	public MinecraftServer server() {
		return this.server;
	}

	public ChaosWorldData data() {
		return ChaosWorldData.get(this.server);
	}

	public BlockChangeQueue blockQueue() {
		return this.blockQueue;
	}

	public void markDirty() {
		this.dirty = true;
	}

	// ------------------------------------------------------------------------------------------ queries

	public List<ChaosEvent> activeEvents() {
		return Collections.unmodifiableList(this.events);
	}

	@Nullable
	public ChaosEvent getActive(ChaosEventType type) {
		for (ChaosEvent event : this.events) {
			if (event.type() == type) {
				return event;
			}
		}
		return null;
	}

	public boolean isActive(ChaosEventType type) {
		return this.getActive(type) != null;
	}

	/** Strongest phase of any running event (for the Control Panel screen color / redstone). */
	@Nullable
	public EventPhase dominantPhase() {
		EventPhase best = null;
		for (ChaosEvent event : this.events) {
			EventPhase phase = event.phase();
			if (best == null || phase == EventPhase.ACTIVE || (phase == EventPhase.AFTERMATH && best == EventPhase.WARNING)) {
				best = phase;
			}
		}
		return best;
	}

	public int cooldownRemainingTicks() {
		long last = this.data().getLastEventEnd();
		if (last == Long.MIN_VALUE) {
			return 0;
		}
		long elapsed = this.server.getOverworld().getTime() - last;
		return (int) MathHelper.clamp(ChaosConfig.get().minCooldownSeconds * 20L - elapsed, 0L, Integer.MAX_VALUE);
	}

	// ------------------------------------------------------------------------------------------ settings

	public void setEnabled(ChaosEventType type, boolean enabled) {
		this.data().setEnabled(type, enabled);
		this.markDirty();
	}

	public void setRandomEnabled(boolean enabled) {
		this.data().setRandomEnabled(enabled);
		this.markDirty();
	}

	// ------------------------------------------------------------------------------------------ start / stop

	public record StartResult(boolean success, Text message, @Nullable ChaosEvent event) {
		static StartResult fail(String message) {
			return new StartResult(false, Text.literal(message).formatted(Formatting.RED), null);
		}
	}

	public StartResult start(ChaosEventType type, ServerWorld world, BlockPos origin, @Nullable ServerPlayerEntity target,
							 int intensity, boolean manual) {
		if (this.isActive(type)) {
			return StartResult.fail(type.displayName() + " is already running.");
		}
		if (this.events.size() >= ChaosConfig.get().maxConcurrentEvents) {
			ChaosEvent running = this.events.getFirst();
			return StartResult.fail("Another event is already running (" + running.type().displayName()
				+ "). Stop it first with /chaos stop.");
		}
		if (type.needsSky() && !hasOpenSky(world)) {
			return StartResult.fail(type.displayName() + " needs a dimension with an open sky (like the Overworld).");
		}
		ChaosEvent event;
		try {
			event = type.create(new EventContext(type, world, origin, target, MathHelper.clamp(intensity, 1, 5), manual));
		} catch (RuntimeException e) {
			ChaosUnleashed.LOGGER.error("Failed to create event {}", type.id(), e);
			return StartResult.fail("Failed to start " + type.displayName() + ": " + e.getMessage());
		}
		this.events.add(event);
		ServerBossBar bar = new ServerBossBar(type.coloredName(), BossBar.Color.YELLOW, BossBar.Style.NOTCHED_10);
		bar.setThickenFog(false);
		this.bossBars.put(event, bar);
		this.updateBossBar(event, bar);

		MutableText broadcast = Text.literal("[Chaos] ").formatted(Formatting.DARK_RED, Formatting.BOLD)
			.append(type.coloredName().formatted(Formatting.BOLD))
			.append(Text.literal(" is coming! ").formatted(Formatting.RED).styled(s -> s.withBold(false)))
			.append(Text.literal("(intensity " + event.intensity() + ")").formatted(Formatting.GRAY).styled(s -> s.withBold(false)));
		this.server.getPlayerManager().broadcast(broadcast, false);
		ChaosUnleashed.LOGGER.info("Starting event {} in {} at {} (intensity {}, {})", type.id(),
			world.getRegistryKey().getValue(), origin.toShortString(), event.intensity(), manual ? "manual" : "random");
		this.markDirty();
		return new StartResult(true, Text.literal("Started ").formatted(Formatting.GREEN).append(type.coloredName()), event);
	}

	/** Stops every running event immediately with full cleanup. Returns how many were stopped. */
	public int stopAll() {
		List<ChaosEvent> copy = new ArrayList<>(this.events);
		for (ChaosEvent event : copy) {
			this.finish(event, true);
		}
		return copy.size();
	}

	public boolean stop(ChaosEventType type) {
		ChaosEvent event = this.getActive(type);
		if (event == null) {
			return false;
		}
		this.finish(event, true);
		return true;
	}

	private void finish(ChaosEvent event, boolean forced) {
		this.events.remove(event);
		try {
			event.end(forced);
		} catch (RuntimeException e) {
			ChaosUnleashed.LOGGER.error("Error while cleaning up event {}", event.type().id(), e);
		}
		ServerBossBar bar = this.bossBars.remove(event);
		if (bar != null) {
			bar.clearPlayers();
		}
		this.data().setLastEventEnd(this.server.getOverworld().getTime());
		MutableText message = Text.literal("[Chaos] ").formatted(Formatting.DARK_GREEN, Formatting.BOLD)
			.append(event.type().coloredName().styled(s -> s.withBold(false)))
			.append(Text.literal(forced ? " was stopped." : " has ended.").formatted(Formatting.GREEN).styled(s -> s.withBold(false)));
		this.server.getPlayerManager().broadcast(message, false);
		this.markDirty();
	}

	// ------------------------------------------------------------------------------------------ ticking

	private void tick() {
		ChaosConfig config = ChaosConfig.get();
		for (ChaosEvent event : new ArrayList<>(this.events)) {
			try {
				event.tick();
			} catch (RuntimeException e) {
				ChaosUnleashed.LOGGER.error("Event {} crashed while ticking; stopping it", event.type().id(), e);
				event.requestEnd();
				this.finish(event, true);
				continue;
			}
			if (event.phase() == EventPhase.END) {
				this.finish(event, false);
			}
		}

		this.blockQueue.tick(config.maxBlockChangesPerTick);

		if (!this.pendingDiscard.isEmpty()) {
			for (Entity entity : this.pendingDiscard) {
				if (!entity.isRemoved()) {
					entity.discard();
				}
			}
			this.pendingDiscard.clear();
		}

		if (this.server.getTicks() % 5 == 0) {
			for (ChaosEvent event : this.events) {
				ServerBossBar bar = this.bossBars.get(event);
				if (bar != null) {
					this.updateBossBar(event, bar);
				}
			}
		}

		if (++this.randomTimer >= config.randomCheckIntervalSeconds * 20) {
			this.randomTimer = 0;
			this.tryRandomEvent();
		}

		this.syncTimer++;
		if (this.dirty || (!this.events.isEmpty() && this.syncTimer >= 20)) {
			this.dirty = false;
			this.syncTimer = 0;
			this.broadcastStatus();
		}
	}

	private void tryRandomEvent() {
		ChaosConfig config = ChaosConfig.get();
		ChaosWorldData data = this.data();
		if (!data.isRandomEnabled() || this.events.size() >= config.maxConcurrentEvents) {
			return;
		}
		if (this.cooldownRemainingTicks() > 0) {
			return;
		}
		if (this.server.getOverworld().getTimeOfDay() / 24000L < config.minWorldDay) {
			return;
		}
		List<ServerPlayerEntity> candidates = new ArrayList<>();
		for (ServerPlayerEntity player : this.server.getPlayerManager().getPlayerList()) {
			if (!player.isSpectator() && hasOpenSky(player.getEntityWorld())) {
				candidates.add(player);
			}
		}
		if (candidates.isEmpty()) {
			return;
		}
		ServerPlayerEntity target = candidates.get(this.random.nextInt(candidates.size()));
		ServerWorld world = target.getEntityWorld();
		List<ChaosEventType> types = new ArrayList<>();
		for (ChaosEventType type : ChaosEventType.values()) {
			if (data.isEnabled(type) && !this.isActive(type) && randomTimeWindow(type, world)) {
				types.add(type);
			}
		}
		Collections.shuffle(types, new java.util.Random(this.random.nextLong()));
		for (ChaosEventType type : types) {
			double chance = config.event(type).chance * config.frequencyMultiplier;
			if (this.random.nextDouble() < chance) {
				int intensity = MathHelper.nextInt(this.random, config.randomIntensityMin, config.randomIntensityMax);
				this.start(type, world, target.getBlockPos(), target, intensity, false);
				return;
			}
		}
	}

	/** Random triggers only happen when there is enough day/night left for the event to play out. */
	private static boolean randomTimeWindow(ChaosEventType type, ServerWorld world) {
		long time = Math.floorMod(world.getTimeOfDay(), 24000L);
		return switch (type.timeRequirement()) {
			case NONE -> true;
			case DAY -> time >= 1000L && time < 8000L;
			case NIGHT -> time >= 12800L && time < 16000L;
		};
	}

	public static boolean hasOpenSky(ServerWorld world) {
		return world.getDimension().hasSkyLight() && !world.getDimension().hasCeiling();
	}

	private void updateBossBar(ChaosEvent event, ServerBossBar bar) {
		EventPhase phase = event.phase();
		int seconds = MathHelper.ceil(event.remainingTicks() / 20.0F);
		String time = String.format("%d:%02d", seconds / 60, seconds % 60);
		MutableText name = event.type().coloredName().copy().formatted(Formatting.BOLD);
		MutableText status;
		switch (phase) {
			case WARNING -> {
				bar.setColor(BossBar.Color.YELLOW);
				if (event.isWaitingForTime()) {
					String what = event.type().timeRequirement() == ChaosEventType.TimeRequirement.NIGHT ? "nightfall" : "daylight";
					status = Text.literal("  ⚠ Waiting for " + what).formatted(Formatting.YELLOW);
				} else {
					status = Text.literal("  ⚠ Incoming " + time).formatted(Formatting.YELLOW);
				}
			}
			case ACTIVE -> {
				bar.setColor(BossBar.Color.RED);
				status = Text.literal("  " + time).formatted(Formatting.RED);
			}
			default -> {
				bar.setColor(BossBar.Color.GREEN);
				status = Text.literal("  Aftermath " + time).formatted(Formatting.GREEN);
			}
		}
		name.append(status.styled(s -> s.withBold(false)));
		Text detail = event.bossBarDetail();
		if (detail != null) {
			name.append(Text.literal("  ").append(detail).styled(s -> s.withBold(false)));
		}
		bar.setName(name);
		bar.setPercent(event.phaseLength() <= 0 ? 0.0F : MathHelper.clamp(event.remainingTicks() / (float) event.phaseLength(), 0.0F, 1.0F));

		Set<ServerPlayerEntity> shouldSee = new HashSet<>(event.world().getPlayers());
		for (ServerPlayerEntity player : new ArrayList<>(bar.getPlayers())) {
			if (!shouldSee.contains(player)) {
				bar.removePlayer(player);
			}
		}
		for (ServerPlayerEntity player : shouldSee) {
			bar.addPlayer(player);
		}
	}

	// ------------------------------------------------------------------------------------------ entities

	void registerTracked(UUID uuid, ChaosEvent event) {
		this.trackedOwners.put(uuid, event);
	}

	void untrack(UUID uuid) {
		this.trackedOwners.remove(uuid);
	}

	@Nullable
	public ChaosEvent ownerOf(Entity entity) {
		return this.trackedOwners.get(entity.getUuid());
	}

	private void onEntityLoad(Entity entity) {
		if (!entity.getCommandTags().contains(ChaosEvent.ENTITY_TAG)) {
			return;
		}
		ChaosEvent owner = this.trackedOwners.get(entity.getUuid());
		if (owner != null && !owner.isEnded()) {
			owner.relink(entity);
		} else {
			// Leftover from an event that already ended (e.g. its chunk was unloaded, or the server restarted).
			this.pendingDiscard.add(entity);
		}
	}

	// ------------------------------------------------------------------------------------------ sync

	public void broadcastStatus() {
		for (ServerPlayerEntity player : this.server.getPlayerManager().getPlayerList()) {
			this.sendStatus(player);
		}
	}

	public void sendStatus(ServerPlayerEntity player) {
		ChaosNetworking.sendStatus(player, this.buildStatus(player));
	}

	public ChaosStatusPayload buildStatus(ServerPlayerEntity player) {
		ChaosWorldData data = this.data();
		List<ChaosStatusPayload.EventInfo> infos = new ArrayList<>();
		for (ChaosEvent event : this.events) {
			infos.add(new ChaosStatusPayload.EventInfo(
				event.type().ordinal(),
				event.phase().ordinal(),
				event.phaseTicks(),
				event.phaseLength(),
				event.remainingTicks(),
				event.intensity(),
				event.world().getRegistryKey().getValue(),
				event.clientPos(),
				event.clientValue(),
				event.isWaitingForTime()
			));
		}
		return new ChaosStatusPayload(data.isRandomEnabled(), data.enabledMask(), this.cooldownRemainingTicks(),
			ChaosPermissions.canUsePanel(player), infos);
	}

	// ------------------------------------------------------------------------------------------ shutdown

	private void shutdown() {
		this.stopAllQuietly();
		this.blockQueue.flushEssential();
	}

	private void stopAllQuietly() {
		for (ChaosEvent event : new ArrayList<>(this.events)) {
			this.events.remove(event);
			try {
				event.end(true);
			} catch (RuntimeException e) {
				ChaosUnleashed.LOGGER.error("Error while cleaning up event {} on shutdown", event.type().id(), e);
			}
			ServerBossBar bar = this.bossBars.remove(event);
			if (bar != null) {
				bar.clearPlayers();
			}
		}
	}
}
