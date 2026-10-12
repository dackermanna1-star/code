package com.chaosunleashed.core;

import com.chaosunleashed.network.ChaosNetworking;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.network.packet.s2c.play.PlaySoundS2CPacket;
import net.minecraft.particle.ParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.Registries;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Base class for every world event. Handles the phase machine (WARNING -> ACTIVE -> AFTERMATH -> END), time of
 * day requirements, entity tracking/cleanup and shared helpers (sounds, particles, screen shake, block queue).
 * <p>
 * Subclasses override the {@code on*Start}/{@code tick*} hooks and {@link #onEnd(boolean)}. The manager
 * guarantees {@link #end(boolean)} is called exactly once, no matter how the event finishes (timer, early end,
 * {@code /chaos stop}, Control Panel, or server shutdown), and that call removes every tracked entity.
 */
public abstract class ChaosEvent {
	/** Scoreboard tag put on every entity an event spawns, so leftovers can be removed even after a restart. */
	public static final String ENTITY_TAG = "chaosunleashed.event";

	protected final ChaosEventType type;
	protected final ServerWorld world;
	protected final BlockPos origin;
	protected final int intensity;
	protected final boolean manual;
	@Nullable
	protected final UUID targetId;
	protected final Random random;

	private EventPhase phase = EventPhase.WARNING;
	private int phaseTicks;
	private int phaseLength;
	private int age;
	private boolean waitingForTime;
	private boolean fastForwarding;
	private boolean aftermathRequested;
	private boolean endRequested;
	private boolean ended;
	private final Map<UUID, Entity> tracked = new LinkedHashMap<>();

	protected ChaosEvent(EventContext context) {
		this.type = context.type();
		this.world = context.world();
		this.origin = context.origin();
		this.intensity = MathHelper.clamp(context.intensity(), 1, 5);
		this.manual = context.manual();
		this.targetId = context.target() != null ? context.target().getUuid() : null;
		this.random = Random.create();
		this.phaseLength = this.warningLength();
	}

	// ------------------------------------------------------------------------------------------ durations

	protected int warningLength() {
		return this.settings().warningSeconds * 20;
	}

	protected int activeLength() {
		return this.settings().durationSeconds * 20;
	}

	protected int aftermathLength() {
		return this.settings().aftermathSeconds * 20;
	}

	protected ChaosConfig config() {
		return ChaosConfig.get();
	}

	protected ChaosConfig.EventSettings settings() {
		return ChaosConfig.get().event(this.type);
	}

	// ------------------------------------------------------------------------------------------ presentation

	/** Big title shown at the start of the warning phase, e.g. "⚠ The sky is cracking...". */
	public abstract Text warningTitle();

	/** Subtitle shown under the warning title. */
	public abstract Text warningSubtitle();

	/** Unique sound played to everyone in the world when the warning starts. */
	protected abstract SoundEvent warningSound();

	/** Extra text appended to the boss bar (e.g. "UFOs left: 3"). */
	@Nullable
	public Text bossBarDetail() {
		return null;
	}

	/** Event-specific number sent to clients (e.g. black hole radius, eclipse coverage). */
	public float clientValue() {
		return 0.0F;
	}

	/** Position sent to clients for event-specific visuals. */
	public BlockPos clientPos() {
		return this.origin;
	}

	// ------------------------------------------------------------------------------------------ hooks

	protected void onWarningStart() {
	}

	protected void tickWarning() {
	}

	protected void onActiveStart() {
	}

	protected void tickActive() {
	}

	protected void onAftermathStart() {
	}

	protected void tickAftermath() {
	}

	/**
	 * Final cleanup. Always called exactly once. {@code forced} is true when the event was stopped early by a
	 * command, the Control Panel or a server shutdown. Tracked entities are removed after this returns.
	 */
	protected void onEnd(boolean forced) {
	}

	/** Called whenever any living entity dies in any world while this event runs. */
	protected void onEntityDeath(net.minecraft.entity.LivingEntity entity, net.minecraft.entity.damage.DamageSource source) {
	}

	final void dispatchDeath(net.minecraft.entity.LivingEntity entity, net.minecraft.entity.damage.DamageSource source) {
		if (!this.ended) {
			this.onEntityDeath(entity, source);
		}
	}

	/** Called for each tracked entity that is still loaded when the event ends. Default: removes it with a puff. */
	protected void cleanupEntity(Entity entity) {
		this.world.spawnParticles(ParticleTypes.POOF, entity.getX(), entity.getBodyY(0.5), entity.getZ(), 6,
			entity.getWidth() * 0.4, entity.getHeight() * 0.4, entity.getWidth() * 0.4, 0.02);
		entity.discard();
	}

	// ------------------------------------------------------------------------------------------ phase machine

	final void tick() {
		if (this.ended) {
			return;
		}
		this.age++;
		this.phaseTicks++;
		switch (this.phase) {
			case WARNING -> {
				if (this.phaseTicks == 1) {
					this.startWarningPresentation();
					this.onWarningStart();
				}
				this.handleTimeRequirement();
				this.tickWarning();
				if (this.endRequested) {
					this.setPhase(EventPhase.END);
				} else if (this.phaseTicks >= this.phaseLength && !this.waitingForTime && !this.fastForwarding) {
					this.setPhase(EventPhase.ACTIVE);
				}
			}
			case ACTIVE -> {
				this.tickActive();
				if (this.endRequested) {
					this.setPhase(EventPhase.END);
				} else if (this.aftermathRequested || this.phaseTicks >= this.phaseLength) {
					this.setPhase(EventPhase.AFTERMATH);
				}
			}
			case AFTERMATH -> {
				this.tickAftermath();
				if (this.endRequested || this.phaseTicks >= this.phaseLength) {
					this.setPhase(EventPhase.END);
				}
			}
			case END -> {
			}
		}
	}

	private void setPhase(EventPhase next) {
		this.phase = next;
		this.phaseTicks = 0;
		ChaosEventManager manager = ChaosEventManager.get();
		switch (next) {
			case ACTIVE -> {
				this.phaseLength = Math.max(20, this.activeLength());
				this.onActiveStart();
			}
			case AFTERMATH -> {
				this.phaseLength = Math.max(20, this.aftermathLength());
				this.onAftermathStart();
			}
			default -> this.phaseLength = 0;
		}
		if (manager != null) {
			manager.markDirty();
		}
	}

	private void startWarningPresentation() {
		for (ServerPlayerEntity player : this.players()) {
			ChaosNetworking.sendTitle(player, this.warningTitle(), this.warningSubtitle());
		}
		this.playSoundToAll(this.warningSound(), 1.0F, 1.0F);
	}

	/** Day-only / night-only events: fast-forward time (default) or hold the warning until the right time. */
	private void handleTimeRequirement() {
		ChaosEventType.TimeRequirement requirement = this.type.timeRequirement();
		if (requirement == ChaosEventType.TimeRequirement.NONE || this.timeSatisfied()) {
			this.waitingForTime = false;
			this.fastForwarding = false;
			return;
		}
		if (this.config().skipTimeForManualStart()) {
			this.fastForwarding = true;
			this.waitingForTime = false;
			MinecraftServer server = this.world.getServer();
			for (ServerWorld serverWorld : server.getWorlds()) {
				serverWorld.setTimeOfDay(serverWorld.getTimeOfDay() + 150);
			}
			server.sendTimeUpdatePackets();
		} else {
			this.waitingForTime = true;
			// Hold the warning a few seconds before its end until the time is right.
			this.phaseTicks = Math.min(this.phaseTicks, Math.max(0, this.phaseLength - 60));
		}
	}

	public boolean timeSatisfied() {
		long time = Math.floorMod(this.world.getTimeOfDay(), 24000L);
		return switch (this.type.timeRequirement()) {
			case NONE -> true;
			case DAY -> time >= 1000L && time < 11000L;
			case NIGHT -> time >= 13000L && time < 22500L;
		};
	}

	public boolean isWaitingForTime() {
		return this.waitingForTime;
	}

	/** Ends the active phase early and moves to the aftermath (e.g. all UFOs destroyed). */
	public void requestAftermath() {
		this.aftermathRequested = true;
	}

	/** Ends the event at the end of this tick, skipping any remaining phases. */
	public void requestEnd() {
		this.endRequested = true;
	}

	/** Runs the final cleanup. Called by the manager exactly once. */
	final void end(boolean forced) {
		if (this.ended) {
			return;
		}
		this.ended = true;
		this.phase = EventPhase.END;
		try {
			this.onEnd(forced);
		} finally {
			ChaosEventManager manager = ChaosEventManager.get();
			for (Map.Entry<UUID, Entity> entry : this.tracked.entrySet()) {
				Entity entity = entry.getValue();
				if (entity == null || entity.isRemoved()) {
					entity = this.world.getEntity(entry.getKey());
				}
				if (entity != null && !entity.isRemoved()) {
					this.cleanupEntity(entity);
				}
				if (manager != null) {
					manager.untrack(entry.getKey());
				}
			}
			this.tracked.clear();
			if (manager != null) {
				manager.blockQueue().cancel(this);
			}
		}
	}

	public boolean isEnded() {
		return this.ended;
	}

	public ChaosEventType type() {
		return this.type;
	}

	public ServerWorld world() {
		return this.world;
	}

	public BlockPos origin() {
		return this.origin;
	}

	public int intensity() {
		return this.intensity;
	}

	public EventPhase phase() {
		return this.phase;
	}

	public int phaseTicks() {
		return this.phaseTicks;
	}

	public int phaseLength() {
		return this.phaseLength;
	}

	public int age() {
		return this.age;
	}

	/** Progress 0..1 through the current phase. */
	public float phaseProgress() {
		return this.phaseLength <= 0 ? 1.0F : MathHelper.clamp(this.phaseTicks / (float) this.phaseLength, 0.0F, 1.0F);
	}

	/** Ticks left in the current phase, as shown on the boss bar. */
	public int remainingTicks() {
		return Math.max(0, this.phaseLength - this.phaseTicks);
	}

	/** Used by subclasses that end on their own condition (e.g. sunrise) to extend the active phase. */
	protected void extendPhase(int ticks) {
		this.phaseLength = Math.max(this.phaseLength, this.phaseTicks + ticks);
	}

	protected void setPhaseLength(int ticks) {
		this.phaseLength = Math.max(this.phaseTicks + 1, ticks);
	}

	// ------------------------------------------------------------------------------------------ entities

	/** Spawns an entity and tracks it so it is removed when the event ends. Returns false if it failed. */
	protected boolean spawnTracked(Entity entity) {
		this.track(entity);
		if (!this.world.spawnEntity(entity)) {
			this.forget(entity.getUuid());
			return false;
		}
		return true;
	}

	/** Spawns a mob with normal equipment/initialization and tracks it. */
	protected boolean spawnTrackedMob(MobEntity mob) {
		mob.initialize(this.world, this.world.getLocalDifficulty(mob.getBlockPos()), SpawnReason.EVENT, null);
		mob.setPersistent();
		return this.spawnTracked(mob);
	}

	protected void track(Entity entity) {
		entity.addCommandTag(ENTITY_TAG);
		this.tracked.put(entity.getUuid(), entity);
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager != null) {
			manager.registerTracked(entity.getUuid(), this);
		}
	}

	protected void forget(UUID uuid) {
		this.tracked.remove(uuid);
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager != null) {
			manager.untrack(uuid);
		}
	}

	/** Tracks an entity created from a tracked one (e.g. a piglin zombifying), so it is cleaned up too. */
	void adopt(Entity entity) {
		this.track(entity);
	}

	/** Called by the manager when a tracked entity is (re)loaded from disk. */
	void relink(Entity entity) {
		if (this.tracked.containsKey(entity.getUuid())) {
			this.tracked.put(entity.getUuid(), entity);
		}
	}

	/** Currently loaded, alive tracked entities. Entities that died or were removed for good are forgotten. */
	protected List<Entity> trackedEntities() {
		List<Entity> list = new ArrayList<>();
		Iterator<Map.Entry<UUID, Entity>> iterator = this.tracked.entrySet().iterator();
		while (iterator.hasNext()) {
			Map.Entry<UUID, Entity> entry = iterator.next();
			Entity entity = entry.getValue();
			if (entity == null) {
				continue;
			}
			if (entity.isRemoved()) {
				Entity.RemovalReason reason = entity.getRemovalReason();
				if (reason == null || reason.shouldDestroy()) {
					iterator.remove();
					ChaosEventManager manager = ChaosEventManager.get();
					if (manager != null) {
						manager.untrack(entry.getKey());
					}
				}
				continue;
			}
			list.add(entity);
		}
		return list;
	}

	protected int trackedCount() {
		return this.trackedEntities().size();
	}

	/** Per-event entity cap from the config. */
	protected int entityCap() {
		return this.config().maxEntitiesPerEvent;
	}

	protected boolean canSpawnMore() {
		return this.trackedCount() < this.entityCap();
	}

	// ------------------------------------------------------------------------------------------ players

	/** Non-spectator players in the event's world. */
	public List<ServerPlayerEntity> players() {
		List<ServerPlayerEntity> list = new ArrayList<>();
		for (ServerPlayerEntity player : this.world.getPlayers()) {
			if (!player.isSpectator()) {
				list.add(player);
			}
		}
		return list;
	}

	/** Non-spectator, non-creative players in the event's world (the ones events should hurt). */
	public List<ServerPlayerEntity> vulnerablePlayers() {
		List<ServerPlayerEntity> list = new ArrayList<>();
		for (ServerPlayerEntity player : this.world.getPlayers()) {
			if (!player.isSpectator() && !player.isCreative() && player.isAlive()) {
				list.add(player);
			}
		}
		return list;
	}

	public List<ServerPlayerEntity> playersNear(Vec3d center, double radius) {
		List<ServerPlayerEntity> list = new ArrayList<>();
		double r2 = radius * radius;
		for (ServerPlayerEntity player : this.players()) {
			if (player.squaredDistanceTo(center) <= r2) {
				list.add(player);
			}
		}
		return list;
	}

	@Nullable
	protected ServerPlayerEntity target() {
		if (this.targetId == null) {
			return null;
		}
		ServerPlayerEntity player = this.world.getServer().getPlayerManager().getPlayer(this.targetId);
		return player != null && player.getEntityWorld() == this.world ? player : null;
	}

	/** The target player, or a random player in the world, or null. */
	@Nullable
	protected ServerPlayerEntity focusPlayer() {
		ServerPlayerEntity target = this.target();
		if (target != null && !target.isSpectator()) {
			return target;
		}
		List<ServerPlayerEntity> players = this.players();
		return players.isEmpty() ? null : players.get(this.random.nextInt(players.size()));
	}

	/** Event radius scaled by intensity, capped by the config's maxRadius. */
	protected int radius(int base, int perIntensity) {
		return Math.min(this.config().maxRadius, base + perIntensity * (this.intensity - 1));
	}

	// ------------------------------------------------------------------------------------------ world helpers

	protected BlockChangeQueue blocks() {
		ChaosEventManager manager = ChaosEventManager.get();
		return manager != null ? manager.blockQueue() : new BlockChangeQueue();
	}

	protected boolean blockDamage() {
		return this.config().blockDamage;
	}

	protected boolean canModify(BlockPos pos, BlockState state) {
		return BlockSafety.canModify(this.world, pos, state);
	}

	protected BlockPos surface(int x, int z) {
		return this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
	}

	protected boolean isChunkLoaded(BlockPos pos) {
		return this.world.isChunkLoaded(pos.getX() >> 4, pos.getZ() >> 4);
	}

	// ------------------------------------------------------------------------------------------ effects

	/** Plays a sound to every player in the world at their own position (non-directional). */
	public void playSoundToAll(SoundEvent sound, float volume, float pitch) {
		RegistryEntry<SoundEvent> entry = Registries.SOUND_EVENT.getEntry(sound);
		for (ServerPlayerEntity player : this.world.getPlayers()) {
			player.networkHandler.sendPacket(new PlaySoundS2CPacket(entry, SoundCategory.WEATHER,
				player.getX(), player.getEyeY(), player.getZ(), volume, pitch, this.random.nextLong()));
		}
	}

	/** Plays a positional sound. Volume above 1 increases the audible range (16 blocks per 1.0). */
	public void playSoundAt(Vec3d pos, SoundEvent sound, float volume, float pitch) {
		this.world.playSound(null, pos.x, pos.y, pos.z, sound, SoundCategory.WEATHER, volume, pitch);
	}

	/** Particles that are visible from far away (up to 512 blocks). */
	public void farParticles(ParticleEffect effect, Vec3d pos, int count, double dx, double dy, double dz, double speed) {
		for (ServerPlayerEntity player : this.world.getPlayers()) {
			this.world.spawnParticles(player, effect, true, true, pos.x, pos.y, pos.z, count, dx, dy, dz, speed);
		}
	}

	public void shake(ServerPlayerEntity player, float strength, int ticks) {
		ChaosNetworking.sendShake(player, strength, ticks);
	}

	/** Shakes every player within {@code radius} of {@code center}, weaker with distance. */
	public void shakeNear(Vec3d center, double radius, float strength, int ticks) {
		for (ServerPlayerEntity player : this.playersNear(center, radius)) {
			double distance = Math.sqrt(player.squaredDistanceTo(center));
			float falloff = (float) (1.0 - distance / radius);
			if (falloff > 0.02F) {
				this.shake(player, strength * falloff, ticks);
			}
		}
	}

	/** Sends an action-bar message to every player in the world. */
	public void actionBarAll(Text text) {
		for (ServerPlayerEntity player : this.world.getPlayers()) {
			player.sendMessage(text, true);
		}
	}

	public void chatAll(Text text) {
		for (ServerPlayerEntity player : this.world.getServer().getPlayerManager().getPlayerList()) {
			player.sendMessage(text, false);
		}
	}
}
