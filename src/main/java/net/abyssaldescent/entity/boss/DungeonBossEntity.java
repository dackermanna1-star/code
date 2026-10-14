package net.abyssaldescent.entity.boss;

import java.util.ArrayList;
import java.util.List;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.entity.DungeonBoss;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.MobInfo;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.util.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Shared boss machinery: dormancy until the party crosses the threshold, an intro, a coloured boss bar for players in
 * the arena, health-gated phases with invulnerable transitions, and a long cinematic death that hands control back to
 * the run manager when it ends.
 */
public abstract class DungeonBossEntity extends DungeonMonster implements DungeonBoss {
	private static final EntityDataAccessor<Integer> DATA_PHASE = SynchedEntityData.defineId(DungeonBossEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Boolean> DATA_DORMANT = SynchedEntityData.defineId(DungeonBossEntity.class, EntityDataSerializers.BOOLEAN);

	protected final ServerBossEvent bossEvent;
	protected int runSlot = -1;
	protected int bossFloor = 1;
	@Nullable
	protected Box arena;
	protected final List<BlockPos> minionSpawns = new ArrayList<>();
	protected Vec3 home = Vec3.ZERO;
	/** The way the boss faces on its throne. */
	protected float homeYaw;
	/** Ticks remaining in the intro (no attacks). */
	protected int introTicks;
	/** Ticks remaining in a phase transition (invulnerable). */
	protected int transitionTicks;

	protected DungeonBossEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
		this.xpReward = 120;
		this.bossEvent = new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.WHITE, BossEvent.BossBarOverlay.NOTCHED_10);
		this.bossEvent.setPlayBossMusic(true);
		this.bossEvent.setDarkenScreen(true);
		this.bossEvent.setVisible(false);
		setPersistenceRequired();
	}

	/** Health fraction thresholds that start phase 2, 3, ... (descending). */
	protected abstract float[] phaseThresholds();

	/** Phase thresholds for the client boss bar's notches. */
	public final float[] phaseMarks() {
		return phaseThresholds().clone();
	}

	protected abstract Component title();

	protected abstract Component subtitle();

	/** Intro length in ticks. */
	protected abstract int introLength();

	/** Called on the server when a new phase begins (phase >= 2). Return transition length in ticks. */
	protected abstract int onPhaseStart(ServerLevel level, int phase);

	/** Boss AI while awake and not transitioning. */
	protected abstract void tickCombat(ServerLevel level);

	protected abstract void onIntroStart(ServerLevel level);

	protected abstract void tickDeathSequence(ServerLevel level, int deathTicks);

	protected abstract int deathLength();

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_PHASE, 1);
		builder.define(DATA_DORMANT, true);
	}

	public int phase() {
		return entityData.get(DATA_PHASE);
	}

	protected void setPhase(int phase) {
		entityData.set(DATA_PHASE, phase);
	}

	public boolean dormant() {
		return entityData.get(DATA_DORMANT);
	}

	protected void setDormant(boolean dormant) {
		entityData.set(DATA_DORMANT, dormant);
	}

	@Override
	public void configureArena(int runSlot, int floor, Box arena, List<BlockPos> minionSpawns) {
		this.runSlot = runSlot;
		this.bossFloor = floor;
		this.arena = arena;
		this.minionSpawns.clear();
		this.minionSpawns.addAll(minionSpawns);
		this.home = position();
		this.homeYaw = getYRot();
		Zone zone = Zone.forFloor(floor);
		bossEvent.setColor(zone.bossBarColor());
	}

	@Override
	public void beginEncounter(int partySize) {
		// A slain boss finishing its death sequence is never woken (that would bring it back to full health).
		if (!(level() instanceof ServerLevel level) || !dormant() || isDeadOrDying()) {
			return;
		}
		AdConfig.Difficulty difficulty = AdConfig.get().difficulty;
		double scale = difficulty.healthMultiplier * (1.0 + difficulty.bossPartyHealthScaling * Math.max(0, partySize - 1));
		var health = getAttribute(Attributes.MAX_HEALTH);
		if (health != null) {
			health.addOrReplacePermanentModifier(new AttributeModifier(net.abyssaldescent.AbyssalDescent.id("boss_party"), scale - 1.0,
				AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			setHealth(getMaxHealth());
		}
		// Like its health, the boss's damage follows the global multiplier only: its stats are tuned for its floor.
		var damage = getAttribute(Attributes.ATTACK_DAMAGE);
		if (damage != null) {
			damage.addOrReplacePermanentModifier(new AttributeModifier(net.abyssaldescent.AbyssalDescent.id("boss_damage"),
				difficulty.damageMultiplier - 1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
		}
		// Minions left over from a fight interrupted by a reload are not tracked any more: clear them before starting over.
		clearFightLeftovers(level);
		setDormant(false);
		bossEvent.setVisible(true);
		introTicks = introLength();
		for (ServerPlayer player : playersInArena(level)) {
			Messages.title(player, title(), subtitle(), 10, 70, 20);
		}
		onIntroStart(level);
	}

	public List<ServerPlayer> playersInArena(ServerLevel level) {
		List<ServerPlayer> list = new ArrayList<>();
		for (ServerPlayer player : level.players()) {
			if (player.isAlive() && !player.isSpectator() && (arena == null ? distanceTo(player) < 40 : arena.toAabb().inflate(2, 6, 2)
				.contains(player.position()))) {
				list.add(player);
			}
		}
		return list;
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		if (dormant()) {
			getNavigation().stop();
			setDeltaMovement(0, getDeltaMovement().y, 0);
			return;
		}
		super.customServerAiStep(level);
		syncBossBar(level);
		if (introTicks > 0) {
			introTicks--;
			getNavigation().stop();
			return;
		}
		int phase = phase();
		float[] thresholds = phaseThresholds();
		if (phase - 1 < thresholds.length && getHealth() / getMaxHealth() <= thresholds[phase - 1]) {
			setPhase(phase + 1);
			transitionTicks = onPhaseStart(level, phase + 1);
			return;
		}
		if (transitionTicks > 0) {
			transitionTicks--;
			getNavigation().stop();
			return;
		}
		// Leashed to the arena: a boss pulled out of it walks home.
		if (arena != null && !arena.toAabb().inflate(1, 4, 1).contains(position())) {
			getNavigation().moveTo(home.x, home.y, home.z, 1.2);
			return;
		}
		tickCombat(level);
	}

	private void syncBossBar(ServerLevel level) {
		bossEvent.setProgress(getHealth() / getMaxHealth());
		if (tickCount % 10 != 0) {
			return;
		}
		List<ServerPlayer> inside = playersInArena(level);
		for (ServerPlayer player : List.copyOf(bossEvent.getPlayers())) {
			if (!inside.contains(player)) {
				bossEvent.removePlayer(player);
			}
		}
		for (ServerPlayer player : inside) {
			bossEvent.addPlayer(player);
		}
	}

	@Override
	public boolean isInvulnerableTo(ServerLevel level, DamageSource source) {
		if (source.isCreativePlayer()) {
			return false;
		}
		return dormant() || introTicks > 0 || transitionTicks > 0 || super.isInvulnerableTo(level, source);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		// Bosses ignore damage from outside the arena (no cheesing through doorways or seals).
		Entity attacker = source.getEntity();
		if (arena != null && attacker != null && !arena.toAabb().inflate(1, 6, 1).contains(attacker.position()) && !source.isCreativePlayer()) {
			return false;
		}
		return super.hurtServer(level, source, amount);
	}

	@Override
	public void setCustomName(@Nullable Component name) {
		super.setCustomName(name);
		bossEvent.setName(getDisplayName());
	}

	@Override
	public void startSeenByPlayer(ServerPlayer player) {
		super.startSeenByPlayer(player);
	}

	@Override
	public void stopSeenByPlayer(ServerPlayer player) {
		super.stopSeenByPlayer(player);
		bossEvent.removePlayer(player);
	}

	@Override
	protected void tickDeath() {
		deathTime++;
		if (level() instanceof ServerLevel level) {
			bossEvent.setProgress(0.0F);
			tickDeathSequence(level, deathTime);
			if (deathTime >= deathLength() && !isRemoved()) {
				bossEvent.removeAllPlayers();
				RunManager.get(level.getServer()).onBossDefeated(runSlot, bossFloor, position());
				level.broadcastEntityEvent(this, (byte) 60);
				remove(RemovalReason.KILLED);
			}
		}
	}

	@Override
	public void die(DamageSource source) {
		super.die(source);
		for (ServerPlayer player : List.copyOf(bossEvent.getPlayers())) {
			Messages.title(player, Component.translatable("message.abyssal_descent.boss_defeated").withStyle(ChatFormatting.GOLD),
				Component.translatable("message.abyssal_descent.boss_defeated.sub", title()).withStyle(ChatFormatting.GRAY), 10, 60, 30);
		}
	}

	@Override
	public void remove(RemovalReason reason) {
		bossEvent.removeAllPlayers();
		if (reason == RemovalReason.DISCARDED && level() instanceof ServerLevel level) {
			// Cleared away with its floor (the run ended or moved on): what it summoned goes with it.
			clearFightLeftovers(level);
		}
		super.remove(reason);
	}

	/**
	 * Calls the fight off (the run manager does this when nobody is left in the arena): back to the throne, dormant, at
	 * full health, with its minions and telegraphs gone. The next delver to cross the threshold starts the fight again.
	 */
	public void resetEncounter() {
		if (!(level() instanceof ServerLevel level) || isDeadOrDying()) {
			return;
		}
		resetFight();
		clearFightLeftovers(level);
		bossEvent.removeAllPlayers();
		setTarget(null);
		getNavigation().stop();
		removeAllEffects();
		clearFire();
		setDeltaMovement(Vec3.ZERO);
		if (!home.equals(Vec3.ZERO)) {
			snapTo(home.x, home.y, home.z, homeYaw, 0.0F);
			setYHeadRot(homeYaw);
			setYBodyRot(homeYaw);
		}
	}

	/**
	 * Puts the fight back to its start: dormant, phase 1, full health. Only touches the boss itself, so it is safe while
	 * the boss is being loaded; subclasses also reset their attack state here.
	 */
	protected void resetFight() {
		setDormant(true);
		setPhase(1);
		introTicks = 0;
		transitionTicks = 0;
		setHealth(getMaxHealth());
		bossEvent.setVisible(false);
	}

	/** Discards what a fight left in the arena: minions (also untracked ones from before a reload) and telegraphs. */
	protected void clearFightLeftovers(ServerLevel level) {
		if (arena == null) {
			return;
		}
		AABB box = arena.toAabb().inflate(2, 6, 2);
		for (Mob minion : level.getEntitiesOfClass(Mob.class, box, m -> {
			MobInfo info = m.getAttached(ModAttachments.MOB_INFO);
			// Boss minions are the run's enemies that belong to no room.
			return m != this && info != null && info.runSlot() == runSlot && info.roomId() == -1;
		})) {
			minion.discard();
		}
		for (TelegraphEntity telegraph : level.getEntitiesOfClass(TelegraphEntity.class, box)) {
			telegraph.discard();
		}
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putInt("run_slot", runSlot);
		output.putInt("boss_floor", bossFloor);
		if (arena != null) {
			output.putIntArray("arena", new int[] {arena.minX(), arena.minY(), arena.minZ(), arena.maxX(), arena.maxY(), arena.maxZ()});
		}
		output.store("minions", BlockPos.CODEC.listOf(), List.copyOf(minionSpawns));
		output.store("home", Vec3.CODEC, home);
		output.putFloat("home_yaw", homeYaw);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		runSlot = input.getIntOr("run_slot", -1);
		bossFloor = input.getIntOr("boss_floor", 1);
		input.getIntArray("arena").ifPresent(a -> {
			if (a.length == 6) {
				arena = new Box(a[0], a[1], a[2], a[3], a[4], a[5]);
			}
		});
		minionSpawns.clear();
		input.read("minions", BlockPos.CODEC.listOf()).ifPresent(minionSpawns::addAll);
		home = input.read("home", Vec3.CODEC).orElse(position());
		homeYaw = input.getFloatOr("home_yaw", 0.0F);
		bossEvent.setName(getDisplayName());
		bossEvent.setColor(Zone.forFloor(bossFloor).bossBarColor());
		if (isDeadOrDying()) {
			// Saved during its death sequence: the kill stands. The sequence picks up where it stopped and then ends the
			// fight, so the floor is still won and the loot (dropped when it fell) is not dropped again.
			setDormant(false);
			return;
		}
		// An interrupted fight starts over: back to the throne, full health, dormant.
		resetFight();
		if (!home.equals(Vec3.ZERO)) {
			setPos(home.x, home.y, home.z);
			setYRot(homeYaw);
			setYHeadRot(homeYaw);
			setYBodyRot(homeYaw);
		}
	}

	@Override
	public boolean isPushable() {
		return !dormant() && super.isPushable();
	}

	@Override
	public boolean canUsePortal(boolean allowPassengers) {
		return false;
	}
}
