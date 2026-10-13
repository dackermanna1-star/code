package dev.calibercraft.client;

import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.fx.ClientEffects;
import dev.calibercraft.client.input.Keybinds;
import dev.calibercraft.client.sound.GunSounds;
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
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.FirePayload;
import dev.calibercraft.network.GunActionPayload;
import dev.calibercraft.network.GunFeedbackPayload;
import dev.calibercraft.network.GunsmithPayload;
import dev.calibercraft.registry.ModSounds;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * Client-side brain of the held weapon: input, predicted ammunition, fire timing, reload/cycle mirroring, aiming
 * and recoil. Everything it changes locally is a prediction; the server's synchronised stack is authoritative.
 */
public final class GunController {
	public static final GunController INSTANCE = new GunController();
	private static final double NANOS_PER_TICK = 50_000_000.0;
	private static final int MAX_SHOTS_PER_FRAME = 3;

	private final RandomSource random = RandomSource.create();

	// Held weapon
	private int heldSlot = -1;
	private ItemStack heldStack = ItemStack.EMPTY;
	private Identifier weaponId;
	private WeaponDefinition def;
	private WeaponStats stats;

	// Prediction
	private int seq;
	private int pullId;
	private final Deque<Integer> pending = new ArrayDeque<>();
	private GunState override;
	private long overrideNanos;

	// Trigger
	private boolean triggerWasDown;
	private long nextShotNanos;
	private int burstRemaining;
	private boolean semiConsumed;

	// Actions
	private ReloadRunner runner;
	private boolean aimToggled;
	private boolean aimSent;

	// Animation-facing state (ticks unless noted)
	public float ads;
	public float equip;
	public float sprint;
	public float inspect = -1;
	public float melee = -1;
	public float dryFire = -1;
	public float overheatAnim = -1;
	public float bloom;
	public float clock;
	public float lastShotClock = -100;
	public int shotsFired;
	public float recoilKick;
	public float shake;
	private float pendingPitch;
	private float pendingYaw;
	private float recoverable;
	private long lastShotNanos;
	private int burstShots;

	private GunController() {
	}

	// ------------------------------------------------------------------------------------------------ queries

	public boolean active() {
		return def != null && stats != null && !heldStack.isEmpty();
	}

	public Identifier weaponId() {
		return weaponId;
	}

	public WeaponDefinition definition() {
		return def;
	}

	public WeaponStats stats() {
		return stats;
	}

	public ItemStack stack() {
		return heldStack;
	}

	public ReloadRunner runner() {
		return runner;
	}

	public boolean reloading() {
		return runner != null && runner.kind() != ReloadRunner.Kind.CYCLE;
	}

	public boolean aimingIntent() {
		Minecraft mc = Minecraft.getInstance();
		if (!active() || mc.screen != null || reloading() || sprint > 0.5f || inspect >= 0) {
			return false;
		}
		ClientConfig cfg = ClientConfig.get();
		return cfg.toggleAim ? aimToggled : mc.options.keyUse.isDown();
	}

	/** Server state with locally predicted shots and reload progress applied. */
	public GunState predicted() {
		if (heldStack.isEmpty()) {
			return GunState.EMPTY;
		}
		GunState server = WeaponStacks.state(heldStack);
		GunState base = server;
		if (override != null) {
			if (server.actionSeq() >= override.actionSeq() || System.nanoTime() - overrideNanos > 3_000_000_000L) {
				override = null;
			} else {
				base = override.withLastSeq(Math.max(override.lastSeq(), server.lastSeq()));
			}
		}
		while (!pending.isEmpty() && pending.peekFirst() <= server.lastSeq()) {
			pending.pollFirst();
		}
		GunState s = base;
		if (def != null) {
			for (int p : pending) {
				if (p > base.lastSeq() && AmmoLogic.canFire(s, def.action())) {
					s = AmmoLogic.fire(s, def.action());
				}
			}
		}
		return s;
	}

	public int reserve() {
		if (!active()) {
			return 0;
		}
		return reserveOf(WeaponStacks.selectedAmmo(predicted(), def, ClientGunData.data()));
	}

	private int reserveOf(Optional<Identifier> ammo) {
		LocalPlayer player = Minecraft.getInstance().player;
		if (player == null || ammo.isEmpty()) {
			return 0;
		}
		var settings = ClientGunData.settings();
		if (settings.infiniteAmmo() || (player.isCreative() && settings.infiniteAmmoCreative())) {
			return Integer.MAX_VALUE;
		}
		Item item = ammoItem(ammo.get());
		if (item == null) {
			return 0;
		}
		Inventory inv = player.getInventory();
		int n = 0;
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack s = inv.getItem(i);
			if (s.is(item)) {
				n += s.getCount();
			}
		}
		return n;
	}

	private static Item ammoItem(Identifier ammo) {
		var def = ClientGunData.data().ammo().get(ammo);
		return def == null ? null : BuiltInRegistries.ITEM.getValue(def.item());
	}

	public FireMode fireMode() {
		return def == null ? FireMode.SEMI : def.fireMode(predicted().fireMode());
	}

	public Optional<AttachmentDefinition> optic() {
		return heldStack.isEmpty() ? Optional.empty() : WeaponStacks.optic(heldStack, ClientGunData.data());
	}

	public boolean hasFlag(String flag) {
		return !heldStack.isEmpty() && WeaponStacks.hasFlag(heldStack, ClientGunData.data(), flag);
	}

	public float heat() {
		Minecraft mc = Minecraft.getInstance();
		if (!active() || mc.level == null || stats.get(Stat.HEAT_PER_SHOT) <= 0) {
			return 0;
		}
		return HeatModel.current(predicted(), mc.level.getGameTime(), stats.get(Stat.HEAT_COOLING));
	}

	public boolean bipodActive() {
		LocalPlayer p = Minecraft.getInstance().player;
		return p != null && p.isShiftKeyDown() && hasFlag("bipod");
	}

	/** Current cone half-angle in degrees (what the client reports with each shot). */
	public float currentSpread() {
		if (!active()) {
			return 0;
		}
		LocalPlayer p = Minecraft.getInstance().player;
		boolean moving = p != null && p.getDeltaMovement().horizontalDistanceSqr() > 0.0016;
		double s = Ballistics.spread(stats.get(Stat.SPREAD_HIP), stats.get(Stat.SPREAD_ADS), ads, stats.get(Stat.SPREAD_MOVE), moving, bloom);
		if (bipodActive()) {
			s *= 0.5;
		}
		return (float) s;
	}

	// ------------------------------------------------------------------------------------------------ ticking

	/** Called every client tick. */
	public void tick(Minecraft mc) {
		LocalPlayer player = mc.player;
		if (player == null) {
			reset();
			return;
		}
		updateHeld(player);
		if (!active()) {
			handleNonWeaponKeys(mc);
			if (aimSent) {
				send(GunActionPayload.Action.AIM_STOP);
				aimSent = false;
			}
			return;
		}
		if (ClientGunData.settings() != null && Keybinds.CUSTOMIZE.consumeClick()) {
			dev.calibercraft.client.screen.GunsmithScreen.open(false);
		}
		while (Keybinds.RELOAD.consumeClick()) {
			if (player.isShiftKeyDown()) {
				if (runner == null) {
					send(GunActionPayload.Action.UNLOAD);
				}
			} else {
				tryReload();
			}
		}
		while (Keybinds.FIRE_MODE.consumeClick()) {
			if (def.fireModes().size() > 1) {
				send(GunActionPayload.Action.FIRE_MODE);
				GunSounds.playLocal(ModSounds.FIRE_MODE, 0.6f, 1.0f);
			}
		}
		while (Keybinds.AMMO_TYPE.consumeClick()) {
			send(GunActionPayload.Action.AMMO_TYPE);
		}
		while (Keybinds.MELEE.consumeClick()) {
			if (melee < 0 && runner == null && ClientGunData.settings().meleeBash()) {
				melee = 0;
				send(GunActionPayload.Action.MELEE);
			}
		}
		while (Keybinds.INSPECT.consumeClick()) {
			if (inspect < 0 && runner == null && ads < 0.1f) {
				inspect = 0;
				send(GunActionPayload.Action.INSPECT);
				GunSounds.playLocal(ModSounds.INSPECT, 0.5f, 1.0f);
			}
		}
		handleNonWeaponKeys(mc);
		if (ClientConfig.get().toggleAim) {
			while (mc.options.keyUse.consumeClick()) {
				aimToggled = !aimToggled;
			}
		} else {
			aimToggled = false;
		}
		boolean aimWanted = aimingIntent();
		if (aimWanted != aimSent) {
			send(aimWanted ? GunActionPayload.Action.AIM_START : GunActionPayload.Action.AIM_STOP);
			aimSent = aimWanted;
		}
		if (aimWanted && player.isSprinting()) {
			player.setSprinting(false);
		}
		if (bloom > 0 && clock - lastShotClock > 3) {
			bloom = Math.max(0, bloom - 0.15f);
		}
	}

	private void handleNonWeaponKeys(Minecraft mc) {
		while (Keybinds.SETTINGS.consumeClick()) {
			mc.setScreen(new dev.calibercraft.client.screen.SettingsScreen(mc.screen));
		}
	}

	private void updateHeld(LocalPlayer player) {
		int slot = player.getInventory().getSelectedSlot();
		ItemStack stack = player.getMainHandItem();
		boolean same = slot == heldSlot && ItemStack.isSameItem(stack, heldStack);
		heldStack = stack;
		if (!same) {
			heldSlot = slot;
			onSwitch(player);
		}
		CaliberData data = ClientGunData.data();
		Optional<WeaponDefinition> d = WeaponStacks.definition(stack, data);
		if (d.isPresent()) {
			def = d.get();
			weaponId = WeaponStacks.weaponId(stack).orElse(null);
			stats = WeaponStacks.stats(def, WeaponStacks.loadout(stack), WeaponStacks.activeAmmo(predicted(), def, data), data);
		} else {
			def = null;
			stats = null;
			weaponId = null;
		}
	}

	private void onSwitch(LocalPlayer player) {
		if (runner != null) {
			runner.cancel();
			runner = null;
		}
		override = null;
		pending.clear();
		equip = 0;
		ads = 0;
		inspect = -1;
		melee = -1;
		burstRemaining = 0;
		bloom = 0;
		aimToggled = false;
		if (WeaponStacks.isFirearm(player.getMainHandItem())) {
			WeaponStacks.weaponId(player.getMainHandItem()).ifPresent(id -> {
				var d = ClientGunData.data().weapon(id);
				d.ifPresent(def -> GunSounds.playWeaponCue(id, def, "equip", 0.6f));
			});
		}
	}

	private void reset() {
		heldStack = ItemStack.EMPTY;
		heldSlot = -1;
		def = null;
		stats = null;
		runner = null;
		override = null;
		pending.clear();
		aimSent = false;
	}

	// ------------------------------------------------------------------------------------------------ frames

	/** Called once per rendered frame with the elapsed game ticks. */
	public void frame(Minecraft mc, float dt) {
		LocalPlayer player = mc.player;
		if (player == null || mc.level == null) {
			return;
		}
		dt = Math.max(0, Math.min(dt, 5));
		clock += dt;
		if (!active()) {
			applyCameraRecoil(player, dt);
			return;
		}
		equip = Math.min(1, equip + dt / (float) Math.max(1, stats.get(Stat.EQUIP_TIME)));
		float adsTicks = (float) Math.max(1, stats.get(Stat.ADS_TIME));
		ads = aimingIntent() ? Math.min(1, ads + dt / adsTicks) : Math.max(0, ads - dt / (adsTicks * 0.8f));
		boolean sprinting = player.isSprinting() && ads < 0.2f;
		sprint = Mth.clamp(sprint + (sprinting ? dt : -dt) / 4f, 0, 1);
		if (inspect >= 0) {
			inspect += dt;
			if (inspect > 60 || ads > 0.05f || runner != null) {
				inspect = -1;
			}
		}
		melee = melee >= 0 ? (melee + dt > 10 ? -1 : melee + dt) : -1;
		dryFire = dryFire >= 0 ? (dryFire + dt > 6 ? -1 : dryFire + dt) : -1;
		overheatAnim = overheatAnim >= 0 ? (overheatAnim + dt > 30 ? -1 : overheatAnim + dt) : -1;
		recoilKick = Math.max(0, recoilKick - dt * 0.35f);
		shake = Math.max(0, shake - dt * 0.25f);

		if (runner != null) {
			ReloadRunner r = runner;
			r.advance(dt, new ClientListener());
			if (r.done() && runner == r) {
				runner = null;
			}
		}
		handleTrigger(mc, player);
		applyCameraRecoil(player, dt);
	}

	private boolean triggerDown(Minecraft mc) {
		return mc.screen == null && mc.options.keyAttack.isDown() && mc.getOverlay() == null;
	}

	private void handleTrigger(Minecraft mc, LocalPlayer player) {
		boolean down = triggerDown(mc);
		boolean pressed = down && !triggerWasDown;
		triggerWasDown = down;
		if (pressed) {
			pullId++;
			semiConsumed = false;
			burstShots = 0;
			if (player.isSprinting()) {
				player.setSprinting(false);
			}
			inspect = -1;
		}
		long now = System.nanoTime();
		GunState s = predicted();
		ActionType action = def.action();
		FireMode mode = def.fireMode(s.fireMode());

		if (pressed && runner != null) {
			if (runner.kind() == ReloadRunner.Kind.SINGLE && !AmmoLogic.canFire(s, action)) {
				runner.requestStop();
				send(GunActionPayload.Action.CANCEL_RELOAD);
				return;
			}
			if (!runner.interruptibleByFire() || !AmmoLogic.canFire(s, action)) {
				return;
			}
		}
		if (pressed && AmmoLogic.needsCycle(s, action) && runner == null) {
			startCycle(true);
			return;
		}
		if (pressed && !AmmoLogic.canFire(s, action) && runner == null) {
			dryFire = 0;
			GunSounds.playLocal(ModSounds.DRY_FIRE, 0.7f, 1.0f);
			if (s.total() == 0 && reserve() > 0) {
				tryReload();
			}
			return;
		}
		if (pressed && mode == FireMode.BURST) {
			burstRemaining = def.burstCount();
		}
		boolean wants = switch (mode) {
			case SEMI -> down && !semiConsumed;
			case BURST -> burstRemaining > 0;
			case AUTO -> down;
		};
		if (!wants) {
			return;
		}
		if (nextShotNanos < now - (long) (stats.shotIntervalSeconds() * 1e9)) {
			nextShotNanos = now;
		}
		int fired = 0;
		while (now >= nextShotNanos && fired < MAX_SHOTS_PER_FRAME) {
			if (!canShoot(player)) {
				return;
			}
			fire(player);
			fired++;
			nextShotNanos += (long) (stats.shotIntervalSeconds() * 1e9);
			if (mode == FireMode.SEMI) {
				semiConsumed = true;
				return;
			}
			if (mode == FireMode.BURST && --burstRemaining <= 0) {
				return;
			}
		}
	}

	private boolean canShoot(LocalPlayer player) {
		if (equip < 1 || sprint > 0.35f || player.isSpectator()) {
			return false;
		}
		GunState s = predicted();
		if (!AmmoLogic.canFire(s, def.action())) {
			return false;
		}
		if (ClientGunData.settings().weaponHeat() && heat() > 0 && HeatModel.locked(s, player.level().getGameTime(),
			stats.get(Stat.HEAT_COOLING))) {
			return false;
		}
		if (runner != null) {
			if (!runner.interruptibleByFire()) {
				return false;
			}
			runner.cancel();
			runner = null;
		}
		return true;
	}

	private void fire(LocalPlayer player) {
		seq++;
		pending.addLast(seq);
		float spread = currentSpread();
		float yaw = player.getYRot();
		float pitch = player.getXRot();
		ClientPlayNetworking.send(new FirePayload(seq, pullId, yaw, pitch, spread, heldSlot));

		long seed = Ballistics.shotSeed(ClientGunData.shotSalt(), seq);
		boolean suppressed = hasFlag("suppressed");
		ClientEffects.ownShot(player, weaponId, def, stats, yaw, pitch, spread, seed, suppressed);

		shotsFired++;
		lastShotClock = clock;
		lastShotNanos = System.nanoTime();
		bloom = (float) Math.min(stats.get(Stat.SPREAD_BLOOM_MAX), bloom + stats.get(Stat.SPREAD_BLOOM));
		addRecoil(player);
		if (def.action().manualCycle()) {
			startCycle(false);
		}
		if (ClientGunData.settings().weaponHeat() && stats.get(Stat.HEAT_PER_SHOT) > 0) {
			GunState after = HeatModel.afterShot(predicted(), player.level().getGameTime(), stats.get(Stat.HEAT_PER_SHOT),
				stats.get(Stat.HEAT_COOLING));
			if (after.overheated()) {
				overheatAnim = 0;
			}
		}
	}

	private void addRecoil(LocalPlayer player) {
		ClientConfig cfg = ClientConfig.get();
		float v = stats.f(Stat.RECOIL_VERTICAL);
		float h = stats.f(Stat.RECOIL_HORIZONTAL);
		float mult = 1.0f - 0.15f * ads;
		if (player.isShiftKeyDown()) {
			mult *= 0.85f;
		}
		if (bipodActive()) {
			mult *= 0.4f;
		}
		// The first shots of a string climb a bit less, so taps stay accurate.
		float string = Mth.clamp((clock - lastShotClock) > 6 ? 0.7f : 1.0f, 0, 1);
		pendingPitch += v * mult * string * cfg.cameraRecoil;
		pendingYaw += (random.nextFloat() * 2 - 1) * h * mult * cfg.cameraRecoil;
		recoilKick = Math.min(2.5f, recoilKick + 0.5f + v * 0.12f);
		if (!cfg.reducedMotion) {
			shake = Math.min(1.5f, shake + 0.15f + v * 0.04f);
		}
	}

	private void applyCameraRecoil(LocalPlayer player, float dt) {
		float dtSec = dt / 20f;
		if (Math.abs(pendingPitch) > 1e-4f || Math.abs(pendingYaw) > 1e-4f) {
			float k = 1 - (float) Math.exp(-dtSec / 0.03);
			float dp = pendingPitch * k;
			float dy = pendingYaw * k;
			pendingPitch -= dp;
			pendingYaw -= dy;
			turn(player, dy, -dp);
			float recovery = stats == null ? 0.7f : stats.f(Stat.RECOIL_RECOVERY);
			recoverable += dp * recovery;
		}
		if (recoverable > 1e-3f && System.nanoTime() - lastShotNanos > 120_000_000L) {
			float r = recoverable * (1 - (float) Math.exp(-dtSec / 0.14));
			recoverable -= r;
			turn(player, 0, r);
		}
	}

	/** Rotates the view like mouse input does (keeps interpolation consistent). Degrees. */
	private static void turn(LocalPlayer player, float yawDeg, float pitchDeg) {
		player.turn(yawDeg / 0.15, pitchDeg / 0.15);
	}

	/** Called when the player moves the mouse: recoil the player already compensated must not be "recovered" again. */
	public void onMouseTurn(double pitchDelta) {
		if (pitchDelta > 0 && recoverable > 0) {
			recoverable = Math.max(0, recoverable - (float) pitchDelta * 0.15f);
		}
	}

	// ------------------------------------------------------------------------------------------------ actions

	private void tryReload() {
		if (runner != null) {
			return;
		}
		GunState s = predicted();
		CaliberData data = ClientGunData.data();
		Optional<Identifier> selected = WeaponStacks.selectedAmmo(s, def, data);
		WeaponStats st = WeaponStacks.stats(def, WeaponStacks.loadout(heldStack), selected, data);
		int cap = st.i(Stat.MAGAZINE);
		if (!AmmoLogic.canReload(s, cap, reserveOf(selected))) {
			return;
		}
		ReloadSpec spec = def.reload();
		ReloadRunner.Kind kind = AmmoLogic.chooseReload(spec.type(), def.action(), s);
		startReload(kind, st.get(Stat.RELOAD_SPEED));
		send(GunActionPayload.Action.RELOAD);
	}

	private void startReload(ReloadRunner.Kind kind, double speed) {
		ReloadSpec spec = def.reload();
		inspect = -1;
		if (kind == ReloadRunner.Kind.SINGLE) {
			spec.single().ifPresent(sp -> runner = ReloadRunner.single(sp, speed));
		} else {
			runner = ReloadRunner.timeline(kind, kind == ReloadRunner.Kind.TACTICAL ? spec.tactical() : spec.empty(), speed);
		}
	}

	private void startCycle(boolean request) {
		runner = ReloadRunner.timeline(ReloadRunner.Kind.CYCLE, def.cycle(), 1.0);
		if (request) {
			send(GunActionPayload.Action.CYCLE);
		}
	}

	private void send(GunActionPayload.Action action) {
		if (Minecraft.getInstance().getConnection() != null) {
			ClientPlayNetworking.send(new GunActionPayload(action, heldSlot));
		}
	}

	public void sendGunsmith(GunsmithPayload payload) {
		ClientPlayNetworking.send(payload);
	}

	public void onFeedback(GunFeedbackPayload p) {
		switch (p.kind()) {
			case RELOAD_DENIED, RELOAD_CANCELLED -> {
				if (runner != null && runner.kind() != ReloadRunner.Kind.CYCLE) {
					runner.cancel();
					runner = null;
				}
				override = null;
			}
			case RELOAD_STARTED -> {
				if (runner == null && active()) {
					ReloadRunner.Kind kind = ReloadRunner.Kind.values()[Math.floorMod(p.value(), ReloadRunner.Kind.values().length)];
					startReload(kind, stats.get(Stat.RELOAD_SPEED));
				}
			}
			case CYCLE_STARTED -> {
				if (runner == null && active()) {
					startCycle(false);
				}
			}
			case SHOT_REJECTED -> pending.remove(p.value());
			case OVERHEATED -> overheatAnim = 0;
			case GUNSMITH_RESULT -> dev.calibercraft.client.screen.GunsmithScreen.onResult(p.value());
		}
	}

	/** Mirrors server commits so the HUD and fire permission update without waiting for the server. */
	private final class ClientListener implements ReloadRunner.Listener {
		private GunState base() {
			GunState s = predicted();
			return s.withLastSeq(Math.max(seq, s.lastSeq()));
		}

		private void setOverride(GunState s) {
			override = s;
			overrideNanos = System.nanoTime();
		}

		@Override
		public void cue(String name) {
			GunSounds.playWeaponCue(weaponId, def, name, 0.7f);
			if ("eject".equals(name) || "pump_back".equals(name) || "bolt_back".equals(name)) {
				ClientEffects.ejectForCue(weaponId, def, name);
			}
		}

		@Override
		public void commit() {
			GunState s = base();
			Optional<Identifier> sel = WeaponStacks.selectedAmmo(s, def, ClientGunData.data());
			int cap = WeaponStacks.stats(def, WeaponStacks.loadout(heldStack), sel, ClientGunData.data()).i(Stat.MAGAZINE);
			setOverride(AmmoLogic.commitMagazine(s, cap, reserveOf(sel), sel).state().nextAction());
		}

		@Override
		public void chamber() {
			setOverride(AmmoLogic.cycle(base()).nextAction());
		}

		@Override
		public boolean loadRound() {
			GunState s = base();
			Optional<Identifier> sel = WeaponStacks.selectedAmmo(s, def, ClientGunData.data());
			if (reserveOf(sel) <= 0) {
				return false;
			}
			if (AmmoLogic.isSwitchingAmmo(s)) {
				s = s.withRounds(0).withChambered(false).withLoadedAmmo(sel);
			}
			GunState loaded = AmmoLogic.loadOne(s, WeaponStacks.stats(def, WeaponStacks.loadout(heldStack), sel, ClientGunData.data())
				.i(Stat.MAGAZINE));
			if (loaded == null) {
				return false;
			}
			setOverride(loaded.withLoadedAmmo(sel).nextAction());
			return true;
		}

		@Override
		public boolean wantsMoreRounds() {
			GunState s = base();
			Optional<Identifier> sel = WeaponStacks.selectedAmmo(s, def, ClientGunData.data());
			int cap = WeaponStacks.stats(def, WeaponStacks.loadout(heldStack), sel, ClientGunData.data()).i(Stat.MAGAZINE);
			return (AmmoLogic.isSwitchingAmmo(s) || s.rounds() < cap) && reserveOf(sel) > 0;
		}

		@Override
		public boolean needsChamber() {
			return !base().chambered();
		}
	}

	public List<Integer> pendingShots() {
		return List.copyOf(pending);
	}
}
