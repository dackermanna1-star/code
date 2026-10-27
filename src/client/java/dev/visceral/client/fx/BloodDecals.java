package dev.visceral.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.visceral.Visceral;
import dev.visceral.client.config.ClientConfig;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.joml.Matrix4f;

/**
 * Blood splats and pools stamped onto block faces. Client-side only (purely cosmetic), capped
 * and faded out over time. Splats landing near an existing one merge into it, so heavy
 * bleeding builds up a coherent stain rather than thousands of quads.
 */
public final class BloodDecals {
	private static final Identifier[] SPLATS = {
		Visceral.id("textures/decal/blood_splat_0.png"), Visceral.id("textures/decal/blood_splat_1.png"),
		Visceral.id("textures/decal/blood_splat_2.png"), Visceral.id("textures/decal/blood_splat_3.png")
	};
	private static final Identifier POOL = Visceral.id("textures/decal/blood_pool.png");
	private static final List<Decal> DECALS = new ArrayList<>();

	private static final class Decal {
		final double x, y, z;
		final Direction face;
		float size;
		final float maxSize;
		final float rotation;
		final int variant;
		final float r, g, b;
		long born;
		final boolean pool;

		Decal(double x, double y, double z, Direction face, float size, float maxSize, float rotation, int variant, float r, float g, float b, boolean pool) {
			this.x = x;
			this.y = y;
			this.z = z;
			this.face = face;
			this.size = size;
			this.maxSize = maxSize;
			this.rotation = rotation;
			this.variant = variant;
			this.r = r;
			this.g = g;
			this.b = b;
			this.pool = pool;
			this.born = System.currentTimeMillis();
		}
	}

	private BloodDecals() {
	}

	public static void clear() {
		DECALS.clear();
	}

	public static int count() {
		return DECALS.size();
	}

	/** A droplet hit a surface. {@code face} is the side of the block that was hit (outward normal). */
	public static void splat(Level level, double x, double y, double z, Direction face, float size, float r, float g, float b) {
		ClientConfig cfg = ClientConfig.get();
		if (!cfg.bloodDecals || cfg.maxDecals <= 0) return;
		BlockPos support = BlockPos.containing(x - face.getStepX() * 0.05, y - face.getStepY() * 0.05, z - face.getStepZ() * 0.05);
		BlockState state = level.getBlockState(support);
		if (!Block.isFaceFull(state.getCollisionShape(level, support, CollisionContext.empty()), face)) return;
		// Snap onto the face plane.
		double px = face.getAxis() == Direction.Axis.X ? support.getX() + (face.getStepX() > 0 ? 1 : 0) : x;
		double py = face.getAxis() == Direction.Axis.Y ? support.getY() + (face.getStepY() > 0 ? 1 : 0) : y;
		double pz = face.getAxis() == Direction.Axis.Z ? support.getZ() + (face.getStepZ() > 0 ? 1 : 0) : z;
		// Merge with a nearby splat on the same plane.
		for (int i = DECALS.size() - 1; i >= Math.max(0, DECALS.size() - 64); i--) {
			Decal d = DECALS.get(i);
			if (d.face != face || d.pool) continue;
			double dx = d.x - px, dy = d.y - py, dz = d.z - pz;
			if (dx * dx + dy * dy + dz * dz < d.size * d.size * 0.12) {
				d.size = Math.min(d.maxSize, d.size + size * 0.25f);
				d.born = System.currentTimeMillis();
				return;
			}
		}
		add(new Decal(px, py, pz, face, size, Math.max(size, 1.1f), level.random.nextFloat() * 360f, level.random.nextInt(SPLATS.length), r, g, b, false));
	}

	/** A growing pool under a bleeding body. */
	public static void pool(Level level, Vec3 at, float targetSize, float r, float g, float b) {
		ClientConfig cfg = ClientConfig.get();
		if (!cfg.bloodDecals || cfg.maxDecals <= 0) return;
		BlockPos support = BlockPos.containing(at.x, at.y - 0.05, at.z);
		for (int i = 0; i < 2 && level.getBlockState(support).getCollisionShape(level, support).isEmpty(); i++) support = support.below();
		BlockState state = level.getBlockState(support);
		if (!Block.isFaceFull(state.getCollisionShape(level, support, CollisionContext.empty()), Direction.UP)) return;
		double py = support.getY() + 1;
		for (Decal d : DECALS) {
			if (!d.pool) continue;
			double dx = d.x - at.x, dz = d.z - at.z;
			if (Math.abs(d.y - py) < 0.01 && dx * dx + dz * dz < 0.6) {
				d.size = Math.min(d.maxSize, d.size + 0.03f);
				d.born = System.currentTimeMillis();
				return;
			}
		}
		add(new Decal(at.x, py, at.z, Direction.UP, 0.25f, targetSize, level.random.nextFloat() * 360f, 0, r, g, b, true));
	}

	private static void add(Decal d) {
		DECALS.add(d);
		int max = ClientConfig.get().maxDecals;
		while (DECALS.size() > max) DECALS.remove(0);
	}

	public static void tick() {
		long now = System.currentTimeMillis();
		long life = (long) (ClientConfig.get().decalSeconds * 1000);
		DECALS.removeIf(d -> now - d.born > life);
	}

	public static void render(PoseStack poseStack, MultiBufferSource buffers, Vec3 cam) {
		if (DECALS.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		Level level = mc.level;
		if (level == null) return;
		long now = System.currentTimeMillis();
		float life = ClientConfig.get().decalSeconds * 1000f;
		Matrix4f m = poseStack.last().pose();
		for (int v = 0; v <= SPLATS.length; v++) {
			RenderType type = RenderTypes.entityTranslucent(v == SPLATS.length ? POOL : SPLATS[v]);
			VertexConsumer vc = null;
			for (Decal d : DECALS) {
				boolean match = v == SPLATS.length ? d.pool : (!d.pool && d.variant == v);
				if (!match) continue;
				double dx = d.x - cam.x, dy = d.y - cam.y, dz = d.z - cam.z;
				if (dx * dx + dy * dy + dz * dz > 64 * 64) continue;
				if (vc == null) vc = buffers.getBuffer(type);
				float age = (now - d.born) / life;
				float alpha = age > 0.85f ? Math.max(0, 1 - (age - 0.85f) / 0.15f) : 1f;
				int color = ARGB.colorFromFloat(alpha * 0.92f, d.r, d.g, d.b);
				BlockPos lp = BlockPos.containing(d.x + d.face.getStepX() * 0.5, d.y + d.face.getStepY() * 0.5, d.z + d.face.getStepZ() * 0.5);
				int light = LevelRenderer.getLightColor(level, lp);
				quad(vc, m, (float) dx, (float) dy, (float) dz, d.face, d.size * 0.5f, d.rotation, color, light);
			}
		}
	}

	private static void quad(VertexConsumer vc, Matrix4f m, float cx, float cy, float cz, Direction face, float half, float rotDeg, int color, int light) {
		float nx = face.getStepX(), ny = face.getStepY(), nz = face.getStepZ();
		// Tangent basis on the face.
		float tx, ty, tz, bx, by, bz;
		if (face.getAxis() == Direction.Axis.Y) {
			tx = 1; ty = 0; tz = 0;
			bx = 0; by = 0; bz = 1;
		} else if (face.getAxis() == Direction.Axis.X) {
			tx = 0; ty = 0; tz = 1;
			bx = 0; by = 1; bz = 0;
		} else {
			tx = 1; ty = 0; tz = 0;
			bx = 0; by = 1; bz = 0;
		}
		float c = Mth.cos(rotDeg * Mth.DEG_TO_RAD), s = Mth.sin(rotDeg * Mth.DEG_TO_RAD);
		float ux = (tx * c + bx * s) * half, uy = (ty * c + by * s) * half, uz = (tz * c + bz * s) * half;
		float wx = (bx * c - tx * s) * half, wy = (by * c - ty * s) * half, wz = (bz * c - tz * s) * half;
		float ox = cx + nx * 0.004f, oy = cy + ny * 0.004f, oz = cz + nz * 0.004f;
		boolean flip = (face.getAxisDirection() == Direction.AxisDirection.NEGATIVE) ^ (face.getAxis() == Direction.Axis.X);
		float[][] corners = flip
			? new float[][] {{-1, -1, 0, 1}, {-1, 1, 0, 0}, {1, 1, 1, 0}, {1, -1, 1, 1}}
			: new float[][] {{-1, -1, 0, 1}, {1, -1, 1, 1}, {1, 1, 1, 0}, {-1, 1, 0, 0}};
		for (float[] k : corners) {
			float px = ox + ux * k[0] + wx * k[1], py = oy + uy * k[0] + wy * k[1], pz = oz + uz * k[0] + wz * k[1];
			vc.addVertex(m, px, py, pz).setColor(color).setUv(k[2], k[3]).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(nx, ny, nz);
		}
	}
}
