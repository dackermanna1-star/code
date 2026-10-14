package net.abyssaldescent.dungeon.run;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import net.abyssaldescent.block.AltarOfTrialsBlock;
import net.abyssaldescent.block.ReliquaryBlockEntity;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.encounter.EnemyKind;
import net.abyssaldescent.dungeon.encounter.WaveBuilder;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.entity.DungeonMobs;
import net.abyssaldescent.entity.MobInfo;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Runs room encounters: sealing, wave composition and summoning, completion and rewards. */
public final class EncounterDirector {
	private static final int SUMMON_TICKS = 30;
	private static final int INTERLUDE_TICKS = 50;

	private EncounterDirector() {
	}

	public static void start(RunManager manager, DungeonRun run, FloorLayout layout, ServerLevel level, Room room, Encounter.Kind kind,
		@Nullable BlockPos anchor, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		if (fs.encounter != null) {
			return;
		}
		fs.setPhase(room.id(), RoomPhase.ACTIVE);
		// Enemies left over from an encounter interrupted by a restart would otherwise double up.
		discardLeftovers(level, room);
		seal(level, fs, room);
		pullIn(level, room, notSealedIn(fs, layout, present), 14);
		int waves = WaveBuilder.waveCount(run.floor(), kind == Encounter.Kind.ELITE, kind == Encounter.Kind.TRIAL);
		Encounter encounter = new Encounter(kind, room.id(), waves, anchor);
		fs.encounter = encounter;
		queueWave(run, room, level, encounter, present);
		for (ServerPlayer p : present) {
			Messages.privateSound(p, ModSounds.ENCOUNTER_START, 1.0F, kind == Encounter.Kind.ROOM ? 1.0F : 0.8F);
		}
		Component label = switch (kind) {
			case ELITE -> Component.translatable("message.abyssal_descent.encounter.elite").withStyle(ChatFormatting.GOLD);
			case TRIAL -> Component.translatable("message.abyssal_descent.encounter.trial").withStyle(ChatFormatting.RED);
			default -> Component.translatable("message.abyssal_descent.encounter.sealed").withStyle(ChatFormatting.AQUA);
		};
		Messages.actionBar(present, label);
		manager.updateHud(run);
		manager.setDirty();
	}

	private static void queueWave(DungeonRun run, Room room, ServerLevel level, Encounter encounter, List<ServerPlayer> present) {
		RandomSource random = level.random;
		List<WaveBuilder.Spawn> spawns = WaveBuilder.build(run.floor(), Math.max(1, run.active.size()), encounter.wave,
			encounter.kind == Encounter.Kind.ELITE, encounter.kind == Encounter.Kind.TRIAL, random);
		List<BlockPos> positions = findSpawnPositions(level, room, present, spawns.size(), random);
		for (int i = 0; i < spawns.size() && i < positions.size(); i++) {
			WaveBuilder.Spawn spawn = spawns.get(i);
			BlockPos pos = positions.get(i);
			if (spawn.kind() == EnemyKind.WAILING_SKULL) {
				pos = pos.above(2);
			}
			encounter.queue(spawn.kind(), spawn.affix(), pos, SUMMON_TICKS + i * 5);
			level.playSound(null, pos, ModSounds.ENEMY_SUMMON, SoundSource.HOSTILE, 0.8F, 0.8F + random.nextFloat() * 0.4F);
		}
		if (encounter.wave > 0) {
			Messages.actionBar(present, Component.translatable("message.abyssal_descent.encounter.wave", encounter.wave + 1, encounter.waves)
				.withStyle(ChatFormatting.RED));
		}
	}

	public static void tick(RunManager manager, DungeonRun run, FloorLayout layout, ServerLevel level, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		Encounter encounter = fs.encounter;
		if (encounter == null) {
			return;
		}
		encounter.age++;
		Room room = layout.room(encounter.roomId);

		boolean anyoneInside = false;
		for (ServerPlayer p : present) {
			if (room.interior().toAabb().inflate(1, 4, 1).contains(p.position())) {
				anyoneInside = true;
				break;
			}
		}
		if (!anyoneInside && encounter.age > 40) {
			abort(manager, run, level, room);
			return;
		}

		Iterator<Encounter.Pending> it = encounter.pending.iterator();
		while (it.hasNext()) {
			Encounter.Pending pending = it.next();
			pending.ticks--;
			if (pending.ticks % 3 == 0) {
				summonCircle(level, pending.pos, pending.ticks, pending.affix != null);
			}
			if (pending.ticks <= 0) {
				it.remove();
				Mob mob = spawn(level, run, room, pending);
				if (mob != null) {
					encounter.mobs.add(mob.getUUID());
				}
			}
		}

		encounter.mobs.removeIf(id -> {
			Entity e = level.getEntity(id);
			return e == null || !e.isAlive();
		});

		if (encounter.mobs.isEmpty() && encounter.pending.isEmpty()) {
			if (encounter.wave + 1 < encounter.waves) {
				if (encounter.interlude == 0) {
					encounter.interlude = INTERLUDE_TICKS;
				} else if (--encounter.interlude == 0) {
					encounter.wave++;
					queueWave(run, room, level, encounter, present);
				}
			} else {
				clear(manager, run, level, room, encounter, present);
			}
		}
	}

	@Nullable
	private static Mob spawn(ServerLevel level, DungeonRun run, Room room, Encounter.Pending pending) {
		Mob mob = pending.kind.type().create(level, EntitySpawnReason.EVENT);
		if (mob == null) {
			return null;
		}
		Vec3 pos = Vec3.atBottomCenterOf(pending.pos);
		mob.snapTo(pos.x, pos.y, pos.z, level.random.nextFloat() * 360.0F, 0.0F);
		DungeonMobs.prepare(mob, new MobInfo(run.slot, room.id(), run.floor(), pending.affix == null ? -1 : pending.affix.ordinal()),
			Math.max(1, run.active.size()));
		ServerPlayer target = nearestPlayer(level, pos, run);
		if (target != null) {
			mob.setTarget(target);
			mob.lookAt(target, 360.0F, 360.0F);
		}
		level.addFreshEntity(mob);
		level.sendParticles(ModParticles.SOUL_EMBER, pos.x, pos.y + 0.8, pos.z, 18, 0.35, 0.6, 0.35, 0.04);
		level.sendParticles(ParticleTypes.LARGE_SMOKE, pos.x, pos.y + 0.3, pos.z, 6, 0.3, 0.1, 0.3, 0.01);
		return mob;
	}

	@Nullable
	private static ServerPlayer nearestPlayer(ServerLevel level, Vec3 pos, DungeonRun run) {
		ServerPlayer best = null;
		double bestDist = Double.MAX_VALUE;
		for (UUID id : run.active) {
			ServerPlayer p = level.getServer().getPlayerList().getPlayer(id);
			if (p != null && p.level() == level && !p.isSpectator()) {
				double d = p.position().distanceToSqr(pos);
				if (d < bestDist) {
					bestDist = d;
					best = p;
				}
			}
		}
		return best;
	}

	/** A shrinking ring of soul embers: the readable "something is coming out here" telegraph. */
	private static void summonCircle(ServerLevel level, BlockPos pos, int ticksLeft, boolean elite) {
		double progress = 1.0 - Math.max(0, ticksLeft) / (double) SUMMON_TICKS;
		double radius = 1.1 - progress * 0.7;
		int points = 10;
		double cx = pos.getX() + 0.5;
		double cz = pos.getZ() + 0.5;
		for (int i = 0; i < points; i++) {
			double angle = i / (double) points * Math.PI * 2 + progress * 3.0;
			level.sendParticles(ModParticles.SUMMON_SWIRL, cx + Math.cos(angle) * radius, pos.getY() + 0.1, cz + Math.sin(angle) * radius, 1, 0, 0.02,
				0, 0.0);
		}
		if (elite) {
			level.sendParticles(ParticleTypes.ENCHANTED_HIT, cx, pos.getY() + 0.6 + progress, cz, 2, 0.2, 0.3, 0.2, 0.0);
		}
	}

	private static void clear(RunManager manager, DungeonRun run, ServerLevel level, Room room, Encounter encounter, List<ServerPlayer> present) {
		FloorState fs = run.floorState;
		fs.setPhase(room.id(), RoomPhase.CLEARED);
		fs.encounter = null;
		fs.activeTrial = null;
		unseal(level, fs, true);
		for (ServerPlayer p : present) {
			Messages.privateSound(p, ModSounds.ROOM_CLEAR, 1.0F, 1.0F);
		}
		Messages.actionBar(present, Component.translatable("message.abyssal_descent.encounter.cleared").withStyle(ChatFormatting.GREEN));
		LootTier reward = switch (encounter.kind) {
			case ELITE, TRIAL -> LootTier.ELITE;
			default -> level.random.nextDouble() < AdConfig.get().loot.combatRoomRewardChance ? LootTier.CHEST : null;
		};
		if (reward != null) {
			BlockPos near = encounter.anchor != null ? encounter.anchor.relative(Direction.SOUTH, 2) : room.center();
			placeReliquary(level, room, near, reward, run.floor());
		}
		manager.updateHud(run);
		manager.setDirty();
	}

	private static void abort(RunManager manager, DungeonRun run, ServerLevel level, Room room) {
		FloorState fs = run.floorState;
		Encounter encounter = fs.encounter;
		if (encounter != null) {
			for (UUID id : encounter.mobs) {
				Entity e = level.getEntity(id);
				if (e != null) {
					e.discard();
				}
			}
			if (encounter.kind == Encounter.Kind.TRIAL && encounter.anchor != null) {
				// Like an abandoned combat room, an abandoned trial can be attempted again.
				resetAltar(level, fs, encounter.anchor);
			}
		}
		fs.encounter = null;
		fs.setPhase(room.id(), RoomPhase.UNVISITED);
		unseal(level, fs, false);
		manager.updateHud(run);
		manager.setDirty();
	}

	/** Makes the Altar of Trials at {@code pos} usable again after its trial was cut short (and forgets the trial). */
	static void resetAltar(ServerLevel level, FloorState fs, BlockPos pos) {
		BlockState state = level.getBlockState(pos);
		if (state.is(ModBlocks.ALTAR_OF_TRIALS) && state.getValue(AltarOfTrialsBlock.USED)) {
			level.setBlock(pos, state.setValue(AltarOfTrialsBlock.USED, false), Block.UPDATE_ALL);
		}
		fs.usedShrines.remove(pos.asLong());
		if (Long.valueOf(pos.asLong()).equals(fs.activeTrial)) {
			fs.activeTrial = null;
		}
	}

	/** Discards the enemies of an earlier encounter in {@code room} that are still around (e.g. after a restart). */
	static void discardLeftovers(ServerLevel level, Room room) {
		for (Mob stale : level.getEntitiesOfClass(Mob.class, room.interior().toAabb().inflate(1),
			m -> m.getAttached(ModAttachments.MOB_INFO) != null && m.getAttached(ModAttachments.MOB_INFO).roomId() == room.id())) {
			stale.discard();
		}
	}

	/** Places a reliquary at the closest free spot to {@code near}, with a burst of light. */
	public static void placeReliquary(ServerLevel level, Room room, BlockPos near, LootTier tier, int floor) {
		BlockPos spot = findFreeFloor(level, room, near);
		if (spot == null) {
			return;
		}
		level.setBlock(spot, ModBlocks.RELIQUARY.defaultBlockState().setValue(HorizontalDirectionalBlock.FACING, Direction.SOUTH), Block.UPDATE_ALL);
		if (level.getBlockEntity(spot) instanceof ReliquaryBlockEntity reliquary) {
			reliquary.setup(tier, floor);
		}
		level.sendParticles(ModParticles.LOOT_GLINT, spot.getX() + 0.5, spot.getY() + 0.8, spot.getZ() + 0.5, 30, 0.4, 0.5, 0.4, 0.05);
		level.sendParticles(ParticleTypes.END_ROD, spot.getX() + 0.5, spot.getY() + 1.0, spot.getZ() + 0.5, 12, 0.1, 0.8, 0.1, 0.02);
		level.playSound(null, spot, ModSounds.LOOT_RARE, SoundSource.BLOCKS, 0.8F, 1.2F);
	}

	@Nullable
	private static BlockPos findFreeFloor(ServerLevel level, Room room, BlockPos near) {
		Box in = room.interior();
		for (int r = 0; r <= 4; r++) {
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
						continue;
					}
					BlockPos p = new BlockPos(near.getX() + dx, in.minY(), near.getZ() + dz);
					if (!in.containsXZ(p.getX(), p.getZ()) || room.isInFrontOfDoor(p.getX(), p.getZ(), 2)) {
						continue;
					}
					BlockState here = level.getBlockState(p);
					if ((here.isAir() || here.canBeReplaced()) && level.getBlockState(p.above()).isAir()
						&& level.getBlockState(p.below()).isFaceSturdy(level, p.below(), Direction.UP)) {
						return p;
					}
				}
			}
		}
		return null;
	}

	// ====================================================================== seals

	/** Seals the doorways of an encounter room. */
	public static void seal(ServerLevel level, FloorState fs, Room room) {
		seal(level, fs.sealedBlocks, room);
	}

	/** Seals {@code room}'s doorways, recording the seal blocks in {@code seals} so that only its own fight opens them. */
	public static void seal(ServerLevel level, List<Long> seals, Room room) {
		BlockState seal = ModBlocks.RUNIC_SEAL.defaultBlockState();
		for (Doorway door : room.doorways()) {
			door.forEachOpeningBlock(room.floorY(), pos -> {
				BlockState state = level.getBlockState(pos);
				if (state.isAir()) {
					level.setBlock(pos, seal, Block.UPDATE_ALL);
				} else if (!RunManager.isSeal(state)) {
					return;
				}
				// A seal that is already there (one an earlier fight lost track of) is adopted so it opens with the rest.
				if (!seals.contains(pos.asLong())) {
					seals.add(pos.asLong());
				}
			});
			BlockPos center = new BlockPos(door.x(), room.floorY() + 1, door.z());
			level.playSound(null, center, ModSounds.SEAL_CLOSE, SoundSource.BLOCKS, 1.0F, 0.9F + level.random.nextFloat() * 0.2F);
			level.sendParticles(ModParticles.RUNE_GLYPH, center.getX() + 0.5, center.getY() + 0.5, center.getZ() + 0.5, 16, 0.8, 1.0, 0.8, 0.02);
		}
	}

	/** Opens the encounter room's seals. */
	public static void unseal(ServerLevel level, FloorState fs, boolean effects) {
		unseal(level, fs.sealedBlocks, effects);
	}

	/** Removes every seal block recorded in {@code seals} and forgets them. */
	public static void unseal(ServerLevel level, List<Long> seals, boolean effects) {
		for (long packed : seals) {
			BlockPos pos = BlockPos.of(packed);
			// getBlockState loads the chunk if it has to: a seal skipped here would be forgotten and block the doorway for
			// good (seals are unbreakable), e.g. one in a distant room when a party member logs in after a restart.
			if (RunManager.isSeal(level.getBlockState(pos))) {
				level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
				if (effects) {
					level.sendParticles(ModParticles.RUNE_GLYPH, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 3, 0.3, 0.3, 0.3, 0.05);
				}
			}
		}
		if (effects && !seals.isEmpty()) {
			BlockPos first = BlockPos.of(seals.get(0));
			level.playSound(null, first, ModSounds.SEAL_OPEN, SoundSource.BLOCKS, 1.0F, 1.0F);
		}
		seals.clear();
	}

	/** True if {@code player} counts as inside {@code room}: the box a sealed fight checks for who is still in it. */
	static boolean isInside(Room room, ServerPlayer player) {
		return room.interior().toAabb().inflate(1, 4, 1).contains(player.position());
	}

	/**
	 * The members a fight starting elsewhere may pull in: not those already sealed in the room encounter or the boss
	 * arena, who would be taken out of their own fight.
	 */
	static List<ServerPlayer> notSealedIn(FloorState fs, FloorLayout layout, List<ServerPlayer> present) {
		List<ServerPlayer> free = new ArrayList<>(present);
		if (fs.encounter != null) {
			Room busy = layout.room(fs.encounter.roomId);
			free.removeIf(p -> isInside(busy, p));
		}
		if (fs.bossStarted && !fs.bossDefeated) {
			for (int id : layout.arenaRooms()) {
				Room arena = layout.room(id);
				free.removeIf(p -> isInside(arena, p));
			}
		}
		return free;
	}

	/** Party members near (but outside) the room are drawn in through the nearest doorway so nobody is sealed out. */
	public static void pullIn(ServerLevel level, Room room, List<ServerPlayer> present, double range) {
		Box in = room.interior();
		for (ServerPlayer p : present) {
			if (in.toAabb().inflate(0.5, 4, 0.5).contains(p.position())) {
				continue;
			}
			if (p.position().distanceTo(Vec3.atCenterOf(room.center())) > range + Math.max(in.sizeX(), in.sizeZ()) / 2.0) {
				continue;
			}
			Doorway nearest = null;
			double best = Double.MAX_VALUE;
			for (Doorway door : room.doorways()) {
				double d = p.position().distanceToSqr(door.x() + 0.5, room.floorY(), door.z() + 0.5);
				if (d < best) {
					best = d;
					nearest = door;
				}
			}
			if (nearest == null) {
				continue;
			}
			BlockPos inside = RunManager.doorInside(nearest, room.floorY());
			p.teleportTo(inside.getX() + 0.5, inside.getY(), inside.getZ() + 0.5);
			level.sendParticles(ModParticles.RUNE_GLYPH, p.getX(), p.getY() + 1, p.getZ(), 12, 0.3, 0.6, 0.3, 0.02);
			p.sendSystemMessage(Component.translatable("message.abyssal_descent.encounter.pulled").withStyle(ChatFormatting.DARK_AQUA));
		}
	}

	// ====================================================================== spawn placement

	public static List<BlockPos> findSpawnPositions(ServerLevel level, Room room, List<? extends LivingEntity> players, int count, RandomSource random) {
		Box in = room.interior();
		List<BlockPos> result = new ArrayList<>();
		List<BlockPos> fallback = new ArrayList<>();
		int attempts = 0;
		while (result.size() < count && attempts++ < count * 30) {
			int x = in.minX() + 1 + random.nextInt(Math.max(1, in.sizeX() - 2));
			int z = in.minZ() + 1 + random.nextInt(Math.max(1, in.sizeZ() - 2));
			if (room.isInFrontOfDoor(x, z, 3)) {
				continue;
			}
			BlockPos pos = standable(level, x, z, in);
			if (pos == null) {
				continue;
			}
			boolean tooClose = false;
			for (LivingEntity p : players) {
				if (p.position().distanceToSqr(Vec3.atBottomCenterOf(pos)) < 25) {
					tooClose = true;
					break;
				}
			}
			boolean crowded = false;
			for (BlockPos other : result) {
				if (other.distManhattan(pos) < 2) {
					crowded = true;
					break;
				}
			}
			if (crowded) {
				continue;
			}
			if (tooClose) {
				fallback.add(pos);
			} else {
				result.add(pos);
			}
		}
		for (BlockPos pos : fallback) {
			if (result.size() >= count) {
				break;
			}
			result.add(pos);
		}
		while (result.size() < count) {
			result.add(room.center());
		}
		return result;
	}

	@Nullable
	private static BlockPos standable(ServerLevel level, int x, int z, Box in) {
		for (int y = in.minY() + 1; y >= in.minY() - 3; y--) {
			BlockPos feet = new BlockPos(x, y, z);
			BlockState below = level.getBlockState(feet.below());
			if (!below.isFaceSturdy(level, feet.below(), Direction.UP) || below.is(ModBlocks.SPIKE_TRAP)) {
				continue;
			}
			if (level.getBlockState(feet).getCollisionShape(level, feet).isEmpty() && !level.getBlockState(feet).is(ModBlocks.SPIKE_TRAP)
				&& level.getBlockState(feet.above()).getCollisionShape(level, feet.above()).isEmpty() && level.getFluidState(feet).isEmpty()) {
				return feet;
			}
		}
		return null;
	}
}
