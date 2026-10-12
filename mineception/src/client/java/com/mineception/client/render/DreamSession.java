package com.mineception.client.render;

import com.mineception.block.LaptopBlockEntity;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniPlayer;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.render.Camera;
import net.minecraft.core.BlockPos;
import org.jspecify.annotations.Nullable;

/**
 * Client-side state of one real-world laptop: its four dream levels (generated from the laptop's data and kept in
 * sync with it), an avatar per level, and rendering of any level with the deeper levels showing on each laptop
 * screen.
 *
 * <p>PLACEHOLDER (scaffold): renders through the placeholder raycaster without textures. The public API below is the
 * contract between the renderer (owner of this class) and the laptop screen, and must stay.
 */
public final class DreamSession {
	private final BlockPos pos;
	private final MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
	private final MiniPlayer[] avatars = new MiniPlayer[Theme.DEPTHS];

	private DreamSession(BlockPos pos) {
		this.pos = pos.immutable();
	}

	/** The session for a laptop block entity on the client, created on first use. Null if there is no laptop there. */
	public static @Nullable DreamSession get(BlockPos pos) {
		return null;
	}

	public BlockPos pos() {
		return pos;
	}

	/** Level 1..4, rebuilt automatically when the laptop's data changes. */
	public MiniWorld world(int depth) {
		return worlds[depth - 1];
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
	}

	/**
	 * Renders level {@code depth} from {@code camera} into {@code out} ({@code width * height} ARGB pixels), with the
	 * deeper levels rendered recursively onto each laptop screen. Level 4's laptop shows static.
	 *
	 * @param highlight block to outline, or null
	 */
	public void render(int depth, Camera camera, float partialTick, @Nullable MiniHit highlight, int[] out, int width, int height) {
	}

	/**
	 * Breaks (AIR) or places a block in a level: applied locally at once and sent to the server, which validates it and
	 * syncs it to everyone. Returns false if the edit is not allowed (protected block, out of bounds, ...).
	 */
	public boolean edit(int depth, int x, int y, int z, MiniBlock block) {
		return false;
	}

	/** The block entity behind this session, if still loaded. */
	public @Nullable LaptopBlockEntity blockEntity() {
		return null;
	}
}
