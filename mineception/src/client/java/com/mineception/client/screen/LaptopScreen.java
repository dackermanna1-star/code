package com.mineception.client.screen;

import com.mineception.block.LaptopBlockEntity;
import com.mineception.client.render.DreamSession;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniInput;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.render.Camera;
import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.Window;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * The laptop: play the Minecraft that runs on it, and dive into the laptops inside it.
 *
 * <p>A laptop is drawn around a 16:10 monitor that shows the current dream level, rendered every frame by the
 * {@link DreamSession} into a texture sized to the monitor. Clicking the monitor captures the mouse for looking
 * around; the player's own movement keys walk the avatar, left click breaks, right click places the selected block or,
 * on the level's laptop, dives one level deeper with the camera flying into its screen. Esc pulls back out one level
 * (or closes the laptop at Level 1), and falling out of a level gives "the kick" back up.
 *
 * <p>A few public methods (depth, transitions, the block in view, a programmatic dive) exist for the client game test.
 */
public class LaptopScreen extends Screen {
	/** Vertical field of view of the monitor, the same as the pictures on the dream laptops so a dive is seamless. */
	public static final float FOV = DiveCamera.FOV;
	/** Ticks the camera takes to fly into a laptop screen. */
	public static final int DIVE_TICKS = 34;
	/** Ticks the camera takes to pull back out of a laptop screen. */
	public static final int EXIT_TICKS = 26;
	/** Ticks of the faster pull-out after a kick. */
	public static final int KICK_TICKS = 16;

	/** Largest picture rendered for the monitor (16:10). */
	private static final int MAX_TEXTURE_WIDTH = 424;
	private static final int MIN_TEXTURE_WIDTH = 64;
	private static final int FLASH_TICKS = 14;
	private static final int TITLE_TICKS = 80;
	private static final int MESSAGE_TICKS = 50;
	private static final int BREAK_REPEAT_TICKS = 5;
	private static final int PLACE_REPEAT_TICKS = 4;
	/** The laptop closes when the player gets farther than this from it (the server's edit range). */
	private static final double MAX_DISTANCE = 8.0;
	/** How long "signal lost" is shown before a removed laptop's screen closes. */
	private static final int GONE_CLOSE_TICKS = 30;
	private static final Identifier CROSSHAIR_SPRITE = Identifier.withDefaultNamespace("hud/crosshair");
	private static final Identifier HOTBAR_SPRITE = Identifier.withDefaultNamespace("hud/hotbar");
	private static final Identifier HOTBAR_SELECTION_SPRITE = Identifier.withDefaultNamespace("hud/hotbar_selection");

	/** The hotbar slot is remembered between laptops and openings, like the real hotbar. */
	private static int selectedSlot;
	/** The first-time hint (how to free the mouse and go back up) is shown once per game session. */
	private static boolean hintShown;

	private enum Kind {
		DIVE,
		EXIT,
		KICK
	}

	/** A camera flight between two levels. Dives render the level being left; exits render the level being entered. */
	private static final class Transition {
		final Kind kind;
		final int from;
		final int to;
		final int duration;
		/** The route, planned when the transition starts: from the avatar's eyes into the screen of the level it is in. */
		final DiveCamera.Flight flight;
		int ticks;

		Transition(Kind kind, int from, int to, int duration, DiveCamera.Flight flight) {
			this.kind = kind;
			this.from = from;
			this.to = to;
			this.duration = duration;
			this.flight = flight;
		}

		float progress(float partialTick) {
			return Math.min(1.0F, (ticks + partialTick) / duration);
		}
	}

	private final BlockPos pos;
	private final MonitorTexture monitor = new MonitorTexture();
	private final ItemStack[] hotbarIcons = new ItemStack[MiniBlock.HOTBAR.size()];
	private final Map<MiniBlock, SoundType> blockSounds = new EnumMap<>(MiniBlock.class);
	private LaptopFrame.Layout layout = LaptopFrame.layout(320, 240);
	private @Nullable DreamSession session;
	private int depth = 1;
	private @Nullable Transition transition;
	/** The camera of the last frame that showed the controlled avatar's view (where a dive starts from). */
	private @Nullable Camera lastCamera;
	private int lastCameraDepth;
	private int ticks;
	private int goneTicks;

	// Mouse
	private boolean captured;
	private double lastMouseX;
	private double lastMouseY;
	private double scrollAccumulator;

	// Keys held (tracked from key events, since key mappings are not updated while a screen is open)
	private boolean keyForward;
	private boolean keyBack;
	private boolean keyLeft;
	private boolean keyRight;
	private boolean keyJump;
	private boolean keySprint;
	private boolean keySneak;
	private boolean sprintToggled;
	private boolean sneakToggled;
	private boolean sprinting;
	private boolean attackHeld;
	private boolean useHeld;
	private int attackRepeat;
	private int useRepeat;

	// Feel: view bobbing, sprint field of view, steps, hand swing
	private float walkDist;
	private float walkDistO;
	private float bob;
	private float bobO;
	private float nextStep = 1.0F;
	private float fovModifier = 1.0F;
	private float fovModifierO = 1.0F;
	private int swingTicks;
	private int equipTicks;

	// Overlays
	private int flashTicks;
	private int flashColor = 0xFFFFFF;
	private int shakeTicks;
	private int kickTicks;
	private int titleTicks;
	private int titleDepth = 1;
	private @Nullable Component message;
	private int messageTicks;
	private int messageColor = 0xFFFFFF;
	private int hintTicks;
	private int glowRgb = 0x6080B0;

	// Adaptive resolution: drop the monitor resolution when rendering gets slow, raise it again when there is time
	private float resolutionScale = 1.0F;
	private double renderMillis = 8.0;
	private long lastResolutionChange;

	public LaptopScreen(BlockPos pos) {
		super(Component.translatable("screen.mineception.laptop"));
		this.pos = pos.immutable();
		for (int i = 0; i < hotbarIcons.length; i++) {
			hotbarIcons[i] = iconOf(MiniBlock.HOTBAR.get(i));
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Screen lifecycle

	@Override
	protected void init() {
		layout = LaptopFrame.layout(width, height);
		if (ticks == 0 && titleTicks == 0) {
			titleDepth = depth;
			titleTicks = TITLE_TICKS;
		}
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void onClose() {
		minecraft.setScreen(null);
	}

	@Override
	public void removed() {
		if (captured) {
			captured = false;
			Window window = minecraft.getWindow();
			InputConstants.grabOrReleaseMouse(window, GLFW.GLFW_CURSOR_NORMAL, window.getScreenWidth() / 2.0, window.getScreenHeight() / 2.0);
		}
		releaseKeys();
		DreamSession current = DreamSession.get(pos);
		if (current != null) {
			current.setControlledDepth(0);
		}
		monitor.release();
	}

	@Override
	public void tick() {
		ticks++;
		tickOverlays();
		LocalPlayer player = minecraft.player;
		if (player == null || minecraft.level == null) {
			return;
		}
		if (!(minecraft.level.getBlockEntity(pos) instanceof LaptopBlockEntity)) {
			// The laptop was broken or unloaded: show the static for a moment, then close
			if (goneTicks++ == 0) {
				transition = null;
				showMessage(Component.translatable("screen.mineception.signal_lost"), 0xFF8080);
			}
			session = null;
			if (goneTicks >= GONE_CLOSE_TICKS) {
				onClose();
			}
			return;
		}
		goneTicks = 0;
		if (player.distanceToSqr(Vec3.atCenterOf(pos)) > MAX_DISTANCE * MAX_DISTANCE) {
			onClose();
			return;
		}
		session = DreamSession.get(pos);
		if (session == null) {
			transition = null;
			return;
		}
		if (transition != null) {
			session.setControlledDepth(transition.kind == Kind.DIVE ? transition.from : transition.to);
			tickTransition(session);
			return;
		}
		session.setControlledDepth(depth);
		tickAvatar(session);
	}

	private void tickOverlays() {
		if (flashTicks > 0) {
			flashTicks--;
		}
		if (shakeTicks > 0) {
			shakeTicks--;
		}
		if (kickTicks > 0) {
			kickTicks--;
		}
		if (titleTicks > 0) {
			titleTicks--;
		}
		if (messageTicks > 0) {
			messageTicks--;
		}
		if (hintTicks > 0) {
			hintTicks--;
		}
		if (swingTicks > 0) {
			swingTicks--;
		}
		if (equipTicks > 0) {
			equipTicks--;
		}
		fovModifierO = fovModifier;
		walkDistO = walkDist;
		bobO = bob;
	}

	/** One tick of the avatar the player controls: movement, held mouse buttons, steps and the kick. */
	private void tickAvatar(DreamSession session) {
		MiniPlayer avatar = session.avatar(depth);
		MiniWorld world = session.world(depth);
		boolean sneak = keySneak || sneakToggled;
		boolean sprintWanted = keySprint || sprintToggled;
		if (!keyForward || keyBack || sneak) {
			sprinting = false;
		} else if (sprintWanted) {
			sprinting = true;
		}
		avatar.tick(world, new MiniInput(keyForward, keyBack, keyLeft, keyRight, keyJump, sprinting, sneak));

		double dx = avatar.x - avatar.xo;
		double dz = avatar.z - avatar.zo;
		float moved = (float) Math.sqrt(dx * dx + dz * dz);
		walkDist += moved * 0.6F;
		float bobTarget = avatar.onGround ? Math.min(0.1F, moved) : 0.0F;
		bob += (bobTarget - bob) * 0.4F;
		if (avatar.onGround && !avatar.inWater && walkDist > nextStep) {
			nextStep = walkDist + 1.0F;
			playStep(world, avatar);
		} else if (!avatar.onGround) {
			nextStep = Math.min(nextStep, walkDist + 0.4F);
		}
		float fovTarget = sprinting && moved > 0.01F ? 1.0F + 0.15F * minecraft.options.fovEffectScale().get().floatValue() : 1.0F;
		fovModifier += (fovTarget - fovModifier) * 0.5F;

		if (avatar.fellOut()) {
			kick(session);
			return;
		}
		if (captured && attackHeld && --attackRepeat <= 0) {
			attackRepeat = BREAK_REPEAT_TICKS;
			attack(false);
		}
		if (captured && useHeld && --useRepeat <= 0) {
			useRepeat = PLACE_REPEAT_TICKS;
			use(false);
		}
	}

	private void tickTransition(DreamSession session) {
		Transition t = transition;
		t.ticks++;
		if (t.ticks < t.duration) {
			return;
		}
		transition = null;
		if (t.kind == Kind.DIVE) {
			arrive(session, t.to);
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Levels: diving in, pulling out, the kick

	/**
	 * Starts flying into the current level's laptop screen. Returns false if that is not possible right now (no
	 * signal, already moving between levels, or this is Limbo).
	 */
	public boolean diveIn() {
		DreamSession current = session != null ? session : DreamSession.get(pos);
		if (current == null || transition != null || depth >= Theme.DEPTHS) {
			return false;
		}
		session = current;
		MiniPlayer avatar = current.avatar(depth);
		Camera start = lastCamera != null && lastCameraDepth == depth ? lastCamera : eyeCamera(avatar, 1.0F);
		freeze(avatar);
		transition = new Transition(Kind.DIVE, depth, depth + 1, DIVE_TICKS, DiveCamera.plan(start, current.world(depth), FOV));
		attackHeld = false;
		useHeld = false;
		play(SoundEvents.ENDERMAN_TELEPORT, 0.5F, 0.35F);
		return true;
	}

	/** Esc: pulls back out to the level above, or closes the laptop at Level 1. */
	public void goUp() {
		if (transition != null) {
			return;
		}
		DreamSession current = session;
		if (depth <= 1 || current == null) {
			onClose();
			return;
		}
		startExit(current, Kind.EXIT);
	}

	private void startExit(DreamSession current, Kind kind) {
		int from = depth;
		int to = depth - 1;
		depth = to;
		MiniPlayer avatar = current.avatar(to);
		freeze(avatar);
		current.setControlledDepth(to);
		attackHeld = false;
		useHeld = false;
		// The flight ends on the avatar's plain view: no bobbing or sprint field of view to jump from afterwards
		sprinting = false;
		bob = bobO = 0.0F;
		fovModifier = fovModifierO = 1.0F;
		DiveCamera.Flight flight = DiveCamera.plan(eyeCamera(avatar, 1.0F), current.world(to), FOV);
		transition = new Transition(kind, from, to, kind == Kind.KICK ? KICK_TICKS : EXIT_TICKS, flight);
		titleDepth = to;
		titleTicks = TITLE_TICKS;
		if (kind == Kind.KICK) {
			flash(0xFFE0D0, FLASH_TICKS);
			shakeTicks = 12;
			kickTicks = 30;
			play(SoundEvents.PLAYER_ATTACK_KNOCKBACK, 0.8F, 1.0F);
			play(SoundEvents.RAID_HORN.value(), 0.62F, 0.8F);
		} else {
			flash(0xFFFFFF, FLASH_TICKS / 2);
			play(SoundEvents.RAID_HORN.value(), 0.8F, 0.55F);
		}
	}

	/** Falling out of a level: reset the avatar there and wake up one level higher. */
	private void kick(DreamSession current) {
		MiniPlayer avatar = current.avatar(depth);
		avatar.reset(current.world(depth));
		if (depth <= 1) {
			// Kicked out of the first dream: back to the real world
			play(SoundEvents.PLAYER_ATTACK_KNOCKBACK, 0.8F, 1.0F);
			play(SoundEvents.RAID_HORN.value(), 0.62F, 0.8F);
			if (minecraft.player != null) {
				minecraft.player.displayClientMessage(Component.translatable("screen.mineception.woke_up").withStyle(ChatFormatting.GOLD), true);
			}
			onClose();
			return;
		}
		startExit(current, Kind.KICK);
	}

	/** The camera has reached the laptop screen: the next level takes over the monitor. */
	private void arrive(DreamSession current, int to) {
		depth = to;
		current.setControlledDepth(to);
		MiniPlayer avatar = current.avatar(to);
		MiniWorld world = current.world(to);
		if (avatar.fellOut()) {
			avatar.reset(world);
		}
		freeze(avatar);
		flash(0xFFFFFF, FLASH_TICKS);
		shakeTicks = 10;
		titleDepth = to;
		titleTicks = TITLE_TICKS;
		// The dive ended on exactly the picture this level starts with: no sprint FOV or bobbing to jump from
		walkDist = walkDistO = 0.0F;
		bob = bobO = 0.0F;
		fovModifier = fovModifierO = 1.0F;
		sprinting = false;
		nextStep = 1.0F;
		// BWAAAM
		play(SoundEvents.RAID_HORN.value(), 0.5F, 1.0F);
	}

	private static void freeze(MiniPlayer avatar) {
		avatar.vx = 0.0;
		avatar.vz = 0.0;
		avatar.xo = avatar.x;
		avatar.yo = avatar.y;
		avatar.zo = avatar.z;
		avatar.yawO = avatar.yaw;
		avatar.pitchO = avatar.pitch;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Breaking, placing, using

	/** The block the controlled avatar is looking at, or null. */
	public @Nullable MiniHit lookingAt() {
		if (session == null || transition != null) {
			return null;
		}
		return session.avatar(depth).pick(session.world(depth), MiniPlayer.REACH);
	}

	private void attack(boolean firstClick) {
		swing();
		MiniHit hit = lookingAt();
		if (hit == null || session == null) {
			return;
		}
		if (hit.isLaptop()) {
			if (firstClick) {
				showMessage(Component.translatable("screen.mineception.dive_hint"), 0xFFFFA0);
			}
			return;
		}
		if (!hit.block().breakable()) {
			if (firstClick) {
				showMessage(Component.translatable("screen.mineception.unbreakable"), 0xFFB0B0);
			}
			return;
		}
		if (session.edit(depth, hit.x(), hit.y(), hit.z(), MiniBlock.AIR)) {
			playBlockSound(hit.block(), false);
		}
	}

	private void use(boolean firstClick) {
		MiniHit hit = lookingAt();
		if (hit == null || session == null) {
			return;
		}
		MiniWorld world = session.world(depth);
		if (hit.isLaptop() && world.hasLaptopAt(hit.x(), hit.y(), hit.z())) {
			if (!firstClick) {
				return;
			}
			if (depth >= Theme.DEPTHS) {
				showMessage(Component.translatable("screen.mineception.cant_go_deeper"), 0xFFA060);
				play(SoundEvents.FIRE_EXTINGUISH, 1.7F, 0.25F);
			} else {
				diveIn();
			}
			return;
		}
		MiniBlock block = MiniBlock.HOTBAR.get(selectedSlot);
		if (session.edit(depth, hit.placeX(), hit.placeY(), hit.placeZ(), block)) {
			swing();
			playBlockSound(block, true);
		}
	}

	private void pickBlock() {
		MiniHit hit = lookingAt();
		if (hit != null) {
			int slot = MiniBlock.HOTBAR.indexOf(hit.block());
			if (slot >= 0) {
				selectSlot(slot);
			}
		}
	}

	private void selectSlot(int slot) {
		int wrapped = Math.floorMod(slot, MiniBlock.HOTBAR.size());
		if (wrapped != selectedSlot) {
			selectedSlot = wrapped;
			equipTicks = 4;
		}
	}

	private void swing() {
		if (swingTicks <= 2) {
			swingTicks = 6;
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Input

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.isEscape()) {
			goUp();
			return true;
		}
		if (event.key() == GLFW.GLFW_KEY_TAB) {
			releaseMouse();
			return true;
		}
		Options options = minecraft.options;
		for (int i = 0; i < options.keyHotbarSlots.length && i < MiniBlock.HOTBAR.size(); i++) {
			if (options.keyHotbarSlots[i].matches(event)) {
				selectSlot(i);
				return true;
			}
		}
		if (movementKey(key -> key.matches(event), true)) {
			return true;
		}
		if (transition == null && captured) {
			if (options.keyAttack.matches(event)) {
				attackHeld = true;
				attackRepeat = BREAK_REPEAT_TICKS;
				attack(true);
				return true;
			}
			if (options.keyUse.matches(event)) {
				useHeld = true;
				useRepeat = PLACE_REPEAT_TICKS;
				use(true);
				return true;
			}
			if (options.keyPickItem.matches(event)) {
				pickBlock();
				return true;
			}
		}
		return super.keyPressed(event);
	}

	@Override
	public boolean keyReleased(KeyEvent event) {
		Options options = minecraft.options;
		if (options.keyAttack.matches(event)) {
			attackHeld = false;
		}
		if (options.keyUse.matches(event)) {
			useHeld = false;
		}
		if (movementKey(key -> key.matches(event), false)) {
			return true;
		}
		return super.keyReleased(event);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (!captured) {
			if (layout.insideMonitor(event.x(), event.y()) && session != null && transition == null) {
				captureMouse();
				return true;
			}
			return super.mouseClicked(event, doubleClick);
		}
		Options options = minecraft.options;
		if (movementKey(key -> key.matchesMouse(event), true)) {
			return true;
		}
		if (transition != null) {
			return true;
		}
		if (options.keyAttack.matchesMouse(event)) {
			attackHeld = true;
			attackRepeat = BREAK_REPEAT_TICKS;
			attack(true);
		} else if (options.keyUse.matchesMouse(event)) {
			useHeld = true;
			useRepeat = PLACE_REPEAT_TICKS;
			use(true);
		} else if (options.keyPickItem.matchesMouse(event)) {
			pickBlock();
		}
		return true;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		Options options = minecraft.options;
		if (options.keyAttack.matchesMouse(event)) {
			attackHeld = false;
		}
		if (options.keyUse.matchesMouse(event)) {
			useHeld = false;
		}
		movementKey(key -> key.matchesMouse(event), false);
		return true;
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scrollAccumulator += scrollY;
		int steps = (int) scrollAccumulator;
		if (steps != 0) {
			scrollAccumulator -= steps;
			selectSlot(selectedSlot - steps);
		}
		return true;
	}

	/** Matches a key against the player's movement key mappings and records it as held or released. */
	private boolean movementKey(java.util.function.Predicate<KeyMapping> matches, boolean down) {
		Options options = minecraft.options;
		boolean handled = false;
		if (matches.test(options.keyUp)) {
			keyForward = down;
			handled = true;
		}
		if (matches.test(options.keyDown)) {
			keyBack = down;
			handled = true;
		}
		if (matches.test(options.keyLeft)) {
			keyLeft = down;
			handled = true;
		}
		if (matches.test(options.keyRight)) {
			keyRight = down;
			handled = true;
		}
		if (matches.test(options.keyJump)) {
			keyJump = down;
			handled = true;
		}
		if (matches.test(options.keySprint)) {
			if (options.toggleSprint().get()) {
				if (down) {
					sprintToggled = !sprintToggled;
				}
			} else {
				keySprint = down;
			}
			handled = true;
		}
		if (matches.test(options.keyShift)) {
			if (options.toggleCrouch().get()) {
				if (down) {
					sneakToggled = !sneakToggled;
				}
			} else {
				keySneak = down;
			}
			handled = true;
		}
		return handled;
	}

	private void releaseKeys() {
		keyForward = keyBack = keyLeft = keyRight = keyJump = keySprint = keySneak = false;
		sprinting = false;
		attackHeld = useHeld = false;
	}

	private void captureMouse() {
		if (captured) {
			return;
		}
		Window window = minecraft.getWindow();
		// Keep the cursor where it is: GLFW continues the virtual cursor from here, so the first delta is exact
		double x = minecraft.mouseHandler.xpos();
		double y = minecraft.mouseHandler.ypos();
		InputConstants.grabOrReleaseMouse(window, GLFW.GLFW_CURSOR_DISABLED, x, y);
		lastMouseX = x;
		lastMouseY = y;
		captured = true;
		if (!hintShown) {
			hintShown = true;
			hintTicks = 140;
		}
		play(SoundEvents.UI_BUTTON_CLICK.value(), 1.0F, 0.25F);
	}

	/** Gives the mouse back (Tab). */
	public void releaseMouse() {
		if (!captured) {
			return;
		}
		captured = false;
		attackHeld = false;
		useHeld = false;
		double[] center = monitorCenterInWindow();
		InputConstants.grabOrReleaseMouse(minecraft.getWindow(), GLFW.GLFW_CURSOR_NORMAL, center[0], center[1]);
	}

	/** Turns the controlled avatar by the mouse movement since the last frame, like the player's own view. */
	private void applyMouseLook() {
		double x = minecraft.mouseHandler.xpos();
		double y = minecraft.mouseHandler.ypos();
		double dx = x - lastMouseX;
		double dy = y - lastMouseY;
		lastMouseX = x;
		lastMouseY = y;
		if (!captured || transition != null || session == null || dx == 0.0 && dy == 0.0) {
			return;
		}
		Options options = minecraft.options;
		double s = options.sensitivity().get() * 0.6 + 0.2;
		double scale = s * s * s * 8.0 * 0.15;
		double yaw = dx * scale * (options.invertMouseX().get() ? -1 : 1);
		double pitch = dy * scale * (options.invertMouseY().get() ? -1 : 1);
		MiniPlayer avatar = session.avatar(depth);
		avatar.yaw += (float) yaw;
		avatar.pitch = Mth.clamp(avatar.pitch + (float) pitch, -90.0F, 90.0F);
	}

	// ------------------------------------------------------------------------------------------------------------
	// Rendering

	@Override
	public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float delta) {
		graphics.fillGradient(0, 0, width, height, 0xE00C0E12, 0xF0050608);
		minecraft.gui.renderDeferredSubtitles();
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float delta) {
		float partialTick = minecraft.getDeltaTracker().getGameTimeDeltaPartialTick(true);
		if (minecraft.level != null && minecraft.level.getBlockEntity(pos) instanceof LaptopBlockEntity) {
			session = DreamSession.get(pos);
		} else {
			session = null;
		}
		applyMouseLook();
		renderPicture(partialTick);

		LaptopFrame.Layout l = layout;
		LaptopFrame.drawGlow(graphics, l, glowRgb);
		LaptopFrame.draw(graphics, font, l, captured, Component.translatable("screen.mineception.brand"), ticks);

		graphics.enableScissor(l.monX(), l.monY(), l.monX() + l.monW(), l.monY() + l.monH());
		graphics.pose().pushMatrix();
		if (shakeTicks > 0) {
			float amount = shakeTicks / 10.0F;
			float strength = 2.5F * amount * amount;
			graphics.pose().translate((float) Math.sin((ticks + partialTick) * 2.7) * strength,
				(float) Math.cos((ticks + partialTick) * 3.3) * strength);
		}
		graphics.blit(monitor.id(), l.monX(), l.monY(), l.monX() + l.monW(), l.monY() + l.monH(), 0.0F, 1.0F, 0.0F, 1.0F);
		graphics.pose().popMatrix();
		renderHud(graphics, partialTick);
		graphics.disableScissor();

		renderBreadcrumbs(graphics);
		super.render(graphics, mouseX, mouseY, delta);
	}

	/** Renders the current level (or static) into the monitor texture. */
	private void renderPicture(float partialTick) {
		Window window = minecraft.getWindow();
		int pixelWidth = layout.monW() * window.getGuiScale();
		int texWidth = (int) Math.min(MAX_TEXTURE_WIDTH, pixelWidth * resolutionScale);
		texWidth = Math.max(MIN_TEXTURE_WIDTH, texWidth / 8 * 8);
		int texHeight = texWidth * 5 / 8;
		monitor.ensureSize(texWidth, texHeight);
		int[] pixels = monitor.pixels();

		DreamSession current = session;
		if (current == null) {
			drawStatic(pixels, texWidth, texHeight, ticks * 31 + (int) (partialTick * 7));
			glowRgb = 0x808890;
		} else {
			Camera camera = currentCamera(current, partialTick);
			if (transition == null) {
				lastCamera = camera;
				lastCameraDepth = depth;
			} else {
				lastCamera = null;
			}
			MiniHit highlight = transition == null ? lookingAt() : null;
			long start = System.nanoTime();
			current.render(depth, camera, partialTick, highlight, pixels, texWidth, texHeight);
			adaptResolution((System.nanoTime() - start) / 1.0E6);
			glowRgb = averageColor(pixels, texWidth, texHeight);
		}
		monitor.upload();
	}

	private Camera currentCamera(DreamSession current, float partialTick) {
		Transition t = transition;
		if (t != null) {
			float progress = t.progress(partialTick);
			return t.kind == Kind.DIVE ? t.flight.dive(progress) : t.flight.exit(progress);
		}
		return eyeCamera(current.avatar(depth), partialTick);
	}

	/**
	 * The controlled avatar's view: position interpolated between ticks, look direction as of this frame (so the mouse
	 * feels immediate), with Minecraft's view bobbing and sprint field of view.
	 */
	private Camera eyeCamera(MiniPlayer avatar, float partialTick) {
		// The avatar's own eye camera knows the interpolated eye height (lower while sneaking)
		Camera eyes = avatar.eyeCamera(partialTick, FOV);
		double x = eyes.x();
		double y = eyes.y();
		double z = eyes.z();
		float pitch = avatar.pitch;
		if (minecraft.options.bobView().get() && transition == null) {
			float h = Mth.lerp(partialTick, bobO, bob);
			float phase = Mth.lerp(partialTick, walkDistO, walkDist) * Mth.PI;
			double side = Mth.sin(phase) * h * 0.5;
			double yawRad = Math.toRadians(avatar.yaw);
			x += -Math.cos(yawRad) * side;
			z += -Math.sin(yawRad) * side;
			y -= Math.abs(Mth.cos(phase) * h);
			pitch += Math.abs(Mth.cos(phase - 0.2F) * h) * 5.0F;
		}
		float fov = FOV * Mth.lerp(partialTick, fovModifierO, fovModifier);
		return new Camera(x, y, z, avatar.yaw, pitch, fov);
	}

	private void adaptResolution(double millis) {
		renderMillis = renderMillis * 0.9 + millis * 0.1;
		long now = System.currentTimeMillis();
		if (now - lastResolutionChange < 750) {
			return;
		}
		if (renderMillis > 26.0 && resolutionScale > 0.4F) {
			resolutionScale = Math.max(0.4F, resolutionScale * 0.85F);
			lastResolutionChange = now;
		} else if (renderMillis < 11.0 && resolutionScale < 1.0F) {
			resolutionScale = Math.min(1.0F, resolutionScale * 1.1F);
			lastResolutionChange = now;
		}
	}

	private static int averageColor(int[] pixels, int width, int height) {
		long r = 0;
		long g = 0;
		long b = 0;
		int n = 0;
		for (int sy = 0; sy < 6; sy++) {
			int y = (int) ((sy + 0.5) * height / 6);
			for (int sx = 0; sx < 10; sx++) {
				int argb = pixels[y * width + (int) ((sx + 0.5) * width / 10)];
				r += argb >> 16 & 0xFF;
				g += argb >> 8 & 0xFF;
				b += argb & 0xFF;
				n++;
			}
		}
		return (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (b / n);
	}

	/** Chunky animated TV static, with a slowly rolling brighter band. */
	static void drawStatic(int[] pixels, int width, int height, int seed) {
		int cell = Math.max(1, width / 120);
		int band = Math.floorMod(seed / 3, height + 40) - 20;
		for (int y = 0; y < height; y++) {
			int cy = y / cell;
			int bandBoost = Math.abs(y - band) < 10 ? 28 : 0;
			for (int x = 0; x < width; x++) {
				int h = (x / cell) * 73856093 ^ cy * 19349663 ^ seed * 83492791;
				h ^= h >>> 13;
				h *= 0x5BD1E995;
				h ^= h >>> 15;
				int v = 40 + (h & 0x7F) + bandBoost;
				v = Math.min(255, v);
				pixels[y * width + x] = 0xFF000000 | v << 16 | v << 8 | Math.min(255, v + 12);
			}
		}
	}

	private void renderHud(GuiGraphics graphics, float partialTick) {
		LaptopFrame.Layout l = layout;
		DreamSession current = session;
		if (current == null) {
			renderNoSignal(graphics);
			return;
		}
		Transition t = transition;
		if (t == null) {
			renderHand(graphics, partialTick);
			if (captured) {
				graphics.blitSprite(RenderPipelines.CROSSHAIR, CROSSHAIR_SPRITE, l.monCenterX() - 7, l.monCenterY() - 7, 15, 15);
			}
			renderHotbar(graphics);
			renderLevelInfo(graphics, partialTick);
			renderMessage(graphics);
			if (!captured) {
				renderControls(graphics);
			} else if (hintTicks > 0) {
				renderFirstHint(graphics);
			}
		} else if (t.kind == Kind.DIVE) {
			// Whiten toward the end of the fall into the screen
			float p = t.progress(partialTick);
			float white = smoothstep(0.75F, 1.0F, p) * 0.55F;
			fillMonitor(graphics, white, 0xFFFFFF);
		}
		renderTitle(graphics);
		if (flashTicks > 0) {
			float f = (flashTicks - partialTick) / FLASH_TICKS;
			fillMonitor(graphics, Mth.clamp(f, 0.0F, 1.0F), flashColor);
		}
		if (kickTicks > 0) {
			float alpha = Mth.clamp((kickTicks - partialTick) / 12.0F, 0.0F, 1.0F);
			float scale = 3.0F + (30 - kickTicks) * 0.08F;
			drawCentered(graphics, Component.translatable("screen.mineception.kick").withStyle(ChatFormatting.BOLD), l.monCenterX(),
				l.monY() + l.monH() * 0.38F, scale, withAlpha(0xFF4030, alpha));
		}
	}

	private void renderNoSignal(GuiGraphics graphics) {
		LaptopFrame.Layout l = layout;
		int bandH = 26;
		int y = l.monCenterY() - bandH / 2;
		graphics.fill(l.monX(), y, l.monX() + l.monW(), y + bandH, 0xC0000000);
		Component text = goneTicks > 0 ? Component.translatable("screen.mineception.signal_lost") : Component.translatable("screen.mineception.no_signal");
		drawCentered(graphics, text, l.monCenterX(), y + 5, 2.0F, 0xFFFFFFFF);
	}

	private void renderHand(GuiGraphics graphics, float partialTick) {
		LaptopFrame.Layout l = layout;
		float size = Mth.clamp(l.monH() * 0.34F, 24.0F, 110.0F);
		float scale = size / 16.0F;
		float swing = swingTicks > 0 ? (6 - swingTicks + partialTick) / 6.0F : 0.0F;
		float swingArc = Mth.sin(Mth.sqrt(Mth.clamp(swing, 0.0F, 1.0F)) * Mth.PI);
		float equip = equipTicks > 0 ? (equipTicks - partialTick) / 4.0F : 0.0F;
		float phase = Mth.lerp(partialTick, walkDistO, walkDist) * Mth.PI;
		float h = Mth.lerp(partialTick, bobO, bob);
		float x = l.monX() + l.monW() - size * 1.35F - swingArc * size * 0.35F + Mth.sin(phase) * h * size * 0.6F;
		float y = l.monY() + l.monH() - size * 0.78F - swingArc * size * 0.22F + Math.abs(Mth.cos(phase)) * h * size * 0.5F
			+ Mth.clamp(equip, 0.0F, 1.0F) * size * 0.6F;
		graphics.pose().pushMatrix();
		graphics.pose().translate(x + size / 2.0F, y + size / 2.0F);
		graphics.pose().rotate(-0.2F - swingArc * 0.5F);
		graphics.pose().scale(scale, scale);
		graphics.renderFakeItem(hotbarIcons[selectedSlot], -8, -8);
		graphics.pose().popMatrix();
	}

	private void renderHotbar(GuiGraphics graphics) {
		LaptopFrame.Layout l = layout;
		float scale = Math.min(1.0F, (l.monW() - 8) / 182.0F);
		graphics.pose().pushMatrix();
		graphics.pose().translate(l.monCenterX() - 91 * scale, l.monY() + l.monH() - 24 * scale);
		graphics.pose().scale(scale, scale);
		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, HOTBAR_SPRITE, 0, 0, 182, 22);
		graphics.blitSprite(RenderPipelines.GUI_TEXTURED, HOTBAR_SELECTION_SPRITE, -1 + selectedSlot * 20, -1, 24, 23);
		for (int i = 0; i < hotbarIcons.length; i++) {
			graphics.renderFakeItem(hotbarIcons[i], 3 + i * 20, 3);
		}
		graphics.pose().popMatrix();
	}

	private void renderLevelInfo(GuiGraphics graphics, float partialTick) {
		LaptopFrame.Layout l = layout;
		Theme theme = Theme.forDepth(depth);
		int x = l.monX() + 5;
		int y = l.monY() + 5;
		graphics.drawString(font, levelName(depth, false), x, y, 0xFFFFFFFF, true);
		graphics.drawString(font, timeLine(theme, partialTick), x, y + 11, 0xFFB8C0CC, true);
	}

	private Component timeLine(Theme theme, float partialTick) {
		if (theme.timeScale < 0) {
			return Component.translatable("screen.mineception.time_stopped");
		}
		long gameTime = minecraft.level != null ? minecraft.level.getGameTime() : 0L;
		float timeOfDay = theme.timeOfDay(gameTime, partialTick);
		int minutes = (int) ((timeOfDay * 24.0F * 60.0F + 6 * 60) % (24 * 60));
		String clock = String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60);
		return Component.translatable("screen.mineception.time_scale", theme.timeScale).append("  " + clock);
	}

	private void renderMessage(GuiGraphics graphics) {
		if (message == null || messageTicks <= 0) {
			return;
		}
		LaptopFrame.Layout l = layout;
		float alpha = Math.min(1.0F, messageTicks / 10.0F);
		float hotbarTop = l.monY() + l.monH() - 24 * Math.min(1.0F, (l.monW() - 8) / 182.0F);
		drawCentered(graphics, message, l.monCenterX(), hotbarTop - 14, 1.0F, withAlpha(messageColor, alpha));
	}

	/** Big level title when arriving in a level. */
	private void renderTitle(GuiGraphics graphics) {
		if (titleTicks <= 0) {
			return;
		}
		LaptopFrame.Layout l = layout;
		int age = TITLE_TICKS - titleTicks;
		float alpha = Math.min(1.0F, Math.min(age / 8.0F, titleTicks / 20.0F));
		if (alpha <= 0.02F) {
			return;
		}
		Theme theme = Theme.forDepth(titleDepth);
		float big = Mth.clamp(l.monW() / 160.0F, 1.5F, 4.0F);
		float y = l.monY() + l.monH() * 0.22F;
		drawCentered(graphics, Component.translatable("screen.mineception.level_short", titleDepth), l.monCenterX(), y, big, withAlpha(0xFFFFFF, alpha));
		drawCentered(graphics, Component.translatable(theme.translationKey()), l.monCenterX(), y + 10 * big, big * 0.55F,
			withAlpha(0xFFE7A0, alpha));
		Component time = theme.timeScale < 0 ? Component.translatable("screen.mineception.time_stopped")
			: Component.translatable("screen.mineception.time_scale", theme.timeScale);
		drawCentered(graphics, time, l.monCenterX(), y + 10 * big + 11 * big * 0.55F, Math.max(1.0F, big * 0.4F), withAlpha(0xC8D0DC, alpha));
	}

	private void renderControls(GuiGraphics graphics) {
		LaptopFrame.Layout l = layout;
		graphics.fill(l.monX(), l.monY(), l.monX() + l.monW(), l.monY() + l.monH(), 0x90000000);
		Options o = minecraft.options;
		List<Component[]> rows = new ArrayList<>();
		rows.add(row(keys(o.keyUp, o.keyLeft, o.keyDown, o.keyRight), "move"));
		rows.add(row(keys(o.keyJump), "jump"));
		rows.add(row(keys(o.keySprint, o.keyShift), "sprint_sneak"));
		rows.add(row(Component.translatable("screen.mineception.controls.mouse"), "look"));
		rows.add(row(o.keyAttack.getTranslatedKeyMessage(), "break"));
		rows.add(row(o.keyUse.getTranslatedKeyMessage(), "use"));
		rows.add(row(Component.translatable("screen.mineception.controls.slots"), "select"));
		rows.add(row(Component.literal("Tab"), "release"));
		rows.add(row(Component.literal("Esc"), "up"));

		Component header = Component.translatable("screen.mineception.click_to_play");
		int lineH = 11;
		int keyW = 0;
		int actionW = 0;
		for (Component[] r : rows) {
			keyW = Math.max(keyW, font.width(r[0]));
			actionW = Math.max(actionW, font.width(r[1]));
		}
		int contentW = Math.max(font.width(header) * 3 / 2, keyW + 10 + actionW);
		int contentH = 20 + rows.size() * lineH;
		float scale = Math.min(1.0F, Math.min((l.monW() - 12) / (float) contentW, (l.monH() - 12) / (float) contentH));
		float pulse = 0.75F + 0.25F * Mth.sin(ticks * 0.15F);
		graphics.pose().pushMatrix();
		graphics.pose().translate(l.monCenterX(), l.monCenterY() - contentH * scale / 2.0F);
		graphics.pose().scale(scale, scale);
		drawCentered(graphics, header, 0, 0, 1.5F, withAlpha(0xFFE45C, pulse));
		int y = 20;
		for (Component[] r : rows) {
			int left = -(keyW + 10 + actionW) / 2;
			graphics.drawString(font, r[0], left + keyW - font.width(r[0]), y, 0xFFFFE9A8, true);
			graphics.drawString(font, r[1], left + keyW + 10, y, 0xFFDDE3EA, true);
			y += lineH;
		}
		graphics.pose().popMatrix();
	}

	private void renderFirstHint(GuiGraphics graphics) {
		LaptopFrame.Layout l = layout;
		float alpha = Math.min(1.0F, hintTicks / 20.0F);
		Component hint = Component.translatable("screen.mineception.hint");
		int w = font.width(hint);
		int x = l.monX() + l.monW() - w - 5;
		graphics.drawString(font, hint, Math.max(l.monX() + 4, x), l.monY() + 5, withAlpha(0xFFFFFF, alpha), true);
	}

	private void renderBreadcrumbs(GuiGraphics graphics) {
		List<Component> parts = new ArrayList<>();
		parts.add(Component.translatable("screen.mineception.real_world"));
		for (int d = 1; d <= depth; d++) {
			parts.add(levelName(d, false));
		}
		Component separator = Component.literal("  ›  ");
		int total = 0;
		for (Component part : parts) {
			total += font.width(part);
		}
		total += font.width(separator) * (parts.size() - 1);
		if (total > width - 8) {
			// Not enough room: short level names
			parts.subList(1, parts.size()).clear();
			for (int d = 1; d <= depth; d++) {
				parts.add(levelName(d, true));
			}
			total = 0;
			for (Component part : parts) {
				total += font.width(part);
			}
			total += font.width(separator) * (parts.size() - 1);
		}
		int x = (width - total) / 2;
		int y = (LaptopFrame.CRUMB_BAND - font.lineHeight) / 2 + 1;
		for (int i = 0; i < parts.size(); i++) {
			if (i > 0) {
				graphics.drawString(font, separator, x, y, 0xFF6A7280, false);
				x += font.width(separator);
			}
			boolean current = i == parts.size() - 1;
			graphics.drawString(font, parts.get(i), x, y, current ? 0xFFFFFFFF : 0xFF9AA2AE, current);
			x += font.width(parts.get(i));
		}
	}

	private static Component levelName(int depth, boolean shortName) {
		if (shortName) {
			return Component.translatable("screen.mineception.level_short", depth);
		}
		return Component.translatable("screen.mineception.level", depth, Component.translatable(Theme.forDepth(depth).translationKey()));
	}

	private static Component keys(KeyMapping... mappings) {
		StringBuilder text = new StringBuilder();
		for (KeyMapping mapping : mappings) {
			if (!text.isEmpty()) {
				text.append(mappings.length > 2 ? " " : " / ");
			}
			text.append(mapping.getTranslatedKeyMessage().getString());
		}
		return Component.literal(text.toString());
	}

	private static Component[] row(Component key, String action) {
		return new Component[]{key, Component.translatable("screen.mineception.controls." + action)};
	}

	private void fillMonitor(GuiGraphics graphics, float alpha, int rgb) {
		if (alpha <= 0.004F) {
			return;
		}
		LaptopFrame.Layout l = layout;
		graphics.fill(l.monX(), l.monY(), l.monX() + l.monW(), l.monY() + l.monH(), withAlpha(rgb, alpha));
	}

	private void drawCentered(GuiGraphics graphics, Component text, float centerX, float y, float scale, int color) {
		if ((color >>> 24) < 5) {
			return;
		}
		graphics.pose().pushMatrix();
		graphics.pose().translate(centerX, y);
		graphics.pose().scale(scale, scale);
		graphics.drawString(font, text, -font.width(text) / 2, 0, color, true);
		graphics.pose().popMatrix();
	}

	private static int withAlpha(int rgb, float alpha) {
		int a = (int) (Mth.clamp(alpha, 0.0F, 1.0F) * 255.0F);
		return a << 24 | rgb & 0xFFFFFF;
	}

	private static float smoothstep(float edge0, float edge1, float x) {
		float t = Mth.clamp((x - edge0) / (edge1 - edge0), 0.0F, 1.0F);
		return t * t * (3.0F - 2.0F * t);
	}

	private void flash(int rgb, int ticks) {
		flashColor = rgb;
		flashTicks = ticks;
	}

	private void showMessage(Component text, int rgb) {
		message = text;
		messageColor = rgb;
		messageTicks = MESSAGE_TICKS;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Sounds and icons

	private void play(SoundEvent sound, float pitch, float volume) {
		minecraft.getSoundManager().play(SimpleSoundInstance.forUI(sound, pitch, volume));
	}

	private void playBlockSound(MiniBlock block, boolean place) {
		SoundType type = soundOf(block);
		play(place ? type.getPlaceSound() : type.getBreakSound(), type.getPitch() * 0.8F, (type.getVolume() + 1.0F) / 2.0F * 0.6F);
	}

	private void playStep(MiniWorld world, MiniPlayer avatar) {
		MiniBlock below = world.get(Mth.floor(avatar.x), Mth.floor(avatar.y - 0.2), Mth.floor(avatar.z));
		if (below.isAir() || below == MiniBlock.WATER) {
			return;
		}
		SoundType type = soundOf(below);
		play(type.getStepSound(), type.getPitch(), type.getVolume() * 0.15F);
	}

	private SoundType soundOf(MiniBlock block) {
		return blockSounds.computeIfAbsent(block, b -> {
			Identifier id = Identifier.tryParse(b.vanillaId);
			Block real = id != null ? BuiltInRegistries.BLOCK.getValue(id) : null;
			return real != null ? real.defaultBlockState().getSoundType() : SoundType.STONE;
		});
	}

	private static ItemStack iconOf(MiniBlock block) {
		Identifier id = Identifier.tryParse(block.vanillaId);
		return id != null ? new ItemStack(BuiltInRegistries.ITEM.getValue(id)) : ItemStack.EMPTY;
	}

	// ------------------------------------------------------------------------------------------------------------
	// State for tests and integration

	/** The real-world laptop this screen plays on. */
	public BlockPos pos() {
		return pos;
	}

	/** The dream level shown on the monitor (1..4). During a dive this is the level being left. */
	public int depth() {
		return depth;
	}

	/** True while the camera is flying into or out of a laptop screen. */
	public boolean isTransitioning() {
		return transition != null;
	}

	/** True if the laptop's dream levels are available (false shows "No signal"). */
	public boolean hasSignal() {
		return session != null;
	}

	public boolean isMouseCaptured() {
		return captured;
	}

	public int selectedSlot() {
		return selectedSlot;
	}

	/** Translation key of the message currently shown on the monitor, or null. */
	public @Nullable String messageKey() {
		if (message == null || messageTicks <= 0) {
			return null;
		}
		return message.getContents() instanceof TranslatableContents translatable ? translatable.getKey() : message.getString();
	}

	/**
	 * The camera the monitor shows at {@code partialTick} into the current tick: the controlled avatar's eyes, or the
	 * point of the flight during a transition. Null without a signal.
	 */
	public @Nullable Camera viewCamera(float partialTick) {
		DreamSession current = session;
		return current == null ? null : currentCamera(current, partialTick);
	}

	/** Points the controlled avatar's view (yaw/pitch in Minecraft's convention). */
	public void look(float yaw, float pitch) {
		if (session != null && transition == null) {
			MiniPlayer avatar = session.avatar(depth);
			avatar.yaw = yaw;
			avatar.pitch = Mth.clamp(pitch, -90.0F, 90.0F);
		}
	}

	/** Centre of the monitor in window pixels (for clicking it). */
	public double[] monitorCenterInWindow() {
		Window window = minecraft.getWindow();
		double scaleX = (double) window.getScreenWidth() / window.getGuiScaledWidth();
		double scaleY = (double) window.getScreenHeight() / window.getGuiScaledHeight();
		return new double[]{(layout.monX() + layout.monW() / 2.0) * scaleX, (layout.monY() + layout.monH() / 2.0) * scaleY};
	}
}
