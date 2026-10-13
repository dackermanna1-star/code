package dev.calibercraft.server;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.combat.BulletManager;
import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.core.ActionType;
import dev.calibercraft.core.AmmoLogic;
import dev.calibercraft.core.Ballistics;
import dev.calibercraft.core.FireMode;
import dev.calibercraft.core.GunState;
import dev.calibercraft.core.HeatModel;
import dev.calibercraft.core.ReloadRunner;
import dev.calibercraft.core.ReloadSpec;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.AmmoDefinition;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.FirePayload;
import dev.calibercraft.network.GunActionPayload;
import dev.calibercraft.network.GunFeedbackPayload;
import dev.calibercraft.network.ServerSettings;
import dev.calibercraft.network.ShotEventPayload;
import dev.calibercraft.network.SyncDataPayload;
import dev.calibercraft.registry.ModComponents;
import dev.calibercraft.registry.ModSounds;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Authoritative weapon logic. Clients predict firing and reloading for responsiveness; every ammunition
 * change happens here after validation, and the result reaches clients through the synchronised stack.
 */
public final class GunService {
	private static final Map<UUID, PlayerGunData> DATA = new HashMap<>();
	private static final Identifier HANDLING_MODIFIER = CaliberCraft.id("weapon_handling");
	private static final int EQUIP_TOLERANCE_TICKS = 2;

	private GunService() {
	}

	static PlayerGunData data(ServerPlayer player) {
		return DATA.computeIfAbsent(player.getUUID(), k -> new PlayerGunData(player.getRandom().nextLong() ^ System.nanoTime()));
	}

	public static void remove(ServerPlayer player) {
		DATA.remove(player.getUUID());
	}

	public static void clear() {
		DATA.clear();
	}

	public static void sync(ServerPlayer player) {
		ServerPlayNetworking.send(player, new SyncDataPayload(CaliberDataHolder.server(), data(player).salt,
			ServerSettings.from(ServerConfig.get())));
	}

	/** Whether a reload or manual cycle is in progress (used by tests and the gunsmith). */
	public static boolean busy(ServerPlayer player) {
		PlayerGunData d = DATA.get(player.getUUID());
		return d != null && d.runner != null;
	}

	// ------------------------------------------------------------------------------------------ context

	private record Ctx(ServerPlayer player, ItemStack stack, Identifier weaponId, WeaponDefinition def, WeaponStats stats,
			CaliberData data, PlayerGunData pd) {
		GunState state() {
			return WeaponStacks.state(stack);
		}

		void setState(GunState s) {
			stack.set(ModComponents.GUN_STATE, s);
		}
	}

	private static Optional<Ctx> context(ServerPlayer player, int slot) {
		if (player.isSpectator() || !player.isAlive() || (slot >= 0 && slot != player.getInventory().getSelectedSlot())) {
			return Optional.empty();
		}
		ItemStack stack = player.getMainHandItem();
		CaliberData data = CaliberDataHolder.server();
		Optional<Identifier> id = WeaponStacks.weaponId(stack);
		if (id.isEmpty()) {
			return Optional.empty();
		}
		Optional<WeaponDefinition> def = data.weapon(id.get());
		if (def.isEmpty()) {
			return Optional.empty();
		}
		WeaponStacks.ensureInitialized(stack, data);
		GunState s = WeaponStacks.state(stack);
		WeaponStats stats = WeaponStacks.stats(def.get(), WeaponStacks.loadout(stack), WeaponStacks.activeAmmo(s, def.get(), data), data);
		return Optional.of(new Ctx(player, stack, id.get(), def.get(), stats, data, data(player)));
	}

	// ------------------------------------------------------------------------------------------ firing

	public static void handleFire(FirePayload p, ServerPlayer player) {
		PlayerGunData pd = data(player);
		Optional<Ctx> oc = context(player, p.slot());
		if (oc.isEmpty()) {
			return;
		}
		Ctx c = oc.get();
		ServerLevel level = player.level();
		long now = level.getGameTime();
		if (p.seq() <= pd.lastSeq) {
			return; // duplicate or replayed packet
		}
		pd.lastSeq = p.seq();
		String reject = validateShot(c, p, now);
		if (reject != null) {
			rejectShot(c, p.seq(), reject);
			return;
		}
		if (pd.runner != null) {
			pd.runner.cancel();
			pd.runner = null;
		}
		GunState before = c.state();
		ActionType action = c.def.action();
		GunState after = AmmoLogic.fire(before, action).withLastSeq(p.seq());
		boolean heat = ServerConfig.get().weaponHeat && c.stats.get(Stat.HEAT_PER_SHOT) > 0;
		if (heat) {
			after = HeatModel.afterShot(after, now, c.stats.get(Stat.HEAT_PER_SHOT), c.stats.get(Stat.HEAT_COOLING));
			if (after.overheated() && !before.overheated()) {
				ServerPlayNetworking.send(player, new GunFeedbackPayload(GunFeedbackPayload.Kind.OVERHEATED, 0));
				level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.OVERHEAT, SoundSource.PLAYERS, 0.8f, 1.0f);
			}
		}
		c.setState(after);
		if (action.manualCycle()) {
			startRunner(c, ReloadRunner.timeline(ReloadRunner.Kind.CYCLE, c.def.cycle(), 1.0), false);
		}
		spawnShot(c, p, now);
	}

	private static String validateShot(Ctx c, FirePayload p, long now) {
		PlayerGunData pd = c.pd;
		GunState s = c.state();
		if (now - pd.equipTime + EQUIP_TOLERANCE_TICKS < c.stats.get(Stat.EQUIP_TIME)) {
			return "equipping";
		}
		if (pd.runner != null && !(pd.runner.interruptibleByFire() && AmmoLogic.canFire(s, c.def.action()))) {
			return "busy";
		}
		if (ServerConfig.get().weaponHeat && HeatModel.locked(s, now, c.stats.get(Stat.HEAT_COOLING))) {
			return "overheated";
		}
		if (!AmmoLogic.canFire(s, c.def.action())) {
			return "empty";
		}
		FireMode mode = c.def.fireMode(s.fireMode());
		if (!pd.gate.accept(mode, p.pullId(), c.def.burstCount())) {
			return "fire mode";
		}
		double interval = 60e9 / c.stats.get(Stat.RPM);
		if (!pd.limiter.tryAcquire(System.nanoTime(), interval * 0.92, ServerConfig.get().fireBurstAllowance)) {
			return "rate";
		}
		return null;
	}

	private static void rejectShot(Ctx c, int seq, String reason) {
		// Acknowledge the sequence number so the client's predicted ammunition count resyncs.
		c.setState(c.state().withLastSeq(seq));
		ServerPlayNetworking.send(c.player, new GunFeedbackPayload(GunFeedbackPayload.Kind.SHOT_REJECTED, seq));
		CaliberCraft.LOGGER.debug("Rejected shot {} from {}: {}", seq, c.player.getScoreboardName(), reason);
	}

	private static void spawnShot(Ctx c, FirePayload p, long now) {
		ServerPlayer player = c.player;
		ServerLevel level = player.level();
		PlayerGunData pd = c.pd;
		WeaponStats st = c.stats;
		ServerConfig cfg = ServerConfig.get();

		// Aim: accept the client's view if it is close to what the server knows (recoil is client-side).
		double[] serverDir = Ballistics.direction(player.getYRot(), player.getXRot());
		double[] clientDir = Ballistics.direction(p.yaw(), p.pitch());
		double dot = serverDir[0] * clientDir[0] + serverDir[1] * clientDir[1] + serverDir[2] * clientDir[2];
		boolean clientAimOk = Math.toDegrees(Math.acos(Math.max(-1, Math.min(1, dot)))) <= cfg.maxAimDeviationDegrees;
		float yaw = clientAimOk ? p.yaw() : player.getYRot();
		float pitch = clientAimOk ? p.pitch() : player.getXRot();
		double[] dir = clientAimOk ? clientDir : serverDir;

		// Spread: the client reports the cone it used; it may not be tighter than the server allows.
		double aim = pd.aiming ? Math.min(1.0, (now - pd.aimStart) / Math.max(1.0, st.get(Stat.ADS_TIME))) : 0.0;
		double minSpread = Ballistics.spread(st.get(Stat.SPREAD_HIP), st.get(Stat.SPREAD_ADS), aim, st.get(Stat.SPREAD_MOVE), pd.moving, 0)
			* cfg.spreadTolerance;
		if (WeaponStacks.hasFlag(c.stack, c.data, "bipod") && player.isShiftKeyDown()) {
			minSpread *= 0.5;
		}
		double maxSpread = st.get(Stat.SPREAD_HIP) * st.get(Stat.SPREAD_MOVE) + st.get(Stat.SPREAD_BLOOM_MAX) + 2.0;
		double spread = Math.max(minSpread, Math.min(maxSpread, Double.isFinite(p.spread()) ? p.spread() : maxSpread));

		pd.bloom = (float) Math.min(st.get(Stat.SPREAD_BLOOM_MAX), pd.bloom + st.get(Stat.SPREAD_BLOOM));
		pd.lastShot = now;

		int pellets = st.i(Stat.PELLETS);
		long seed = Ballistics.shotSeed(pd.salt, p.seq());
		double[] dirs = Ballistics.pelletDirections(seed, dir, spread, pellets);
		Optional<Identifier> ammoId = WeaponStacks.activeAmmo(c.state(), c.def, c.data);
		AmmoDefinition ammo = ammoId.map(id -> c.data.ammo().get(id)).orElse(null);
		int fireSeconds = ammo == null ? 0 : ammo.fireSeconds();
		int tracer = ammo == null ? 0xFFFFD27F : ammo.tracerColor();

		Vec3 origin = player.getEyePosition();
		BulletManager manager = BulletManager.get(level);
		var group = BulletManager.group(player, st.get(Stat.EFFECTIVE_RANGE), st.get(Stat.MAX_RANGE), st.get(Stat.MIN_DAMAGE_MULT),
			st.get(Stat.HEADSHOT_MULT), st.get(Stat.ARMOR_PENETRATION), st.get(Stat.KNOCKBACK), fireSeconds);
		double damage = st.get(Stat.DAMAGE) * cfg.damageMultiplier;
		double velocity = st.get(Stat.VELOCITY);
		for (int i = 0; i < pellets; i++) {
			Vec3 v = new Vec3(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]).scale(velocity);
			manager.spawn(group, origin, v, st.get(Stat.GRAVITY), damage, st.get(Stat.PENETRATION));
		}
		manager.flushSpawned();

		boolean suppressed = WeaponStacks.hasFlag(c.stack, c.data, "suppressed");
		int flags = (suppressed ? ShotEventPayload.SUPPRESSED : 0) | ShotEventPayload.TRACER;
		ShotEventPayload event = new ShotEventPayload(player.getId(), c.weaponId, origin.x, origin.y, origin.z, yaw, pitch, (float) spread,
			pellets, seed, flags, st.f(Stat.LOUDNESS), st.f(Stat.FLASH), tracer);
		double range = cfg.audibleRange * st.get(Stat.LOUDNESS);
		for (ServerPlayer other : PlayerLookup.around(level, origin, range)) {
			if (other != player) {
				ServerPlayNetworking.send(other, event);
			}
		}
		player.gameEvent(net.minecraft.world.level.gameevent.GameEvent.PROJECTILE_SHOOT);
	}

	// ------------------------------------------------------------------------------------------ actions

	public static void handleAction(GunActionPayload p, ServerPlayer player) {
		PlayerGunData pd = data(player);
		switch (p.action()) {
			case AIM_START -> {
				if (!pd.aiming) {
					pd.aiming = true;
					pd.aimStart = player.level().getGameTime();
				}
				return;
			}
			case AIM_STOP -> {
				pd.aiming = false;
				return;
			}
			default -> {
			}
		}
		Optional<Ctx> oc = context(player, p.slot());
		if (oc.isEmpty()) {
			return;
		}
		Ctx c = oc.get();
		switch (p.action()) {
			case RELOAD -> startReload(c);
			case CANCEL_RELOAD -> {
				if (pd.runner != null && pd.runner.kind() == ReloadRunner.Kind.SINGLE) {
					pd.runner.requestStop(); // finish the current shell, then the end (pump) stroke
				} else if (pd.runner != null && pd.runner.kind() != ReloadRunner.Kind.CYCLE) {
					cancelRunner(c.player, pd, false);
				}
			}
			case CYCLE -> {
				if (pd.runner == null && AmmoLogic.needsCycle(c.state(), c.def.action())) {
					startRunner(c, ReloadRunner.timeline(ReloadRunner.Kind.CYCLE, c.def.cycle(), 1.0), true);
				}
			}
			case FIRE_MODE -> {
				if (c.def.fireModes().size() > 1) {
					GunState s = c.state();
					c.setState(s.withFireMode((s.fireMode() + 1) % c.def.fireModes().size()));
					playAround(c.player, ModSounds.FIRE_MODE, 0.6f);
				}
			}
			case AMMO_TYPE -> cycleAmmoType(c);
			case UNLOAD -> unload(c);
			case MELEE -> melee(c);
			case INSPECT -> playAround(c.player, ModSounds.INSPECT, 0.5f);
			default -> {
			}
		}
	}

	private static Item ammoItem(CaliberData data, Optional<Identifier> ammoId) {
		return ammoId.map(id -> data.ammo().get(id)).map(a -> BuiltInRegistries.ITEM.getValue(a.item())).orElse(null);
	}

	private static void startReload(Ctx c) {
		PlayerGunData pd = c.pd;
		if (pd.runner != null) {
			return;
		}
		GunState s = c.state();
		Optional<Identifier> selected = WeaponStacks.selectedAmmo(s, c.def, c.data);
		if (s.selectedAmmo().isEmpty() && selected.isPresent()) {
			s = s.withSelectedAmmo(selected);
			c.setState(s);
		}
		Item item = ammoItem(c.data, selected);
		int reserve = item == null ? 0 : AmmoInventory.count(c.player, item);
		// Capacity depends on the ammunition that will be loaded (e.g. slugs do not change it, but be exact).
		WeaponStats st = WeaponStacks.stats(c.def, WeaponStacks.loadout(c.stack), selected, c.data);
		int cap = st.i(Stat.MAGAZINE);
		if (!AmmoLogic.canReload(s, cap, reserve)) {
			ServerPlayNetworking.send(c.player, new GunFeedbackPayload(GunFeedbackPayload.Kind.RELOAD_DENIED, 0));
			return;
		}
		ReloadSpec spec = c.def.reload();
		ReloadRunner.Kind kind = AmmoLogic.chooseReload(spec.type(), c.def.action(), s);
		double speed = st.get(Stat.RELOAD_SPEED);
		ReloadRunner runner;
		if (kind == ReloadRunner.Kind.SINGLE) {
			if (spec.single().isEmpty()) {
				return;
			}
			runner = ReloadRunner.single(spec.single().get(), speed);
		} else {
			runner = ReloadRunner.timeline(kind, kind == ReloadRunner.Kind.TACTICAL ? spec.tactical() : spec.empty(), speed);
		}
		startRunner(c, runner, false);
		ServerPlayNetworking.send(c.player, new GunFeedbackPayload(GunFeedbackPayload.Kind.RELOAD_STARTED, kind.ordinal()));
	}

	private static void startRunner(Ctx c, ReloadRunner runner, boolean notifyCycle) {
		c.pd.runner = runner;
		if (notifyCycle) {
			ServerPlayNetworking.send(c.player, new GunFeedbackPayload(GunFeedbackPayload.Kind.CYCLE_STARTED, 0));
		}
	}

	private static void cancelRunner(ServerPlayer player, PlayerGunData pd, boolean notify) {
		if (pd.runner != null) {
			pd.runner.cancel();
			pd.runner = null;
			if (notify) {
				ServerPlayNetworking.send(player, new GunFeedbackPayload(GunFeedbackPayload.Kind.RELOAD_CANCELLED, 0));
			}
		}
	}

	private static void cycleAmmoType(Ctx c) {
		List<Identifier> types = c.data.ammoForCaliber(c.def.caliber());
		if (types.size() < 2) {
			return;
		}
		GunState s = c.state();
		Identifier current = WeaponStacks.selectedAmmo(s, c.def, c.data).orElse(types.getFirst());
		int start = Math.max(0, types.indexOf(current));
		for (int i = 1; i <= types.size(); i++) {
			Identifier next = types.get((start + i) % types.size());
			Item item = ammoItem(c.data, Optional.of(next));
			if (item != null && (AmmoInventory.count(c.player, item) > 0 || next.equals(types.getFirst()))) {
				c.setState(s.withSelectedAmmo(Optional.of(next)));
				playAround(c.player, ModSounds.FIRE_MODE, 0.5f);
				return;
			}
		}
	}

	private static void unload(Ctx c) {
		if (c.pd.runner != null) {
			return;
		}
		GunState s = c.state();
		if (s.total() <= 0) {
			return;
		}
		Item item = ammoItem(c.data, s.loadedAmmo());
		if (item != null) {
			AmmoInventory.give(c.player, item, s.total());
		}
		c.setState(s.withRounds(0).withChambered(false));
		playWeaponCue(c.player, c.def, c.weaponId, "mag_out");
	}

	private static void melee(Ctx c) {
		ServerConfig cfg = ServerConfig.get();
		ServerPlayer player = c.player;
		long now = player.level().getGameTime();
		if (!cfg.meleeBash || now - c.pd.lastMelee < 16 || c.pd.runner != null) {
			return;
		}
		c.pd.lastMelee = now;
		double reach = 2.8;
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getViewVector(1.0f);
		Vec3 end = eye.add(look.scale(reach));
		EntityHitResult hit = net.minecraft.world.entity.projectile.ProjectileUtil.getEntityHitResult(player, eye, end,
			player.getBoundingBox().expandTowards(look.scale(reach)).inflate(1.0), e -> e.isPickable() && !e.isSpectator(), reach * reach);
		playAround(player, net.minecraft.sounds.SoundEvents.PLAYER_ATTACK_KNOCKBACK, 0.7f);
		if (hit != null) {
			Entity target = hit.getEntity();
			target.hurtServer(player.level(), player.damageSources().playerAttack(player), c.stats.f(Stat.MELEE_DAMAGE));
			if (target instanceof net.minecraft.world.entity.LivingEntity living) {
				living.knockback(0.7, -look.x, -look.z);
			}
		}
	}

	// ------------------------------------------------------------------------------------------ ticking

	public static void tick(ServerPlayer player) {
		PlayerGunData pd = data(player);
		ServerLevel level = player.level();
		long now = level.getGameTime();
		Vec3 pos = player.position();
		pd.moving = pos.subtract(pd.lastPos).horizontalDistanceSqr() > 0.0016;
		pd.lastPos = pos;

		int slot = player.getInventory().getSelectedSlot();
		ItemStack held = player.getMainHandItem();
		if (slot != pd.heldSlot || held != pd.heldStack) {
			boolean sameWeapon = slot == pd.heldSlot && ItemStack.isSameItem(held, pd.heldStack) && WeaponStacks.isFirearm(held);
			if (!sameWeapon) {
				cancelRunner(player, pd, true);
				pd.equipTime = now;
				pd.limiter.reset();
				pd.bloom = 0;
			}
			pd.heldSlot = slot;
			pd.heldStack = held;
		}

		if (pd.bloom > 0 && now - pd.lastShot > 3) {
			pd.bloom = Math.max(0, pd.bloom - 0.15f);
		}

		Optional<Ctx> oc = WeaponStacks.isFirearm(held) ? context(player, -1) : Optional.empty();
		if (pd.runner != null) {
			if (oc.isEmpty()) {
				cancelRunner(player, pd, true);
			} else {
				Ctx c = oc.get();
				ReloadRunner runner = pd.runner;
				runner.advance(1.0f, new ServerReloadListener(c));
				if (runner.done() && pd.runner == runner) {
					pd.runner = null;
				}
			}
		}
		updateHandling(player, pd, oc);
	}

	private static void updateHandling(ServerPlayer player, PlayerGunData pd, Optional<Ctx> oc) {
		double mult = 1.0;
		if (oc.isPresent()) {
			WeaponStats st = oc.get().stats;
			mult = st.get(Stat.MOVE_SPEED) * (pd.aiming ? st.get(Stat.ADS_MOVE_SPEED) : 1.0);
		}
		if (Math.abs(mult - pd.appliedMoveMult) < 1e-4) {
			return;
		}
		AttributeInstance attr = player.getAttribute(Attributes.MOVEMENT_SPEED);
		if (attr == null) {
			return;
		}
		attr.removeModifier(HANDLING_MODIFIER);
		if (Math.abs(mult - 1.0) > 1e-4) {
			attr.addTransientModifier(new AttributeModifier(HANDLING_MODIFIER, mult - 1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
		}
		pd.appliedMoveMult = mult;
	}

	public static Identifier handlingModifierId() {
		return HANDLING_MODIFIER;
	}

	// ------------------------------------------------------------------------------------------ sounds

	static void playAround(ServerPlayer player, SoundEvent sound, float volume) {
		if (sound != null) {
			// Excludes the acting player: their client plays the predicted sound locally.
			player.level().playSound(player, player.getX(), player.getY(), player.getZ(), sound, SoundSource.PLAYERS, volume,
				0.95f + player.getRandom().nextFloat() * 0.1f);
		}
	}

	static void playWeaponCue(ServerPlayer player, WeaponDefinition def, Identifier weaponId, String cue) {
		playAround(player, ModSounds.get("weapon." + def.soundSet(weaponId) + "." + cue), 0.7f);
	}

	/** Applies ammunition changes at the runner's commit points. */
	private static final class ServerReloadListener implements ReloadRunner.Listener {
		private final Ctx c;

		ServerReloadListener(Ctx c) {
			this.c = c;
		}

		@Override
		public void cue(String name) {
			playWeaponCue(c.player, c.def, c.weaponId, name);
		}

		private int capacity(Optional<Identifier> ammo) {
			return WeaponStacks.stats(c.def, WeaponStacks.loadout(c.stack), ammo, c.data).i(Stat.MAGAZINE);
		}

		@Override
		public void commit() {
			GunState s = c.state();
			Optional<Identifier> selected = WeaponStacks.selectedAmmo(s, c.def, c.data);
			Item item = ammoItem(c.data, selected);
			if (item == null) {
				return;
			}
			int reserve = AmmoInventory.count(c.player, item);
			AmmoLogic.Commit r = AmmoLogic.commitMagazine(s, capacity(selected), reserve, selected);
			int taken = AmmoInventory.take(c.player, item, r.taken());
			GunState ns = r.state();
			if (taken < r.taken()) {
				ns = ns.withRounds(ns.rounds() - (r.taken() - taken)); // inventory changed meanwhile
			}
			if (r.returned() > 0) {
				Item old = ammoItem(c.data, r.returnedType());
				if (old != null) {
					AmmoInventory.give(c.player, old, r.returned());
				}
			}
			c.setState(ns);
		}

		@Override
		public void chamber() {
			c.setState(AmmoLogic.cycle(c.state()));
		}

		@Override
		public boolean loadRound() {
			GunState s = c.state();
			Optional<Identifier> selected = WeaponStacks.selectedAmmo(s, c.def, c.data);
			Item item = ammoItem(c.data, selected);
			if (item == null) {
				return false;
			}
			if (AmmoLogic.isSwitchingAmmo(s)) {
				Item old = ammoItem(c.data, s.loadedAmmo());
				if (old != null) {
					AmmoInventory.give(c.player, old, s.total());
				}
				s = s.withRounds(0).withChambered(false).withLoadedAmmo(selected);
			}
			GunState loaded = AmmoLogic.loadOne(s, capacity(selected));
			if (loaded == null || AmmoInventory.take(c.player, item, 1) < 1) {
				c.setState(s);
				return false;
			}
			c.setState(loaded.withLoadedAmmo(selected));
			return true;
		}

		@Override
		public boolean wantsMoreRounds() {
			GunState s = c.state();
			Optional<Identifier> selected = WeaponStacks.selectedAmmo(s, c.def, c.data);
			Item item = ammoItem(c.data, selected);
			return item != null && (AmmoLogic.isSwitchingAmmo(s) || s.rounds() < capacity(selected))
				&& AmmoInventory.count(c.player, item) > 0;
		}

		@Override
		public boolean needsChamber() {
			return !c.state().chambered();
		}
	}
}
