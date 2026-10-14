package net.abyssaldescent.dungeon.run;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.block.ReliquaryBlockEntity;
import net.abyssaldescent.block.RunicSealBlock;
import net.abyssaldescent.block.WaystoneBlock;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.dungeon.loot.LootDrops;
import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.entity.DungeonBoss;
import net.abyssaldescent.entity.boss.DungeonBossEntity;
import net.abyssaldescent.entity.merchant.DelverMerchant;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.registry.ModEffects;
import net.abyssaldescent.registry.ModEntities;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.registry.ModWorldgen;
import net.abyssaldescent.util.Messages;
import net.abyssaldescent.world.DungeonCoords;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.SectionPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Owns every expedition on the server: party formation at the gate, floor transitions, encounters (via
 * {@link EncounterDirector}), bosses, extraction and defeat. Persisted with the overworld's saved data.
 */
public final class RunManager extends SavedData {
	public static final Codec<RunManager> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.optionalFieldOf("next_slot", 0).forGetter(m -> m.nextSlot),
		DungeonRun.CODEC.listOf().optionalFieldOf("runs", List.of()).forGetter(m -> List.copyOf(m.runs.values()))
	).apply(i, RunManager::new));
	public static final SavedDataType<RunManager> TYPE = new SavedDataType<>(AbyssalDescent.MOD_ID + "_runs", RunManager::new, CODEC, null);

	private static final int DESCENT_TICKS = 60;
	private static final int CONFIRM_WINDOW = 100;
	/**
	 * Holding the use key repeats the use every 4 ticks, so uses closer together than this are one long press, not the
	 * deliberate second use a confirmation asks for.
	 */
	private static final int CONFIRM_MIN_GAP = 10;

	private int nextSlot;
	private final Map<Integer, DungeonRun> runs = new LinkedHashMap<>();
	private final Map<UUID, Integer> playerRuns = new HashMap<>();
	private final List<Attunement> attunements = new ArrayList<>();
	private final Map<UUID, Confirm> extractConfirm = new HashMap<>();
	private final Map<UUID, Confirm> idolConfirm = new HashMap<>();
	private final Set<UUID> authorizedTransfers = new HashSet<>();
	private MinecraftServer server;

	private static final class Attunement {
		final ResourceKey<Level> dimension;
		final BlockPos gate;
		final UUID initiator;
		int ticks;

		Attunement(ResourceKey<Level> dimension, BlockPos gate, UUID initiator, int ticks) {
			this.dimension = dimension;
			this.gate = gate;
			this.initiator = initiator;
			this.ticks = ticks;
		}
	}

	/** A "use again to confirm" prompt: when it was shown and when the player last used the block. */
	private static final class Confirm {
		final long prompted;
		long lastUse;

		Confirm(long now) {
			this.prompted = now;
			this.lastUse = now;
		}
	}

	private enum ConfirmStep {
		/** First use (or the previous prompt expired): show the prompt. */
		PROMPT,
		/** The use key is still held down since the prompt: ignore. */
		HELD,
		CONFIRMED
	}

	public RunManager() {
	}

	private RunManager(int nextSlot, List<DungeonRun> loaded) {
		this.nextSlot = nextSlot;
		for (DungeonRun run : loaded) {
			runs.put(run.slot, run);
			for (UUID member : run.active) {
				playerRuns.put(member, run.slot);
			}
		}
	}

	public static RunManager get(MinecraftServer server) {
		RunManager manager = server.overworld().getDataStorage().computeIfAbsent(TYPE);
		manager.server = server;
		return manager;
	}

	public MinecraftServer server() {
		return server;
	}

	// ====================================================================== queries

	@Nullable
	public DungeonRun runOf(UUID player) {
		Integer slot = playerRuns.get(player);
		return slot == null ? null : runs.get(slot);
	}

	@Nullable
	public DungeonRun runOf(ServerPlayer player) {
		return runOf(player.getUUID());
	}

	@Nullable
	public DungeonRun runBySlot(int slot) {
		return runs.get(slot);
	}

	public Iterable<DungeonRun> runs() {
		return runs.values();
	}

	public boolean isAuthorizedTransfer(UUID player) {
		return authorizedTransfers.contains(player);
	}

	/** The deepest floor an expedition may reach: the implemented zones, capped by the {@code maxFloor} rule. */
	public static int deepestReachableFloor() {
		return Math.max(1, Math.min(Zone.deepestImplementedFloor(), AdConfig.get().rules.maxFloor));
	}

	/** True if a party may go to {@code floor}: it is generated and the {@code maxFloor} rule allows it. */
	public static boolean isReachableFloor(int slot, int floor) {
		return FloorLayouts.isGeneratedFloor(slot, floor) && floor <= deepestReachableFloor();
	}

	public FloorLayout layout(DungeonRun run) {
		return FloorLayouts.get(server.getWorldData().worldGenOptions().seed(), run.slot, run.floor());
	}

	@Nullable
	public ServerLevel dungeon() {
		return DungeonDimension.level(server);
	}

	/** Online, active members of the run who are currently inside the dungeon. */
	public List<ServerPlayer> presentMembers(DungeonRun run) {
		List<ServerPlayer> list = new ArrayList<>();
		for (UUID uuid : run.active) {
			ServerPlayer player = server.getPlayerList().getPlayer(uuid);
			if (player != null && DungeonDimension.isDungeon(player.level()) && player.isAlive()) {
				list.add(player);
			}
		}
		return list;
	}

	// ====================================================================== gate & party

	public void beginAttunement(ServerLevel level, BlockPos gate, ServerPlayer initiator) {
		if (DungeonDimension.isDungeon(level)) {
			initiator.displayClientMessage(Component.translatable("message.abyssal_descent.gate.inert"), true);
			return;
		}
		if (runOf(initiator) != null) {
			initiator.displayClientMessage(Component.translatable("message.abyssal_descent.gate.already_in_run"), true);
			return;
		}
		if (dungeon() == null) {
			initiator.sendSystemMessage(Component.translatable("message.abyssal_descent.gate.missing_dimension").withStyle(ChatFormatting.RED));
			return;
		}
		for (Attunement a : attunements) {
			if (a.gate.equals(gate) && a.dimension == level.dimension()) {
				initiator.displayClientMessage(Component.translatable("message.abyssal_descent.gate.attuning_already"), true);
				return;
			}
		}
		int seconds = AdConfig.get().rules.gateAttunementSeconds;
		attunements.add(new Attunement(level.dimension(), gate, initiator.getUUID(), seconds * 20));
		level.playSound(null, gate, ModSounds.GATE_ATTUNE, SoundSource.BLOCKS, 1.2F, 1.0F);
		int start = initiator.getAttachedOrCreate(ModAttachments.PROGRESS).selectedStart();
		for (ServerPlayer player : playersNear(level, gate, AdConfig.get().rules.gatePartyRadius + 6)) {
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.gate.attuning", initiator.getDisplayName(), seconds,
				Component.translatable("message.abyssal_descent.floor", start)).withStyle(ChatFormatting.DARK_AQUA));
		}
	}

	public void cycleStartFloor(ServerPlayer player) {
		PlayerProgress progress = player.getAttachedOrCreate(ModAttachments.PROGRESS);
		List<Integer> usable = progress.usableCheckpoints();
		int index = usable.indexOf(progress.selectedStart());
		int next = usable.get((index + 1) % usable.size());
		player.setAttached(ModAttachments.PROGRESS, progress.withSelectedStart(next));
		Zone zone = Zone.forFloor(next);
		player.displayClientMessage(Component.translatable("message.abyssal_descent.gate.start_floor", next, zone.displayName().copy().withStyle(zone.chatColor()))
			.withStyle(ChatFormatting.GRAY), true);
		if (usable.size() == 1) {
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.gate.no_checkpoints").withStyle(ChatFormatting.DARK_GRAY));
		}
	}

	private void tickAttunements() {
		Iterator<Attunement> it = attunements.iterator();
		while (it.hasNext()) {
			Attunement a = it.next();
			ServerLevel level = server.getLevel(a.dimension);
			if (level == null || !level.getBlockState(a.gate).is(ModBlocks.ABYSSAL_GATE)) {
				it.remove();
				continue;
			}
			a.ticks--;
			double radius = AdConfig.get().rules.gatePartyRadius;
			if (a.ticks % 4 == 0) {
				// A ring of motes contracts towards the gate as attunement completes.
				double progress = 1.0 - a.ticks / (AdConfig.get().rules.gateAttunementSeconds * 20.0);
				double r = radius * (1.0 - progress * 0.85);
				for (int k = 0; k < 16; k++) {
					double angle = k / 16.0 * Math.PI * 2 + a.ticks * 0.05;
					level.sendParticles(ModParticles.RIFT_MOTE, a.gate.getX() + 0.5 + Math.cos(angle) * r, a.gate.getY() + 0.2,
						a.gate.getZ() + 0.5 + Math.sin(angle) * r, 1, 0, 0.05, 0, 0.0);
				}
			}
			if (a.ticks % 20 == 0 && a.ticks > 0) {
				for (ServerPlayer p : playersNear(level, a.gate, radius)) {
					Messages.actionBar(p, Component.translatable("message.abyssal_descent.gate.countdown", a.ticks / 20).withStyle(ChatFormatting.AQUA));
				}
				level.playSound(null, a.gate, ModSounds.TRAP_CLICK, SoundSource.BLOCKS, 0.6F, 0.6F + (1.0F - a.ticks / 100.0F) * 0.6F);
			}
			if (a.ticks <= 0) {
				it.remove();
				completeAttunement(level, a);
			}
		}
	}

	private void completeAttunement(ServerLevel level, Attunement a) {
		ServerPlayer initiator = server.getPlayerList().getPlayer(a.initiator);
		List<ServerPlayer> party = new ArrayList<>();
		if (initiator != null && initiator.level() == level && runOf(initiator) == null
			&& initiator.position().distanceTo(Vec3.atCenterOf(a.gate)) <= AdConfig.get().rules.gatePartyRadius + 2) {
			party.add(initiator);
		}
		for (ServerPlayer player : playersNear(level, a.gate, AdConfig.get().rules.gatePartyRadius)) {
			if (party.size() >= AdConfig.get().rules.maxPartySize) {
				break;
			}
			if (!party.contains(player) && runOf(player) == null && !player.isSpectator()) {
				party.add(player);
			}
		}
		if (party.isEmpty()) {
			return;
		}
		ServerPlayer leader = party.get(0);
		int start = leader.getAttachedOrCreate(ModAttachments.PROGRESS).selectedStart();
		for (ServerPlayer member : party) {
			if (!member.getAttachedOrCreate(ModAttachments.PROGRESS).usableCheckpoints().contains(start)) {
				Messages.chat(party, Component.translatable("message.abyssal_descent.gate.checkpoint_missing", member.getDisplayName(), start)
					.withStyle(ChatFormatting.GOLD));
				start = 1;
				break;
			}
		}
		if (start > deepestReachableFloor()) {
			start = 1;
		}
		startRun(level, a.gate, party, start);
	}

	public DungeonRun startRun(ServerLevel origin, BlockPos gate, List<ServerPlayer> party, int startFloor) {
		int slot = nextSlot++;
		List<UUID> ids = new ArrayList<>();
		for (ServerPlayer p : party) {
			ids.add(p.getUUID());
		}
		DungeonRun run = new DungeonRun(slot, startFloor, ids, server.getTickCount());
		for (ServerPlayer p : party) {
			ReturnPoint point = new ReturnPoint(origin.dimension(), gate, p.getYRot());
			run.returns.put(p.getUUID(), point);
			PlayerProgress progress = p.getAttachedOrCreate(ModAttachments.PROGRESS);
			p.setAttached(ModAttachments.PROGRESS, progress.withExpedition().withReturnPoint(Optional.of(point)));
			playerRuns.put(p.getUUID(), slot);
		}
		runs.put(slot, run);
		origin.playSound(null, gate, ModSounds.GATE_TRAVEL, SoundSource.BLOCKS, 1.5F, 1.0F);
		origin.sendParticles(ParticleTypes.REVERSE_PORTAL, gate.getX() + 0.5, gate.getY() + 1.0, gate.getZ() + 0.5, 80, 1.2, 1.0, 1.2, 0.1);
		enterFloor(run, startFloor);
		setDirty();
		return run;
	}

	// ====================================================================== floors

	/** Moves the run (and every present member) to {@code floor}. */
	public void enterFloor(DungeonRun run, int floor) {
		ServerLevel dungeon = dungeon();
		if (dungeon == null) {
			return;
		}
		cleanupFloor(run, dungeon);
		run.floorState = new FloorState(floor);
		FloorLayout layout = layout(run);
		BlockPos spawn = layout.spawnPos();
		dungeon.getChunkSource().addTicketWithRadius(ModWorldgen.ARRIVAL, new ChunkPos(spawn), 2);
		dungeon.getChunk(spawn); // generates synchronously if the prefetch hasn't finished yet

		List<ServerPlayer> movers = new ArrayList<>();
		for (UUID uuid : run.active) {
			ServerPlayer p = server.getPlayerList().getPlayer(uuid);
			if (p != null && p.isAlive()) {
				movers.add(p);
			}
		}
		Zone zone = Zone.forFloor(floor);
		for (int i = 0; i < movers.size(); i++) {
			ServerPlayer p = movers.get(i);
			double angle = i / (double) Math.max(1, movers.size()) * Math.PI * 2;
			double offset = movers.size() > 1 ? FloorLayout.ARRIVAL_RADIUS : 0.0;
			Vec3 target = new Vec3(spawn.getX() + 0.5 + Math.cos(angle) * offset, spawn.getY(), spawn.getZ() + 0.5 + Math.sin(angle) * offset);
			teleport(p, dungeon, target, 180.0F);
			p.fallDistance = 0;
			Messages.title(p, Component.translatable("message.abyssal_descent.floor_title", floor).withStyle(ChatFormatting.BOLD),
				zone.displayName().copy().withStyle(zone.chatColor()), 15, 60, 25);
			Messages.privateSound(p, ModSounds.FLOOR_ENTER, 1.0F, 1.0F);
			p.setAttached(ModAttachments.PROGRESS, p.getAttachedOrCreate(ModAttachments.PROGRESS).withDeepest(floor));
			if (floor == zone.firstFloor()) {
				p.sendSystemMessage(Component.empty().append(zone.displayName().copy().withStyle(zone.chatColor(), ChatFormatting.BOLD))
					.append(Component.literal(" — ").withStyle(ChatFormatting.DARK_GRAY)).append(zone.tagline().copy().withStyle(ChatFormatting.GRAY,
						ChatFormatting.ITALIC)));
			}
		}
		spawnFloorResidents(run, layout, dungeon);
		int next = floor + 1;
		if (isReachableFloor(run.slot, next)) {
			FloorLayout nextLayout = FloorLayouts.get(server.getWorldData().worldGenOptions().seed(), run.slot, next);
			dungeon.getChunkSource().addTicketWithRadius(ModWorldgen.PREFETCH, new ChunkPos(nextLayout.spawnPos()), 2);
		}
		updateHud(run);
		setDirty();
	}

	private void spawnFloorResidents(DungeonRun run, FloorLayout layout, ServerLevel level) {
		FloorState fs = run.floorState;
		for (Room room : layout.rooms()) {
			Fixture merchantSpot = room.firstFixture(Fixture.Type.MERCHANT);
			if (merchantSpot != null && !fs.merchantSpawned) {
				level.getChunk(merchantSpot.pos());
				DelverMerchant merchant = ModEntities.DELVER_MERCHANT.create(level, EntitySpawnReason.EVENT);
				if (merchant != null) {
					BlockPos p = merchantSpot.pos();
					merchant.snapTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, 180.0F, 0.0F);
					merchant.setup(run.id(), run.floor());
					level.addFreshEntity(merchant);
					fs.floorEntities.add(merchant.getUUID());
					fs.merchantSpawned = true;
				}
			}
		}
	}

	/** Removes seals and floor-bound entities (merchant, boss, encounter enemies) of the run's current floor. */
	private void cleanupFloor(DungeonRun run, ServerLevel level) {
		FloorState fs = run.floorState;
		EncounterDirector.unseal(level, fs, false);
		EncounterDirector.unseal(level, fs.bossSeals, false);
		if (fs.encounter != null) {
			for (UUID id : fs.encounter.mobs) {
				discard(level, id);
			}
			fs.encounter = null;
		}
		for (UUID id : fs.floorEntities) {
			discard(level, id);
		}
		fs.floorEntities.clear();
		if (fs.bossEntity != null) {
			discard(level, fs.bossEntity);
		}
	}

	private static void discard(ServerLevel level, UUID id) {
		Entity entity = level.getEntity(id);
		if (entity != null) {
			entity.discard();
		}
	}

	private void descend(DungeonRun run) {
		int next = run.floor() + 1;
		if (!isReachableFloor(run.slot, next)) {
			Messages.chat(presentMembers(run), Component.translatable("message.abyssal_descent.sealed_below", Zone.forFloor(next).displayName())
				.withStyle(ChatFormatting.DARK_PURPLE));
			return;
		}
		for (ServerPlayer p : presentMembers(run)) {
			Messages.privateSound(p, ModSounds.DESCEND, 1.0F, 1.0F);
		}
		enterFloor(run, next);
	}

	// ====================================================================== ticking

	public void tick() {
		tickAttunements();
		ServerLevel dungeon = dungeon();
		if (dungeon == null) {
			return;
		}
		long time = server.getTickCount();
		for (DungeonRun run : List.copyOf(runs.values())) {
			if (run.active.isEmpty()) {
				endRun(run);
				continue;
			}
			List<ServerPlayer> present = presentMembers(run);
			if (present.isEmpty()) {
				continue;
			}
			FloorLayout layout = layout(run);
			FloorState fs = run.floorState;
			if (fs.encounter == null && !fs.sealedBlocks.isEmpty()) {
				// Seals left behind by an encounter interrupted by a restart.
				EncounterDirector.unseal(dungeon, fs, false);
			}
			if (!(fs.bossStarted && !fs.bossDefeated) && !fs.bossSeals.isEmpty()) {
				// Arena seals left behind by a boss fight interrupted by a restart.
				EncounterDirector.unseal(dungeon, fs.bossSeals, false);
			}
			if (layout.isBossFloor()) {
				tickBoss(run, layout, dungeon, present);
			}
			if (fs.encounter == null && fs.activeTrial != null) {
				recoverTrial(run, layout, dungeon);
			}
			if (fs.encounter != null) {
				EncounterDirector.tick(this, run, layout, dungeon, present);
			}
			if (time % 10 == 0) {
				for (ServerPlayer p : present) {
					renewCurses(run, p);
					trackPosition(run, layout, dungeon, p, present);
				}
				tickDescent(run, layout, present);
			}
			if (time % 20 == 0) {
				updateHud(run);
			}
		}
	}

	private void trackPosition(DungeonRun run, FloorLayout layout, ServerLevel level, ServerPlayer player, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		if (!DungeonCoords.isInFloorBand(player.blockPosition(), run.slot, run.floor())) {
			// Somehow off the current floor (e.g. reconnected after the party descended): bring them along.
			teleport(player, level, Vec3.atBottomCenterOf(layout.spawnPos()), 180.0F);
			return;
		}
		Room room = roomContaining(layout, player.position());
		if (room == null) {
			return;
		}
		int inset = insetOf(room, player.position());
		switch (room.type()) {
			case COMBAT, ELITE -> {
				if (fs.phase(room.id()) == RoomPhase.UNVISITED && fs.encounter == null && inset >= 2) {
					EncounterDirector.start(this, run, layout, level, room,
						room.type() == RoomType.ELITE ? Encounter.Kind.ELITE : Encounter.Kind.ROOM, null, present);
				}
			}
			case EXIT -> {
				if (fs.phase(room.id()) == RoomPhase.UNVISITED) {
					fs.setPhase(room.id(), RoomPhase.CLEARED);
					Messages.actionBar(present, Component.translatable("message.abyssal_descent.exit_found").withStyle(ChatFormatting.LIGHT_PURPLE));
				}
			}
			case ANTECHAMBER -> {
				if (fs.bossEntity == null && !fs.bossDefeated) {
					prepareBoss(run, layout, level);
				}
			}
			case BOSS_ARENA -> {
				if (fs.bossEntity == null && !fs.bossDefeated) {
					prepareBoss(run, layout, level);
				}
				if (!fs.bossStarted && !fs.bossDefeated && inset >= 3) {
					startBoss(run, layout, level, room, present);
				}
			}
			default -> {
				if (fs.phase(room.id()) == RoomPhase.UNVISITED && !room.type().countsForProgress()) {
					fs.setPhase(room.id(), RoomPhase.CLEARED);
				}
			}
		}
	}

	@Nullable
	static Room roomContaining(FloorLayout layout, Vec3 pos) {
		for (Room room : layout.rooms()) {
			var in = room.interior();
			if (pos.x >= in.minX() && pos.x < in.maxX() + 1 && pos.z >= in.minZ() && pos.z < in.maxZ() + 1 && pos.y >= in.minY() - 4
				&& pos.y <= in.maxY() + 1) {
				return room;
			}
		}
		return null;
	}

	static int insetOf(Room room, Vec3 pos) {
		var in = room.interior();
		double dx = Math.min(pos.x - in.minX(), in.maxX() + 1 - pos.x);
		double dz = Math.min(pos.z - in.minZ(), in.maxZ() + 1 - pos.z);
		return (int) Math.floor(Math.min(dx, dz));
	}

	private void tickDescent(DungeonRun run, FloorLayout layout, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		BlockPos rift = riftPos(run, layout);
		if (rift == null || fs.encounter != null) {
			fs.descentCountdown = 0;
			return;
		}
		boolean all = !present.isEmpty();
		for (ServerPlayer p : present) {
			if (Math.abs(p.getX() - (rift.getX() + 0.5)) > 1.7 || Math.abs(p.getZ() - (rift.getZ() + 0.5)) > 1.7
				|| Math.abs(p.getY() - (rift.getY() + 1)) > 1.6) {
				all = false;
				break;
			}
		}
		if (!all) {
			if (fs.descentCountdown > 0) {
				fs.descentCountdown = 0;
				Messages.actionBar(present, Component.translatable("message.abyssal_descent.descent_interrupted").withStyle(ChatFormatting.GRAY));
			}
			return;
		}
		if (!FloorLayouts.isGeneratedFloor(run.slot, run.floor() + 1)) {
			Messages.actionBar(present, Component.translatable("message.abyssal_descent.sealed_below", Zone.forFloor(run.floor() + 1).displayName())
				.withStyle(ChatFormatting.DARK_PURPLE));
			return;
		}
		// The floors below exist but the server's maxFloor rule stops expeditions here: the rift leads home instead.
		boolean home = !isReachableFloor(run.slot, run.floor() + 1);
		if (home && layout.isBossFloor()) {
			// No rift was opened behind the boss (see spawnBossReward); its waystone is the way home.
			return;
		}
		if (fs.descentCountdown == 0) {
			fs.descentCountdown = DESCENT_TICKS;
		} else {
			fs.descentCountdown -= 10;
		}
		ServerLevel level = dungeon();
		if (level != null) {
			level.sendParticles(ModParticles.RIFT_MOTE, rift.getX() + 0.5, rift.getY() + 1.2, rift.getZ() + 0.5, 30, 1.2, 0.6, 1.2, 0.05);
			level.playSound(null, rift, ModSounds.GATE_ATTUNE, SoundSource.BLOCKS, 0.6F, 1.6F - fs.descentCountdown / 100.0F);
		}
		if (fs.descentCountdown <= 0) {
			if (home) {
				for (ServerPlayer p : present) {
					extract(p, run);
				}
			} else {
				descend(run);
			}
		} else {
			Messages.actionBar(present, Component.translatable(home ? "message.abyssal_descent.rift_home" : "message.abyssal_descent.descending",
				(fs.descentCountdown + 19) / 20).withStyle(ChatFormatting.LIGHT_PURPLE));
		}
	}

	@Nullable
	private BlockPos riftPos(DungeonRun run, FloorLayout layout) {
		if (layout.isBossFloor()) {
			if (!run.floorState.rewardSpawned) {
				return null;
			}
			Room arena = layout.room(layout.arenaRooms().get(layout.arenaRooms().size() - 1));
			Fixture reward = arena.firstFixture(Fixture.Type.BOSS_REWARD);
			return reward == null ? null : reward.pos();
		}
		Fixture rift = layout.exitRoom().firstFixture(Fixture.Type.RIFT);
		return rift == null ? null : rift.pos();
	}

	// ====================================================================== bosses

	private void prepareBoss(DungeonRun run, FloorLayout layout, ServerLevel level) {
		FloorState fs = run.floorState;
		Room arena = layout.room(layout.arenaRooms().get(0));
		Fixture spawn = arena.firstFixture(Fixture.Type.BOSS_SPAWN);
		if (spawn == null) {
			return;
		}
		Mob boss = ModEntities.bossFor(run.floor()).create(level, EntitySpawnReason.EVENT);
		if (boss == null) {
			return;
		}
		level.getChunk(spawn.pos());
		boss.snapTo(spawn.pos().getX() + 0.5, spawn.pos().getY(), spawn.pos().getZ() + 0.5, 0.0F, 0.0F);
		boss.setYHeadRot(0.0F);
		if (boss instanceof DungeonBoss dungeonBoss) {
			List<BlockPos> minions = new ArrayList<>();
			for (Fixture f : arena.fixtures()) {
				if (f.type() == Fixture.Type.MINION_SPAWN) {
					minions.add(f.pos());
				}
			}
			dungeonBoss.configureArena(run.slot, run.floor(), arena.interior(), minions);
		}
		level.addFreshEntity(boss);
		fs.bossEntity = boss.getUUID();
		setDirty();
	}

	private void startBoss(DungeonRun run, FloorLayout layout, ServerLevel level, Room arena, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		if (fs.bossEntity == null) {
			prepareBoss(run, layout, level);
		}
		Entity entity = fs.bossEntity == null ? null : level.getEntity(fs.bossEntity);
		if (!(entity instanceof DungeonBoss boss) || !entity.isAlive()) {
			// Not loaded yet, or already slain and finishing its death sequence (e.g. one saved mid-sequence).
			return;
		}
		List<ServerPlayer> pull = EncounterDirector.notSealedIn(fs, layout, present);
		fs.bossStarted = true;
		fs.bossVacantTicks = 0;
		EncounterDirector.seal(level, fs.bossSeals, arena);
		EncounterDirector.pullIn(level, arena, pull, 28);
		// Health scales with those who made it in, not with members exploring elsewhere who are now sealed out.
		int fighters = 0;
		for (ServerPlayer p : present) {
			if (EncounterDirector.isInside(arena, p)) {
				fighters++;
			}
		}
		boss.beginEncounter(Math.max(1, fighters));
		setDirty();
	}

	/**
	 * Watches a boss fight under way. A fight nobody is left in (everyone inside fell, fled or disconnected) is called off
	 * so members outside are not sealed out for good, and so is one whose boss was reloaded from disk (its chunk unloaded
	 * mid-fight), which puts it back on its throne: like after a restart, the fight starts over.
	 */
	private void tickBoss(DungeonRun run, FloorLayout layout, ServerLevel level, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		if (!fs.bossStarted || fs.bossDefeated) {
			fs.bossVacantTicks = 0;
			return;
		}
		Entity entity = fs.bossEntity == null ? null : level.getEntity(fs.bossEntity);
		if (entity instanceof DungeonBossEntity boss) {
			if (boss.isDeadOrDying()) {
				// Slain: its death sequence ends the fight, whoever is left to see it.
				fs.bossVacantTicks = 0;
				return;
			}
			if (boss.dormant()) {
				abortBoss(run, level, boss);
				return;
			}
		}
		for (int id : layout.arenaRooms()) {
			Room arena = layout.room(id);
			for (ServerPlayer p : present) {
				if (EncounterDirector.isInside(arena, p)) {
					fs.bossVacantTicks = 0;
					return;
				}
			}
		}
		if (++fs.bossVacantTicks > 40) {
			abortBoss(run, level, entity instanceof DungeonBossEntity boss ? boss : null);
		}
	}

	/**
	 * Calls a boss fight off: the arena opens and the boss returns to its throne at full health (if its chunk is not
	 * loaded, it does so itself when it loads). The next delver to cross the threshold starts the fight again.
	 */
	private void abortBoss(DungeonRun run, ServerLevel level, @Nullable DungeonBossEntity boss) {
		FloorState fs = run.floorState;
		fs.bossStarted = false;
		fs.bossVacantTicks = 0;
		EncounterDirector.unseal(level, fs.bossSeals, true);
		if (boss != null) {
			boss.resetEncounter();
		}
		Messages.chat(presentMembers(run), Component.translatable("message.abyssal_descent.boss_reset").withStyle(ChatFormatting.GRAY));
		updateHud(run);
		setDirty();
	}

	/** Called by a boss when its death sequence has finished. */
	public void onBossDefeated(int slot, int floor, Vec3 where) {
		DungeonRun run = runs.get(slot);
		ServerLevel level = dungeon();
		if (run == null || level == null || run.floor() != floor) {
			return;
		}
		FloorState fs = run.floorState;
		if (fs.bossDefeated) {
			return;
		}
		fs.bossDefeated = true;
		fs.bossEntity = null;
		// Only the arena opens: a room encounter elsewhere on the floor stays sealed until it is cleared.
		EncounterDirector.unseal(level, fs.bossSeals, true);
		FloorLayout layout = layout(run);
		Room arena = layout.room(layout.arenaRooms().get(layout.arenaRooms().size() - 1));
		Fixture reward = arena.firstFixture(Fixture.Type.BOSS_REWARD);
		List<ServerPlayer> present = presentMembers(run);
		if (reward != null) {
			spawnBossReward(run, level, reward.pos(), arena);
		}
		boolean zoneCleared = Zone.isBossFloor(floor);
		for (ServerPlayer p : present) {
			PlayerProgress progress = p.getAttachedOrCreate(ModAttachments.PROGRESS).withBossSlain();
			if (zoneCleared && floor + 1 <= Zone.MAX_FLOOR) {
				boolean had = progress.hasCheckpoint(floor + 1);
				progress = progress.withCheckpoint(floor + 1);
				if (!had) {
					p.sendSystemMessage(Component.translatable("message.abyssal_descent.checkpoint_unlocked", floor + 1,
						Zone.forFloor(floor + 1).displayName()).withStyle(ChatFormatting.GOLD));
				}
			}
			p.setAttached(ModAttachments.PROGRESS, progress);
		}
		updateHud(run);
		setDirty();
	}

	private void spawnBossReward(DungeonRun run, ServerLevel level, BlockPos center, Room arena) {
		FloorState fs = run.floorState;
		fs.rewardSpawned = true;
		boolean deeper = isReachableFloor(run.slot, run.floor() + 1);
		if (deeper) {
			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					level.setBlock(center.offset(dx, 0, dz), ModBlocks.DESCENT_RIFT.defaultBlockState(), Block.UPDATE_ALL);
				}
			}
		}
		// Waystone behind the rift, reliquary in front of it.
		BlockPos stone = center.offset(0, 1, -3);
		BlockState lower = ModBlocks.WAYSTONE.defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.SOUTH)
			.setValue(WaystoneBlock.HALF, DoubleBlockHalf.LOWER);
		level.setBlock(stone, lower, Block.UPDATE_ALL);
		level.setBlock(stone.above(), lower.setValue(WaystoneBlock.HALF, DoubleBlockHalf.UPPER), Block.UPDATE_ALL);
		BlockPos chest = center.offset(0, 1, 3);
		level.setBlock(chest, ModBlocks.RELIQUARY.defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.SOUTH), Block.UPDATE_ALL);
		if (level.getBlockEntity(chest) instanceof ReliquaryBlockEntity reliquary) {
			reliquary.setup(LootTier.BOSS, run.floor());
		}
		level.sendParticles(ModParticles.RIFT_MOTE, center.getX() + 0.5, center.getY() + 1.5, center.getZ() + 0.5, 120, 2.5, 1.5, 2.5, 0.08);
		level.playSound(null, center, ModSounds.GATE_TRAVEL, SoundSource.BLOCKS, 2.0F, 0.8F);
		List<ServerPlayer> present = presentMembers(run);
		Messages.chat(present, Component.translatable(deeper ? "message.abyssal_descent.boss_reward" : "message.abyssal_descent.boss_reward_sealed",
			Zone.forFloor(run.floor() + 1).displayName()).withStyle(ChatFormatting.AQUA));
	}

	// ====================================================================== extraction & defeat

	public void useWaystone(ServerPlayer player) {
		DungeonRun run = runOf(player);
		if (run == null) {
			player.displayClientMessage(Component.translatable("message.abyssal_descent.waystone.idle"), true);
			return;
		}
		ConfirmStep step = confirmStep(extractConfirm, player);
		if (step == ConfirmStep.PROMPT) {
			int unsecured = Unsecured.countUnsecured(player);
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.waystone.confirm", unsecured).withStyle(ChatFormatting.AQUA));
		} else if (step == ConfirmStep.CONFIRMED) {
			extract(player, run);
		}
	}

	/**
	 * Two-step confirmation for the waystone and the Cursed Idol. A use confirms only within {@link #CONFIRM_WINDOW} of
	 * the prompt and after a pause since the previous use, i.e. the use key was released and pressed again.
	 */
	private ConfirmStep confirmStep(Map<UUID, Confirm> prompts, ServerPlayer player) {
		long now = server.getTickCount();
		Confirm confirm = prompts.get(player.getUUID());
		if (confirm == null || now - confirm.prompted > CONFIRM_WINDOW) {
			prompts.put(player.getUUID(), new Confirm(now));
			return ConfirmStep.PROMPT;
		}
		long gap = now - confirm.lastUse;
		confirm.lastUse = now;
		if (gap < CONFIRM_MIN_GAP) {
			return ConfirmStep.HELD;
		}
		prompts.remove(player.getUUID());
		return ConfirmStep.CONFIRMED;
	}

	/**
	 * Closes the player's open menu so what it holds outside the inventory (merchant payment slots and the like) goes
	 * back into the inventory before loot is secured or purged. The player must be alive, or the menu drops it instead.
	 */
	private static void closeMenu(ServerPlayer player) {
		if (player.hasContainerOpen()) {
			player.closeContainer();
		}
	}

	public void extract(ServerPlayer player, DungeonRun run) {
		closeMenu(player);
		int secured = Unsecured.secureAll(player);
		clearCurses(player);
		PlayerProgress progress = player.getAttachedOrCreate(ModAttachments.PROGRESS).withExtraction();
		player.setAttached(ModAttachments.PROGRESS, progress);
		leaveRun(player, run);
		Messages.title(player, Component.translatable("message.abyssal_descent.extracted").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD),
			Component.translatable("message.abyssal_descent.extracted.sub", secured).withStyle(ChatFormatting.GRAY), 10, 70, 30);
		Messages.privateSound(player, ModSounds.EXTRACT, 1.0F, 1.0F);
		for (ServerPlayer other : presentMembers(run)) {
			other.sendSystemMessage(Component.translatable("message.abyssal_descent.party_extracted", player.getDisplayName()).withStyle(ChatFormatting.AQUA));
		}
	}

	/**
	 * Lethal damage inside an expedition: the player is expelled instead of dying. Unsecured loot is lost and carried gear
	 * pays the Death's Toll.
	 */
	public void defeat(ServerPlayer player, DamageSource source) {
		DungeonRun run = runOf(player);
		if (run == null) {
			return;
		}
		AdConfig.Rules rules = AdConfig.get().rules;
		// Back on their feet before the open menu closes: at zero health it would drop its items on the floor.
		player.setHealth(player.getMaxHealth());
		closeMenu(player);
		int lost = rules.loseUnsecuredLootOnDeath ? Unsecured.purgeAll(player) : 0;
		if (rules.deathDurabilityToll > 0) {
			for (EquipmentSlot slot : EquipmentSlot.values()) {
				if (slot.getType() != EquipmentSlot.Type.HAND && slot.getType() != EquipmentSlot.Type.HUMANOID_ARMOR) {
					continue;
				}
				ItemStack stack = player.getItemBySlot(slot);
				if (stack.isDamageableItem()) {
					int toll = (int) Math.ceil(stack.getMaxDamage() * rules.deathDurabilityToll);
					stack.setDamageValue(Math.min(stack.getMaxDamage() - 1, stack.getDamageValue() + toll));
				}
			}
		}
		player.removeAllEffects();
		player.clearFire();
		player.setAirSupply(player.getMaxAirSupply());
		player.fallDistance = 0;
		int floor = run.floor();
		PlayerProgress progress = player.getAttachedOrCreate(ModAttachments.PROGRESS).withDefeat();
		player.setAttached(ModAttachments.PROGRESS, progress);
		leaveRun(player, run);
		player.invulnerableTime = 60;
		Messages.title(player, Component.translatable("message.abyssal_descent.defeated").withStyle(ChatFormatting.DARK_RED, ChatFormatting.BOLD),
			Component.translatable("message.abyssal_descent.defeated.sub", floor, lost).withStyle(ChatFormatting.GRAY), 10, 80, 30);
		Messages.privateSound(player, ModSounds.DEFEAT, 1.0F, 1.0F);
		Component deathMessage = source.getLocalizedDeathMessage(player);
		player.sendSystemMessage(Component.translatable("message.abyssal_descent.defeated.cause", deathMessage).withStyle(ChatFormatting.GRAY));
		for (ServerPlayer other : presentMembers(run)) {
			other.sendSystemMessage(Component.translatable("message.abyssal_descent.party_fallen", player.getDisplayName(), floor)
				.withStyle(ChatFormatting.RED));
		}
	}

	/** The player left the dungeon by other means (commands, a vanilla death): unsecured loot is purged. */
	public void abandon(ServerPlayer player) {
		DungeonRun run = runOf(player);
		if (player.isAlive()) {
			closeMenu(player);
		}
		Unsecured.purgeAll(player);
		clearCurses(player);
		if (run != null) {
			run.active.remove(player.getUUID());
			run.curses.remove(player.getUUID());
			playerRuns.remove(player.getUUID());
			player.setAttached(ModAttachments.HUD, RunHud.NONE);
			setDirty();
		}
	}

	private void leaveRun(ServerPlayer player, DungeonRun run) {
		run.active.remove(player.getUUID());
		run.curses.remove(player.getUUID());
		playerRuns.remove(player.getUUID());
		returnPlayer(player, run.returns.get(player.getUUID()));
		player.setAttached(ModAttachments.HUD, RunHud.NONE);
		if (run.active.isEmpty()) {
			endRun(run);
		} else {
			updateHud(run);
		}
		setDirty();
	}

	public void returnPlayer(ServerPlayer player, @Nullable ReturnPoint point) {
		if (point == null) {
			point = player.getAttachedOrCreate(ModAttachments.PROGRESS).returnPoint().orElse(null);
		}
		ServerLevel target = point == null ? null : server.getLevel(point.dimension());
		Vec3 pos;
		float yaw;
		if (target == null || point == null) {
			target = server.overworld();
			BlockPos spawn = target.getRespawnData().pos();
			pos = Vec3.atBottomCenterOf(target.getHeightmapPos(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, spawn));
			yaw = 0;
		} else {
			pos = safeSpotNear(target, point.pos());
			yaw = point.yaw();
		}
		teleport(player, target, pos, yaw);
		player.setAttached(ModAttachments.PROGRESS, player.getAttachedOrCreate(ModAttachments.PROGRESS).withReturnPoint(Optional.empty()));
	}

	/** A standable spot next to the gate (or on top of it). */
	private static Vec3 safeSpotNear(ServerLevel level, BlockPos gate) {
		level.getChunk(gate);
		for (Direction d : Direction.Plane.HORIZONTAL) {
			BlockPos p = gate.relative(d);
			if (level.getBlockState(p).getCollisionShape(level, p).isEmpty() && level.getBlockState(p.above()).getCollisionShape(level, p.above()).isEmpty()
				&& !level.getBlockState(p.below()).getCollisionShape(level, p.below()).isEmpty()) {
				return Vec3.atBottomCenterOf(p);
			}
		}
		return Vec3.atBottomCenterOf(gate.above());
	}

	private void teleport(ServerPlayer player, ServerLevel level, Vec3 pos, float yaw) {
		authorizedTransfers.add(player.getUUID());
		try {
			player.teleport(new TeleportTransition(level, pos, Vec3.ZERO, yaw, 0.0F, TeleportTransition.DO_NOTHING));
		} finally {
			authorizedTransfers.remove(player.getUUID());
		}
	}

	public void endRun(DungeonRun run) {
		ServerLevel level = dungeon();
		if (level != null) {
			cleanupFloor(run, level);
		}
		for (UUID member : run.active) {
			playerRuns.remove(member);
		}
		runs.remove(run.slot);
		setDirty();
	}

	private static void clearCurses(ServerPlayer player) {
		for (Holder<MobEffect> curse : ModEffects.CURSES) {
			player.removeEffect(curse);
		}
	}

	private static MobEffectInstance curseInstance(Holder<MobEffect> curse) {
		return new MobEffectInstance(curse, MobEffectInstance.INFINITE_DURATION, 0, false, true, true);
	}

	/** An idol's curse lasts until the player leaves the depths: put back any that milk, a totem or a command cleared. */
	private static void renewCurses(DungeonRun run, ServerPlayer player) {
		Set<Holder<MobEffect>> curses = run.curses.get(player.getUUID());
		if (curses == null) {
			return;
		}
		for (Holder<MobEffect> curse : curses) {
			if (!player.hasEffect(curse)) {
				player.addEffect(curseInstance(curse));
			}
		}
	}

	// ====================================================================== shrines

	public boolean useAltarOfTrials(ServerPlayer player, BlockPos pos) {
		DungeonRun run = runOf(player);
		ServerLevel level = dungeon();
		if (run == null || level == null || player.level() != level) {
			player.displayClientMessage(Component.translatable("message.abyssal_descent.shrine.inert"), true);
			return false;
		}
		FloorState fs = run.floorState;
		if (fs.encounter != null) {
			player.displayClientMessage(Component.translatable("message.abyssal_descent.shrine.busy"), true);
			return false;
		}
		FloorLayout layout = layout(run);
		Room room = layout.roomAt(pos);
		if (room == null) {
			return false;
		}
		if (fs.activeTrial != null) {
			// A trial interrupted by a restart that has not been tidied up yet (its room is far away): free its altar now.
			EncounterDirector.resetAltar(level, fs, BlockPos.of(fs.activeTrial));
		}
		fs.usedShrines.add(pos.asLong());
		fs.activeTrial = pos.asLong();
		level.playSound(null, pos, ModSounds.TRIAL_BEGIN, SoundSource.BLOCKS, 1.5F, 1.0F);
		Messages.chat(presentMembers(run), Component.translatable("message.abyssal_descent.trial.begin", player.getDisplayName())
			.withStyle(ChatFormatting.RED));
		EncounterDirector.start(this, run, layout, level, room, Encounter.Kind.TRIAL, pos, presentMembers(run));
		setDirty();
		return true;
	}

	/**
	 * A trial interrupted by a restart starts over like any other encounter: once its room's enemies have loaded, the
	 * leftovers are cleared and the altar can be used again.
	 */
	private void recoverTrial(DungeonRun run, FloorLayout layout, ServerLevel level) {
		FloorState fs = run.floorState;
		BlockPos altar = BlockPos.of(fs.activeTrial);
		Room room = layout.roomAt(altar);
		if (room != null) {
			var in = room.interior();
			for (int cx = SectionPos.blockToSectionCoord(in.minX() - 1); cx <= SectionPos.blockToSectionCoord(in.maxX() + 1); cx++) {
				for (int cz = SectionPos.blockToSectionCoord(in.minZ() - 1); cz <= SectionPos.blockToSectionCoord(in.maxZ() + 1); cz++) {
					if (!level.areEntitiesLoaded(ChunkPos.asLong(cx, cz))) {
						return;
					}
				}
			}
			EncounterDirector.discardLeftovers(level, room);
		}
		EncounterDirector.resetAltar(level, fs, altar);
		setDirty();
	}

	public boolean useCursedIdol(ServerPlayer player, BlockPos pos) {
		DungeonRun run = runOf(player);
		ServerLevel level = dungeon();
		if (run == null || level == null || player.level() != level) {
			player.displayClientMessage(Component.translatable("message.abyssal_descent.shrine.inert"), true);
			return false;
		}
		ConfirmStep step = confirmStep(idolConfirm, player);
		if (step != ConfirmStep.CONFIRMED) {
			if (step == ConfirmStep.PROMPT) {
				player.sendSystemMessage(Component.translatable("message.abyssal_descent.idol.offer").withStyle(ChatFormatting.DARK_PURPLE));
			}
			return false;
		}
		Holder<MobEffect> curse = ModEffects.CURSES.get(level.random.nextInt(ModEffects.CURSES.size()));
		run.curses.computeIfAbsent(player.getUUID(), id -> new LinkedHashSet<>()).add(curse);
		player.addEffect(curseInstance(curse));
		List<ItemStack> gift = LootRoller.rollCursedGift(player, run.floor());
		LootDrops.fountain(level, Vec3.atCenterOf(pos).add(0, 0.8, 0), gift, player);
		level.playSound(null, pos, ModSounds.CURSE_ACCEPT, SoundSource.BLOCKS, 1.3F, 0.9F);
		level.sendParticles(ModParticles.CURSE_MOTE, player.getX(), player.getY() + 1, player.getZ(), 40, 0.5, 0.8, 0.5, 0.05);
		player.sendSystemMessage(Component.translatable("message.abyssal_descent.idol.accepted", curse.value().getDisplayName())
			.withStyle(ChatFormatting.DARK_PURPLE));
		run.floorState.usedShrines.add(pos.asLong());
		setDirty();
		return true;
	}

	// ====================================================================== HUD

	public void updateHud(DungeonRun run) {
		FloorLayout layout = layout(run);
		FloorState fs = run.floorState;
		int total = 0;
		int cleared = 0;
		boolean exitFound = false;
		for (Room room : layout.rooms()) {
			if (room.type().isEncounter()) {
				total++;
				if (fs.phase(room.id()) == RoomPhase.CLEARED) {
					cleared++;
				}
			}
			if (room.type() == RoomType.EXIT && fs.phase(room.id()) == RoomPhase.CLEARED) {
				exitFound = true;
			}
		}
		RunHud.Objective objective;
		if (fs.encounter != null) {
			objective = RunHud.Objective.CLEAR_ROOM;
		} else if (layout.isBossFloor()) {
			objective = fs.bossDefeated ? (isReachableFloor(run.slot, run.floor() + 1) ? RunHud.Objective.DESCEND : RunHud.Objective.EXTRACT)
				: RunHud.Objective.BOSS;
		} else {
			objective = fs.descentCountdown > 0 || exitFound ? RunHud.Objective.DESCEND : RunHud.Objective.EXPLORE;
		}
		List<ServerPlayer> present = presentMembers(run);
		for (ServerPlayer p : present) {
			p.setAttached(ModAttachments.HUD, new RunHud(run.floor(), cleared, total, objective.ordinal(), Unsecured.countUnsecured(p),
				fs.descentCountdown, run.active.size()));
		}
	}

	// ====================================================================== player lifecycle

	/** Called when a player joins the server. */
	public void onJoin(ServerPlayer player) {
		DungeonRun run = runOf(player);
		if (DungeonDimension.isDungeon(player.level())) {
			if (run == null) {
				// The expedition ended (or was lost) while they were away.
				abandon(player);
				returnPlayer(player, null);
				player.sendSystemMessage(Component.translatable("message.abyssal_descent.run_lost").withStyle(ChatFormatting.GRAY));
			} else {
				updateHud(run);
			}
		} else {
			if (run != null) {
				abandon(player);
			} else if (Unsecured.countUnsecured(player) > 0 && !player.isCreative()) {
				Unsecured.purgeAll(player);
			}
			player.setAttached(ModAttachments.HUD, RunHud.NONE);
		}
	}

	/** Called when a player leaves the dungeon without an authorised transfer. */
	public void onUnauthorisedExit(ServerPlayer player) {
		if (runOf(player) != null) {
			abandon(player);
			player.sendSystemMessage(Component.translatable("message.abyssal_descent.abandoned").withStyle(ChatFormatting.GRAY));
		}
	}

	static List<ServerPlayer> playersNear(ServerLevel level, BlockPos pos, double radius) {
		List<ServerPlayer> list = new ArrayList<>();
		AABB box = new AABB(pos).inflate(radius);
		for (ServerPlayer p : level.players()) {
			if (box.contains(p.position()) && p.position().distanceTo(Vec3.atCenterOf(pos)) <= radius) {
				list.add(p);
			}
		}
		return list;
	}

	@Override
	public boolean isDirty() {
		return super.isDirty();
	}

	/** Reliquary rewards and boss loot use the room's centre when nothing better is available. */
	static BlockPos doorInside(Doorway door, int floorY) {
		Direction in = door.facing().getOpposite();
		return new BlockPos(door.x() + in.getStepX() * 2, floorY, door.z() + in.getStepZ() * 2);
	}

	public static boolean isSeal(BlockState state) {
		return state.getBlock() instanceof RunicSealBlock;
	}
}
