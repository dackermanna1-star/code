package com.mineception.client.render;

import com.mineception.Mineception;
import com.mineception.block.LaptopBlockEntity;
import com.mineception.dream.Face;
import com.mineception.dream.LaptopData;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniInput;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.render.Camera;
import com.mineception.dream.render.DreamCameras;
import com.mineception.dream.render.DreamLevels;
import com.mineception.dream.render.NestedRenderer;
import com.mineception.network.EditBlockPayload;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Client-side state of one real-world laptop: its four dream levels (generated from the laptop's data and kept in
 * sync with it), an avatar per level, and rendering of any level with the deeper levels showing on each laptop
 * screen.
 *
 * <p>Sessions live as long as their laptop is around: they are released when the block goes away, the client
 * changes level, or nobody has looked at the laptop or been near it for half a minute. All methods are for the
 * client thread; pictures for the real-world screen are rendered on a background thread from snapshots (the levels
 * are copy-on-write, see {@link DreamLevels}, so a snapshot is just the current level objects).
 */
public final class DreamSession {
	/** Size of the picture on a real-world laptop's screen (the screen's aspect ratio). */
	static final int SCREEN_WIDTH = 128;
	static final int SCREEN_HEIGHT = 80;
	/** The real-world screen only animates when the camera is this close... */
	private static final double SCREEN_RANGE = 24.0;
	/** ... at up to this many pictures per second. */
	private static final long SCREEN_FRAME_NANOS = 1_000_000_000L / 15;
	/** After failed pictures the interval doubles per failure, up to this many times (about 4 seconds). */
	private static final int MAX_FAILURE_BACKOFF = 6;
	/** How long a local edit is shown before the server must have confirmed it. */
	private static final int PENDING_TICKS = 40;
	/** Sessions nobody used for this long (and with no player nearby) are released. */
	private static final int RELEASE_TICKS = 600;
	private static final double KEEP_DISTANCE = 32.0;
	/** The server only accepts edits from players this close to the laptop. */
	private static final double EDIT_RANGE = 8.0;
	/** Client-side edit rate limit, matching the server's. */
	private static final double EDITS_PER_TICK = 1.0;
	private static final double EDIT_BURST = 10.0;
	/** How quickly an idle avatar turns to face its laptop (fraction per tick). */
	private static final float IDLE_TURN = 0.2F;

	private static final Map<BlockPos, DreamSession> SESSIONS = new HashMap<>();
	private static @Nullable ClientLevel sessionsLevel;
	private static long clientTicks;
	private static final ExecutorService SCREEN_RENDERER = Executors.newSingleThreadExecutor(runnable -> {
		Thread thread = new Thread(runnable, "Mineception laptop screens");
		thread.setDaemon(true);
		thread.setPriority(Thread.NORM_PRIORITY - 1);
		return thread;
	});

	private final BlockPos pos;
	private final ClientLevel level;
	private final DreamLevels levels = new DreamLevels();
	private final MiniPlayer[] avatars = new MiniPlayer[Theme.DEPTHS];
	/** Set when local edits expired unconfirmed, so the levels are rebuilt from the laptop's data. */
	private boolean stale;
	private long seed;
	private int revision;
	private int controlledDepth;
	private long lastUsed;
	private double editTokens = EDIT_BURST;
	private long editRefillTick;

	private @Nullable ScreenTexture screen;
	private final AtomicReference<int[]> finishedFrame = new AtomicReference<>();
	private volatile boolean frameInFlight;
	private long lastFrameStart;
	private int @Nullable [] spareFrame;
	/** Pictures that failed in a row; written by the screen thread only. */
	private volatile int failedFrames;

	private DreamSession(BlockPos pos, ClientLevel level) {
		this.pos = pos.immutable();
		this.level = level;
		this.lastUsed = clientTicks;
	}

	/** The session for a laptop block entity on the client, created on first use. Null if there is no laptop there. */
	public static @Nullable DreamSession get(BlockPos pos) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return null;
		}
		checkLevel(level);
		DreamSession session = SESSIONS.get(pos);
		if (!(level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop)) {
			if (session != null) {
				SESSIONS.remove(pos);
				session.release();
			}
			return null;
		}
		if (session == null) {
			session = new DreamSession(pos, level);
			SESSIONS.put(session.pos, session);
		}
		session.sync(laptop);
		session.lastUsed = clientTicks;
		return session;
	}

	public BlockPos pos() {
		return pos;
	}

	/**
	 * Level 1..4. Levels are never changed in place: when the laptop's data or a local {@link #edit} changes one, it is
	 * replaced by a new object, so fetch it again each tick rather than keeping it.
	 */
	public MiniWorld world(int depth) {
		return levels.world(depth);
	}

	/** The avatar of level 1..4. Levels the player is not controlling idle at their spawn point, looking at their laptop. */
	public MiniPlayer avatar(int depth) {
		return avatars[depth - 1];
	}

	/**
	 * Marks which level the local player is controlling (0 = none, i.e. only watching the real-world screen). Controlled
	 * avatars are ticked by the screen; the others idle.
	 */
	public void setControlledDepth(int depth) {
		controlledDepth = Math.max(0, Math.min(Theme.DEPTHS, depth));
		lastUsed = clientTicks;
	}

	/**
	 * Renders level {@code depth} from {@code camera} into {@code out} ({@code width * height} ARGB pixels), with the
	 * deeper levels rendered recursively onto each laptop screen. Level 4's laptop shows static.
	 *
	 * @param highlight block to outline, or null
	 */
	public void render(int depth, Camera camera, float partialTick, @Nullable MiniHit highlight, int[] out, int width, int height) {
		if (depth < 1 || depth > Theme.DEPTHS || width <= 0 || height <= 0 || !levels.built()) {
			return;
		}
		lastUsed = clientTicks;
		prepareTextures();
		LaptopRendering.renderer().render(snapshot(partialTick), depth, camera, level.getGameTime(), partialTick, highlight,
			out, width, height);
	}

	/**
	 * Breaks (AIR) or places a block in a level: applied locally at once and sent to the server, which validates it and
	 * syncs it to everyone. Returns false if the edit is not allowed (protected block, out of bounds, ...).
	 */
	public boolean edit(int depth, int x, int y, int z, MiniBlock block) {
		if (depth < 1 || depth > Theme.DEPTHS || !levels.built() || !MiniWorld.inBounds(x, y, z) || y == 0) {
			return false;
		}
		MiniWorld world = levels.world(depth);
		if (x == world.laptopX && y == world.laptopY && z == world.laptopZ) {
			return false;
		}
		MiniBlock current = world.get(x, y, z);
		if (block == MiniBlock.AIR) {
			if (!current.breakable()) {
				return false;
			}
		} else {
			if (!block.placeable() || current != MiniBlock.AIR && current != MiniBlock.WATER) {
				return false;
			}
			if (!avatars[depth - 1].canPlaceAt(x, y, z)) {
				return false;
			}
		}
		LaptopBlockEntity laptop = blockEntity();
		if (laptop == null) {
			return false;
		}
		int index = MiniWorld.index(x, y, z);
		LaptopData data = laptop.data();
		if (!com.mineception.dream.EditBudget.allows(data, depth, index)) {
			return false;
		}
		LocalPlayer player = Minecraft.getInstance().player;
		if (player == null || player.distanceToSqr(Vec3.atCenterOf(pos)) > EDIT_RANGE * EDIT_RANGE) {
			return false;
		}
		if (!ClientPlayNetworking.canSend(EditBlockPayload.TYPE) || !takeEditToken()) {
			return false;
		}
		levels.editLocally(depth, index, block, clientTicks + PENDING_TICKS);
		ClientPlayNetworking.send(new EditBlockPayload(pos, depth, index, block.id));
		lastUsed = clientTicks;
		return true;
	}

	/** The block entity behind this session, if still loaded. */
	public @Nullable LaptopBlockEntity blockEntity() {
		return level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop ? laptop : null;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Levels

	/**
	 * Rebuilds the levels when the laptop's data changed (another revision or seed); avatars keep their places. Only levels
	 * whose blocks actually changed get new objects (and are relit).
	 */
	private void sync(LaptopBlockEntity laptop) {
		LaptopData data = laptop.data();
		if (levels.built() && !stale && laptop.revision() == revision && data.seed() == seed) {
			return;
		}
		boolean newSeed = levels.sync(data);
		seed = data.seed();
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			if (newSeed || avatars[depth - 1] == null) {
				MiniPlayer avatar = new MiniPlayer();
				avatar.reset(levels.world(depth));
				avatars[depth - 1] = avatar;
			}
		}
		revision = laptop.revision();
		stale = false;
	}

	private boolean takeEditToken() {
		editTokens = Math.min(EDIT_BURST, editTokens + (clientTicks - editRefillTick) * EDITS_PER_TICK);
		editRefillTick = clientTicks;
		if (editTokens < 1.0) {
			return false;
		}
		editTokens -= 1.0;
		return true;
	}

	/** The current levels and the avatars' eye cameras, safe to render on another thread. */
	private NestedRenderer.Levels snapshot(float partialTick) {
		MiniWorld[] worlds = levels.snapshot();
		Camera[] cameras = new Camera[Theme.DEPTHS];
		for (int i = 0; i < Theme.DEPTHS; i++) {
			cameras[i] = avatars[i].eyeCamera(partialTick, DreamCameras.FOV);
		}
		return new NestedRenderer.Levels() {
			@Override
			public MiniWorld world(int depth) {
				return worlds[depth - 1];
			}

			@Override
			public Camera camera(int depth) {
				return cameras[depth - 1];
			}
		};
	}

	private void prepareTextures() {
		for (Theme theme : Theme.values()) {
			LaptopRendering.raycaster().prepareTextures(theme);
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Ticking and bookkeeping

	/** Client tick: idle avatars, expired local edits, and releasing sessions that are no longer needed. */
	static void tickAll(Minecraft minecraft) {
		clientTicks++;
		ClientLevel level = minecraft.level;
		if (level == null) {
			releaseAll();
			return;
		}
		checkLevel(level);
		Iterator<DreamSession> iterator = SESSIONS.values().iterator();
		while (iterator.hasNext()) {
			DreamSession session = iterator.next();
			if (!session.tick(minecraft.player)) {
				iterator.remove();
				session.release();
			}
		}
	}

	private boolean tick(@Nullable LocalPlayer player) {
		LaptopBlockEntity laptop = blockEntity();
		if (laptop == null) {
			return false;
		}
		if (player != null && player.distanceToSqr(Vec3.atCenterOf(pos)) < KEEP_DISTANCE * KEEP_DISTANCE) {
			lastUsed = clientTicks;
		}
		if (controlledDepth == 0 && clientTicks - lastUsed > RELEASE_TICKS) {
			return false;
		}
		if (levels.expire(clientTicks)) {
			// The server did not confirm in time: rebuild from its data, dropping the unconfirmed change
			stale = true;
		}
		sync(laptop);
		double time = level.getGameTime();
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			if (depth != controlledDepth) {
				idle(depth, time);
			}
		}
		return true;
	}

	/** An avatar nobody controls stands where it was left and turns to watch its laptop, swaying slightly. */
	private void idle(int depth, double time) {
		MiniPlayer avatar = avatars[depth - 1];
		MiniWorld world = levels.world(depth);
		avatar.tick(world, MiniInput.NONE);
		if (avatar.fellOut()) {
			avatar.reset(world);
		}
		float[] look = DreamCameras.idleLook(world, avatar.x, avatar.y, avatar.z, time);
		avatar.yaw += MiniPlayer.wrapDegrees(look[0] - avatar.yaw) * IDLE_TURN;
		avatar.pitch += (look[1] - avatar.pitch) * IDLE_TURN;
	}

	private static void checkLevel(ClientLevel level) {
		if (level != sessionsLevel) {
			releaseAll();
			sessionsLevel = level;
		}
	}

	static void releaseAll() {
		for (DreamSession session : SESSIONS.values()) {
			session.release();
		}
		SESSIONS.clear();
		sessionsLevel = null;
	}

	private void release() {
		if (screen != null) {
			screen.release();
			screen = null;
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// The real-world screen

	/**
	 * Called by the block entity renderer each frame the laptop is in view: uploads a finished picture, starts the next
	 * one when it is due (near, facing the camera, at most ~15 per second), and returns the texture to draw on the
	 * screen, or null while there is no picture yet.
	 */
	@Nullable Identifier screenTexture(Vec3 cameraPos, Face facing, float partialTick) {
		lastUsed = clientTicks;
		if (!levels.built()) {
			return null;
		}
		if (screen == null) {
			screen = new ScreenTexture(pos, SCREEN_WIDTH, SCREEN_HEIGHT);
		}
		int[] frame = finishedFrame.getAndSet(null);
		if (frame != null) {
			screen.upload(frame);
			spareFrame = frame;
		}
		if (!frameInFlight && wantsFrame(cameraPos, facing)) {
			startFrame(partialTick);
		}
		return screen.hasPicture() ? screen.id() : null;
	}

	private boolean wantsFrame(Vec3 cameraPos, Face facing) {
		double[] center = LaptopGeometry.screenPoint(facing, 0.5, 0.5);
		double dx = cameraPos.x - (pos.getX() + center[0]);
		double dy = cameraPos.y - (pos.getY() + center[1]);
		double dz = cameraPos.z - (pos.getZ() + center[2]);
		boolean inFront = dx * facing.dx + dz * facing.dz > 0.0;
		boolean near = dx * dx + dy * dy + dz * dz <= SCREEN_RANGE * SCREEN_RANGE;
		// Failing pictures back off exponentially, so a broken level does not retry (and log) every frame
		long interval = SCREEN_FRAME_NANOS << Math.min(failedFrames, MAX_FAILURE_BACKOFF);
		if (System.nanoTime() - lastFrameStart < interval) {
			return false;
		}
		// The very first picture is drawn wherever the camera is, so a laptop never shows an empty screen once seen
		return screen == null || !screen.hasPicture() || inFront && near;
	}

	private void startFrame(float partialTick) {
		lastFrameStart = System.nanoTime();
		prepareTextures();
		NestedRenderer.Levels snapshot = snapshot(partialTick);
		Camera camera = snapshot.camera(1);
		long gameTime = level.getGameTime();
		int[] buffer = spareFrame != null ? spareFrame : new int[SCREEN_WIDTH * SCREEN_HEIGHT];
		spareFrame = null;
		frameInFlight = true;
		try {
			SCREEN_RENDERER.execute(() -> {
				try {
					LaptopRendering.renderer().render(snapshot, 1, camera, gameTime, partialTick, null, buffer, SCREEN_WIDTH, SCREEN_HEIGHT);
					finishedFrame.set(buffer);
					failedFrames = 0;
				} catch (RuntimeException e) {
					int failures = failedFrames + 1;
					failedFrames = failures;
					if (failures == 1) {
						Mineception.LOGGER.error("Failed to render the laptop screen at {}, retrying less often", pos, e);
					} else {
						Mineception.LOGGER.debug("Laptop screen at {} failed again ({} times in a row): {}", pos, failures, e.toString());
					}
				} finally {
					frameInFlight = false;
				}
			});
		} catch (RejectedExecutionException e) {
			frameInFlight = false;
		}
	}
}
