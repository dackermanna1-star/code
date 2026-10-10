package com.blademode.client;

import com.blademode.client.mixin.GameRendererAccessor;
import com.blademode.item.HighFrequencyBladeItem;
import com.blademode.net.BladeModePayload;
import com.blademode.net.SlashPayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Blade mode input. While attack is held with the blade, the camera stops turning and mouse
 * motion instead moves a cursor across the screen; the cut line runs from the crosshair (or is
 * centred on it) to that cursor. Releasing attack sends the slash.
 *
 * <p>Screen positions are kept in normalised device coordinates: x, y in [-1, 1], y up.
 */
public final class BladeInput {
	/** Line stretched from the crosshair to the cursor, or centred on the crosshair. */
	public enum LineMode {
		FROM_CROSSHAIR,
		CENTERED
	}

	private static boolean drawing;
	/** Angles (degrees) the camera would have turned since drawing started. */
	private static double yawAcc;
	private static double pitchAcc;
	private static double cursorX;
	private static double cursorY;
	private static LineMode mode = LineMode.FROM_CROSSHAIR;
	/** Last finished line, for the HUD flash. */
	private static double lastAX, lastAY, lastBX, lastBY;
	private static long lastSlashTime = Long.MIN_VALUE;

	private BladeInput() {
	}

	public static boolean isDrawing() {
		return drawing;
	}

	public static LineMode mode() {
		return mode;
	}

	public static void toggleMode() {
		mode = mode == LineMode.FROM_CROSSHAIR ? LineMode.CENTERED : LineMode.FROM_CROSSHAIR;
	}

	public static boolean holdingBlade(Minecraft mc) {
		return mc.player != null && mc.player.getMainHandItem().getItem() instanceof HighFrequencyBladeItem;
	}

	/** Attack pressed. Returns true when blade mode takes over the click. */
	public static boolean onAttackPressed(Minecraft mc) {
		if (!holdingBlade(mc) || mc.screen != null || mc.player.isSpectator()) {
			return false;
		}
		if (!drawing) {
			drawing = true;
			yawAcc = 0;
			pitchAcc = 0;
			cursorX = 0;
			cursorY = 0;
			ClientPlayNetworking.send(new BladeModePayload(true));
		}
		return true;
	}

	/** Whether the vanilla hold-to-mine behaviour must be suppressed. */
	public static boolean suppressContinuousAttack(Minecraft mc) {
		return drawing || holdingBlade(mc);
	}

	/**
	 * Mouse motion while drawing moves the cursor instead of the camera.
	 *
	 * @param yawDelta   degrees*(1/0.15) as passed to {@code Entity.turn}
	 * @param pitchDelta same units, positive = looking down
	 */
	public static boolean onTurn(Minecraft mc, double yawDelta, double pitchDelta) {
		if (!drawing) {
			return false;
		}
		float vfov = fov(mc);
		double aspect = (double) mc.getWindow().getWidth() / Math.max(1, mc.getWindow().getHeight());
		double tanV = Math.tan(Math.toRadians(vfov) * 0.5);
		// The cursor goes where the crosshair would have pointed had the camera turned.
		double maxYaw = Math.toDegrees(Math.atan(tanV * aspect));
		double maxPitch = Math.toDegrees(Math.atan(tanV));
		yawAcc = Math.max(-maxYaw, Math.min(maxYaw, yawAcc + yawDelta * 0.15));
		pitchAcc = Math.max(-maxPitch, Math.min(maxPitch, pitchAcc + pitchDelta * 0.15));
		cursorX = Math.tan(Math.toRadians(yawAcc)) / (tanV * aspect);
		cursorY = -Math.tan(Math.toRadians(pitchAcc)) / tanV;
		return true;
	}

	public static void tick(Minecraft mc) {
		if (!drawing) {
			return;
		}
		if (mc.player == null || !holdingBlade(mc) || mc.screen != null || !mc.player.isAlive()) {
			cancel();
			return;
		}
		if (!mc.options.keyAttack.isDown()) {
			finish(mc);
		}
	}

	public static void cancel() {
		if (drawing) {
			drawing = false;
			if (Minecraft.getInstance().getConnection() != null) {
				ClientPlayNetworking.send(new BladeModePayload(false));
			}
		}
	}

	/** Current line endpoints {ax, ay, bx, by} in NDC. */
	public static double[] line() {
		if (mode == LineMode.CENTERED) {
			return new double[]{-cursorX, -cursorY, cursorX, cursorY};
		}
		return new double[]{0, 0, cursorX, cursorY};
	}

	private static void finish(Minecraft mc) {
		drawing = false;
		ClientPlayNetworking.send(new BladeModePayload(false));
		double[] l = line();
		double aspect = (double) mc.getWindow().getWidth() / Math.max(1, mc.getWindow().getHeight());
		double dx = (l[2] - l[0]) * aspect;
		double dy = l[3] - l[1];
		if (Math.sqrt(dx * dx + dy * dy) < 0.04) {
			// A plain click: behave like a normal sword hit.
			if (mc.hitResult instanceof EntityHitResult hit && mc.gameMode != null) {
				mc.gameMode.attack(mc.player, hit.getEntity());
			}
			mc.player.swing(InteractionHand.MAIN_HAND);
			return;
		}
		Camera camera = mc.gameRenderer.getMainCamera();
		Vec3 eye = camera.position();
		Vec3 a = rayThrough(mc, camera, l[0], l[1]);
		Vec3 b = rayThrough(mc, camera, l[2], l[3]);
		ClientPlayNetworking.send(new SlashPayload(eye, a, b));
		mc.player.swing(InteractionHand.MAIN_HAND);
		lastAX = l[0];
		lastAY = l[1];
		lastBX = l[2];
		lastBY = l[3];
		lastSlashTime = System.currentTimeMillis();
	}

	/** World direction of the view ray through an NDC point. */
	public static Vec3 rayThrough(Minecraft mc, Camera camera, double nx, double ny) {
		float vfov = fov(mc);
		double aspect = (double) mc.getWindow().getWidth() / Math.max(1, mc.getWindow().getHeight());
		double tanV = Math.tan(Math.toRadians(vfov) * 0.5);
		Vector3f dir = new Vector3f((float) (nx * tanV * aspect), (float) (ny * tanV), -1.0F).normalize();
		Quaternionf rot = new Quaternionf(camera.rotation());
		rot.transform(dir);
		return new Vec3(dir.x, dir.y, dir.z);
	}

	public static float fov(Minecraft mc) {
		Camera camera = mc.gameRenderer.getMainCamera();
		return ((GameRendererAccessor) mc.gameRenderer).blademode$getFov(camera, mc.getDeltaTracker().getGameTimeDeltaPartialTick(true), true);
	}

	/** Seconds since the last slash and its line, for the HUD flash. */
	public static double[] lastLine() {
		return new double[]{lastAX, lastAY, lastBX, lastBY};
	}

	public static float lastSlashAge() {
		return lastSlashTime == Long.MIN_VALUE ? Float.MAX_VALUE : (System.currentTimeMillis() - lastSlashTime) / 1000.0F;
	}
}
