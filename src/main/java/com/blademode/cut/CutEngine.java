package com.blademode.cut;

import com.blademode.BladeConfig;
import com.blademode.BladeMode;
import com.blademode.block.CutBlock;
import com.blademode.block.CutBlockEntity;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.piece.PieceBlock;
import com.blademode.piece.PieceEntity;
import com.blademode.registry.ModBlocks;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.PriorityQueue;
import java.util.Set;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Clearable;
import net.minecraft.world.Container;
import net.minecraft.world.Containers;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import org.joml.Quaterniond;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * Cuts the world along a {@link Slash}.
 *
 * <ol>
 *   <li>Every block the blade's sector passes through is split into a front and back half.</li>
 *   <li>A connectivity graph is grown from the split halves. Blocks are joined when they share a
 *       face (logs also diagonally); natural leaves never carry load. A connected group that grows
 *       past {@link BladeConfig#maxFallingBlocks}, or reaches bedrock-like blocks, is anchored.</li>
 *   <li>A group that is no longer anchored but was attached (through the cut) to an anchored one
 *       has lost its support: it is lifted out of the world, together with the leaves that belong
 *       to it and anything hanging off it, and becomes a physics piece.</li>
 *   <li>Halves that stay behind become {@link CutBlock}s showing exactly the remaining geometry.</li>
 * </ol>
 */
public final class CutEngine {
	/** Fragments smaller than this (in blocks of volume) are not worth splitting off. */
	public static final double MIN_PART_VOLUME = 0.004;
	/** World flags for silently editing blocks; neighbours are updated in one pass afterwards. */
	private static final int SILENT = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS;
	private static final Direction[] DIRS = Direction.values();

	private final ServerLevel level;
	private final @Nullable ServerPlayer player;
	private final Slash slash;
	private final Plane worldPlane;
	private final BladeConfig config = BladeConfig.get();
	private final Long2ObjectOpenHashMap<PartNode[]> nodes = new Long2ObjectOpenHashMap<>();
	private final Map<PartNode, Boolean> anchorNodes = new HashMap<>();
	private final List<PartNode> seeds = new ArrayList<>();
	private final List<BlockPos> plantsToBreak = new ArrayList<>();
	private final Bonds.Space space = (x, y, z) -> new Vector3d(x, y, z);

	private static final PartNode[] NONE = new PartNode[0];
	private static final PartNode[] UNLOADED = new PartNode[0];

	public record Result(int slicedBlocks, int fallingPieces, int brokenPlants) {
		public boolean didSomething() {
			return this.slicedBlocks > 0 || this.fallingPieces > 0 || this.brokenPlants > 0;
		}
	}

	private CutEngine(ServerLevel level, @Nullable ServerPlayer player, Slash slash) {
		this.level = level;
		this.player = player;
		this.slash = slash;
		this.worldPlane = slash.worldPlane();
	}

	public static Result cut(ServerLevel level, @Nullable ServerPlayer player, Slash slash) {
		return new CutEngine(level, player, slash).run();
	}

	private Result run() {
		this.collectSlicedCells();
		if (this.seeds.isEmpty() && this.plantsToBreak.isEmpty()) {
			return new Result(0, 0, 0);
		}

		List<Component> components = this.findComponents();
		List<Component> falling = this.fallingComponents(components);
		int pieces = 0;
		if (!falling.isEmpty()) {
			pieces = this.detach(falling);
		}

		int plants = 0;
		for (BlockPos pos : this.plantsToBreak) {
			BlockState state = this.level.getBlockState(pos);
			if (!state.isAir() && !BlockGeometry.isStructural(state) && !(state.getBlock() instanceof LiquidBlock)) {
				if (this.level.destroyBlock(pos, true, this.player)) {
					plants++;
				}
			}
		}
		int sliced = 0;
		for (PartNode seed : this.seeds) {
			if (seed.isSplit() && seed.side == PartNode.FRONT) {
				sliced++;
			}
		}
		return new Result(sliced, pieces, plants);
	}

	// ------------------------------------------------------------------------------------------
	// 1. Which blocks does the blade pass through?

	private void collectSlicedCells() {
		AABB box = this.slash.bounds().inflate(1.0);
		int minY = Math.max((int) Math.floor(box.minY), this.level.getMinY());
		int maxY = Math.min((int) Math.floor(box.maxY), this.level.getMaxY());
		Vector3d n = this.slash.n;
		double ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
		int axis = ax >= ay && ax >= az ? 0 : (ay >= az ? 1 : 2);

		List<BlockPos> cells = new ArrayList<>();
		int[] lo = {(int) Math.floor(box.minX), minY, (int) Math.floor(box.minZ)};
		int[] hi = {(int) Math.floor(box.maxX), maxY, (int) Math.floor(box.maxZ)};
		int u = axis == 0 ? 1 : 0;
		int v = axis == 2 ? 1 : 2;
		double[] nn = {n.x, n.y, n.z};
		for (int a = lo[u]; a <= hi[u]; a++) {
			for (int b = lo[v]; b <= hi[v]; b++) {
				double kMin = Double.MAX_VALUE;
				double kMax = -Double.MAX_VALUE;
				for (int c = 0; c < 4; c++) {
					double pa = a + (c & 1);
					double pb = b + (c >> 1);
					double k = (this.slash.d - nn[u] * pa - nn[v] * pb) / nn[axis];
					kMin = Math.min(kMin, k);
					kMax = Math.max(kMax, k);
				}
				int k0 = Math.max(lo[axis], (int) Math.floor(kMin - 1.0E-4));
				int k1 = Math.min(hi[axis], (int) Math.floor(kMax + 1.0E-4));
				for (int k = k0; k <= k1; k++) {
					int[] p = new int[3];
					p[u] = a;
					p[v] = b;
					p[axis] = k;
					double minD = this.worldPlane.minDist(p[0], p[1], p[2], p[0] + 1, p[1] + 1, p[2] + 1);
					double maxD = this.worldPlane.maxDist(p[0], p[1], p[2], p[0] + 1, p[1] + 1, p[2] + 1);
					if (minD > 1.0E-6 || maxD < -1.0E-6) {
						continue;
					}
					double cx = p[0] + 0.5, cy = p[1] + 0.5, cz = p[2] + 0.5;
					double dc = this.slash.dist(cx, cy, cz);
					if (!this.slash.inSector(cx - n.x * dc, cy - n.y * dc, cz - n.z * dc, 0.0)) {
						continue;
					}
					cells.add(new BlockPos(p[0], p[1], p[2]));
				}
			}
		}

		if (cells.size() > this.config.maxSlicedBlocks) {
			Vector3d eye = this.slash.eye;
			cells.sort(Comparator.comparingDouble(p -> p.distToCenterSqr(eye.x, eye.y, eye.z)));
			cells = cells.subList(0, this.config.maxSlicedBlocks);
		}

		for (BlockPos pos : cells) {
			this.sliceCell(pos);
		}
	}

	private void sliceCell(BlockPos pos) {
		if (!this.level.isLoaded(pos)) {
			return;
		}
		BlockState state = this.level.getBlockState(pos);
		if (state.isAir()) {
			return;
		}
		BlockState original = state;
		List<Plane> oldPlanes = List.of();
		if (state.is(ModBlocks.CUT_BLOCK)) {
			if (!(this.level.getBlockEntity(pos) instanceof CutBlockEntity be)) {
				return;
			}
			original = be.getOriginal();
			oldPlanes = be.getPlanes();
		}
		if (original.getBlock() instanceof LiquidBlock) {
			return;
		}

		boolean straddles = this.worldPlane.minDist(pos.getX(), pos.getY(), pos.getZ(), pos.getX() + 1, pos.getY() + 1, pos.getZ() + 1) < -1.0E-6
			&& this.worldPlane.maxDist(pos.getX(), pos.getY(), pos.getZ(), pos.getX() + 1, pos.getY() + 1, pos.getZ() + 1) > 1.0E-6;

		if (!BlockGeometry.isStructural(original)) {
			if (straddles && this.config.cutPlants && state.getDestroySpeed(this.level, pos) >= 0 && this.mayModify(pos, state)) {
				this.plantsToBreak.add(pos);
			}
			return;
		}
		if (state.getDestroySpeed(this.level, pos) < 0) {
			return;
		}

		boolean soft = BlockGeometry.isSoftLeaves(original) && oldPlanes.isEmpty();
		Plane local = this.worldPlane.translated(pos.getX(), pos.getY(), pos.getZ());
		PartShape back = new PartShape(BlockGeometry.collisionBoxes(original), with(oldPlanes, local));
		PartShape front = new PartShape(BlockGeometry.collisionBoxes(original), with(oldPlanes, local.flip()));
		if (back.volume < MIN_PART_VOLUME && front.volume < MIN_PART_VOLUME) {
			return;
		}
		if (!this.mayModify(pos, state)) {
			// Protected blocks are not cut, and they hold whatever is attached to them.
			PartNode node = new PartNode(pos, original, oldPlanes, null, PartNode.BOTH, -1, soft);
			this.nodes.put(pos.asLong(), new PartNode[]{node});
			this.anchorNodes.put(node, Boolean.TRUE);
			return;
		}
		if (back.volume < MIN_PART_VOLUME || front.volume < MIN_PART_VOLUME) {
			// The plane only grazes this block: it stays in one piece on the bigger side, minus the
			// sliver (so the two sides never overlap). Blocks holding data are left untouched.
			boolean toFront = back.volume < MIN_PART_VOLUME;
			double sliver = toFront ? back.volume : front.volume;
			BlockEntity be = this.level.getBlockEntity(pos);
			Plane trim = sliver > 1.0E-9 && (be == null || be instanceof CutBlockEntity) ? (toFront ? local.flip() : local) : null;
			PartNode whole = new PartNode(pos, original, oldPlanes, trim, toFront ? PartNode.FRONT : PartNode.BACK, -1, soft);
			this.nodes.put(pos.asLong(), new PartNode[]{whole});
			this.seeds.add(whole);
			return;
		}
		PartNode f = new PartNode(pos, original, oldPlanes, local.flip(), PartNode.FRONT, -1, soft);
		PartNode b = new PartNode(pos, original, oldPlanes, local, PartNode.BACK, -1, soft);
		f.twin = b;
		b.twin = f;
		this.nodes.put(pos.asLong(), new PartNode[]{f, b});
		this.seeds.add(f);
		this.seeds.add(b);
	}

	private static List<Plane> with(List<Plane> planes, Plane extra) {
		List<Plane> list = new ArrayList<>(planes.size() + 1);
		list.addAll(planes);
		list.add(extra);
		return list;
	}

	private boolean mayModify(BlockPos pos, BlockState state) {
		if (this.player == null) {
			return true;
		}
		if (!this.player.mayBuild() || !this.player.mayInteract(this.level, pos)) {
			return false;
		}
		if (this.player.blockActionRestricted(this.level, pos, this.player.gameMode.getGameModeForPlayer())) {
			return false;
		}
		return PlayerBlockBreakEvents.BEFORE.invoker().beforeBlockBreak(this.level, this.player, pos, state, this.level.getBlockEntity(pos));
	}

	// ------------------------------------------------------------------------------------------
	// 2. Connectivity

	/** Nodes occupying a cell, creating whole-block nodes on demand. */
	private PartNode[] nodesAt(BlockPos pos) {
		long key = pos.asLong();
		PartNode[] existing = this.nodes.get(key);
		if (existing != null) {
			return existing;
		}
		PartNode[] created;
		if (!this.level.isLoaded(pos) || pos.getY() < this.level.getMinY() || pos.getY() > this.level.getMaxY()) {
			created = UNLOADED;
		} else {
			BlockState state = this.level.getBlockState(pos);
			BlockState original = state;
			List<Plane> planes = List.of();
			if (state.is(ModBlocks.CUT_BLOCK) && this.level.getBlockEntity(pos) instanceof CutBlockEntity be) {
				original = be.getOriginal();
				planes = be.getPlanes();
			}
			if (!BlockGeometry.isStructural(original)) {
				created = NONE;
			} else {
				double minD = this.worldPlane.minDist(pos.getX(), pos.getY(), pos.getZ(), pos.getX() + 1, pos.getY() + 1, pos.getZ() + 1);
				double maxD = this.worldPlane.maxDist(pos.getX(), pos.getY(), pos.getZ(), pos.getX() + 1, pos.getY() + 1, pos.getZ() + 1);
				int side = maxD <= 1.0E-6 ? PartNode.BACK : (minD >= -1.0E-6 ? PartNode.FRONT : PartNode.BOTH);
				PartNode node = new PartNode(pos, original, planes, null, side, -1, BlockGeometry.isSoftLeaves(original) && planes.isEmpty());
				if (state.getDestroySpeed(this.level, pos) < 0 || pos.getY() <= this.level.getMinY()) {
					this.anchorNodes.put(node, Boolean.TRUE);
				}
				created = new PartNode[]{node};
			}
		}
		this.nodes.put(key, created);
		return created;
	}

	private static final class Component {
		final int id;
		final List<PartNode> members = new ArrayList<>();
		boolean anchored;
		/** Union-find parent for grouping components that were one piece before the cut. */
		Component parent = this;

		Component(int id) {
			this.id = id;
		}

		Component root() {
			Component c = this;
			while (c.parent != c) {
				c.parent = c.parent.parent;
				c = c.parent;
			}
			return c;
		}
	}

	private List<Component> findComponents() {
		List<Component> comps = new ArrayList<>();
		int limit = this.config.maxFallingBlocks;
		for (PartNode seed : this.seeds) {
			if (seed.component >= 0 || seed.softLeaves) {
				continue;
			}
			Component comp = new Component(comps.size());
			comps.add(comp);
			// Explore downward first: ground-supported structures find bedrock / the world floor fast.
			PriorityQueue<PartNode> queue = new PriorityQueue<>(Comparator.comparingInt((PartNode p) -> p.cell.getY()));
			seed.component = comp.id;
			queue.add(seed);
			search:
			while (!queue.isEmpty()) {
				PartNode node = queue.poll();
				comp.members.add(node);
				if (this.anchorNodes.containsKey(node) || comp.members.size() > limit) {
					comp.anchored = true;
					break;
				}
				for (Direction dir : DIRS) {
					BlockPos np = node.cell.relative(dir);
					PartNode[] around = this.nodesAt(np);
					if (around == UNLOADED) {
						comp.anchored = true;
						break search;
					}
					for (PartNode m : around) {
						if (m.softLeaves || !Bonds.face(node, m, dir, this.slash, this.space)) {
							continue;
						}
						if (m.component < 0) {
							m.component = comp.id;
							queue.add(m);
						} else if (m.component != comp.id) {
							// Reached a group whose search stopped early: that group was anchored.
							comp.anchored = true;
							break search;
						}
					}
				}
				if (node.log) {
					for (int[] d : Bonds.DIAGONALS) {
						BlockPos np = node.cell.offset(d[0], d[1], d[2]);
						PartNode[] around = this.nodesAt(np);
						for (PartNode m : around) {
							if (m.softLeaves || !Bonds.diagonal(node, m, d[0], d[1], d[2], this.slash, this.space)) {
								continue;
							}
							if (m.component < 0) {
								m.component = comp.id;
								queue.add(m);
							} else if (m.component != comp.id) {
								comp.anchored = true;
								break search;
							}
						}
					}
				}
			}
		}
		return comps;
	}

	/**
	 * A component falls if it is not anchored itself but was joined (through a severed bond) to
	 * something anchored. Structures that were already floating before the cut stay put.
	 */
	private List<Component> fallingComponents(List<Component> comps) {
		for (PartNode seed : this.seeds) {
			if (seed.component < 0) {
				continue;
			}
			Component c = comps.get(seed.component);
			if (seed.twin != null && seed.twin.component >= 0) {
				union(c, comps.get(seed.twin.component));
			}
			// Whole blocks touching exactly on the cut plane.
			for (Direction dir : DIRS) {
				PartNode[] around = this.nodes.get(seed.cell.relative(dir).asLong());
				if (around == null) {
					continue;
				}
				for (PartNode m : around) {
					if (m.component >= 0 && m.component != seed.component && m.side * seed.side < 0 && !m.isSplit() && !seed.isSplit()) {
						union(c, comps.get(m.component));
					}
				}
			}
		}
		Set<Component> anchoredGroups = new HashSet<>();
		for (Component c : comps) {
			if (c.anchored) {
				anchoredGroups.add(c.root());
			}
		}
		List<Component> falling = new ArrayList<>();
		for (Component c : comps) {
			if (!c.anchored && anchoredGroups.contains(c.root())) {
				falling.add(c);
			}
		}
		return falling;
	}

	private static void union(Component a, Component b) {
		Component ra = a.root();
		Component rb = b.root();
		if (ra != rb) {
			rb.parent = ra;
		}
	}

	// ------------------------------------------------------------------------------------------
	// 3. Detach falling parts

	private static final class Body {
		final List<PartNode> members = new ArrayList<>();
		final List<BlockPos> attachments = new ArrayList<>();
		final Map<BlockPos, Optional<CompoundTag>> blockEntities = new HashMap<>();
		final Map<BlockPos, BlockState> attachmentStates = new HashMap<>();
		int sideVote;
	}

	private int detach(List<Component> falling) {
		Map<PartNode, Body> owner = new HashMap<>();
		List<Body> bodies = new ArrayList<>();
		for (Component c : falling) {
			Body body = new Body();
			body.members.addAll(c.members);
			for (PartNode m : c.members) {
				owner.put(m, body);
			}
			bodies.add(body);
		}
		for (Body body : bodies) {
			this.claimLeaves(body, owner);
		}

		// Decide what happens to each touched cell.
		LinkedHashMap<BlockPos, List<PartNode>> movedByCell = new LinkedHashMap<>();
		for (Body body : bodies) {
			for (PartNode m : body.members) {
				movedByCell.computeIfAbsent(m.cell, k -> new ArrayList<>()).add(m);
				if (m.isSplit()) {
					body.sideVote += m.side;
				}
			}
		}

		// Read block entities before anything changes (only for blocks that move as a whole).
		for (Body body : bodies) {
			for (PartNode m : body.members) {
				boolean wholeHere = !m.isSplit() || owner.get(m.twin) == body;
				if (wholeHere && m.oldPlanes.isEmpty() && !body.blockEntities.containsKey(m.cell)) {
					BlockEntity be = this.level.getBlockEntity(m.cell);
					if (be != null) {
						body.blockEntities.put(m.cell, Optional.of(be.saveWithFullMetadata(this.level.registryAccess())));
					}
				}
			}
		}

		LongOpenHashSet removed = new LongOpenHashSet();
		List<BlockPos> changed = new ArrayList<>();
		for (Map.Entry<BlockPos, List<PartNode>> e : movedByCell.entrySet()) {
			BlockPos pos = e.getKey();
			List<PartNode> moving = e.getValue();
			BlockState current = this.level.getBlockState(pos);
			PartNode any = moving.getFirst();
			BlockEntity be = this.level.getBlockEntity(pos);
			PartNode stays = null;
			if (any.isSplit() && moving.size() == 1) {
				stays = any.twin;
			}
			if (stays != null) {
				// Part of the block remains: it becomes a cut block. Containers spill their contents.
				if (be instanceof Container container && !current.is(ModBlocks.CUT_BLOCK)) {
					Containers.dropContents(this.level, pos, container);
				}
				if (be instanceof Clearable clearable) {
					clearable.clearContent();
				}
				BlockState cutState = CutBlock.stateFor(ModBlocks.CUT_BLOCK, stays.state);
				this.level.removeBlockEntity(pos);
				this.level.setBlock(pos, cutState, SILENT);
				if (this.level.getBlockEntity(pos) instanceof CutBlockEntity cut) {
					cut.setContents(stays.state, stays.planes, true);
				}
			} else {
				boolean sameBody = moving.size() == 1 || owner.get(moving.get(0)) == owner.get(moving.get(1));
				if (!sameBody && be instanceof Container container && !current.is(ModBlocks.CUT_BLOCK)) {
					// Split between two falling pieces: the contents spill out.
					Containers.dropContents(this.level, pos, container);
				}
				if (be instanceof Clearable clearable) {
					clearable.clearContent();
				}
				this.level.removeBlockEntity(pos);
				this.level.setBlock(pos, current.getFluidState().createLegacyBlock(), SILENT);
				removed.add(pos.asLong());
			}
			changed.add(pos);
		}

		// Grazed blocks that stay keep a sliver poking into the space the falling part leaves;
		// trim it so the falling part slides past instead of catching on it.
		Set<BlockPos> trimmed = new HashSet<>();
		for (Body body : bodies) {
			for (PartNode m : body.members) {
				for (Direction dir : DIRS) {
					PartNode[] around = this.nodes.get(m.cell.relative(dir).asLong());
					if (around == null || around.length != 1) {
						continue;
					}
					PartNode n = around[0];
					if (n.isSplit() || owner.containsKey(n) || n.planes.size() == n.oldPlanes.size() || removed.contains(n.cell.asLong())
						|| !trimmed.add(n.cell)) {
						continue;
					}
					BlockEntity nbe = this.level.getBlockEntity(n.cell);
					if (nbe != null && !(nbe instanceof CutBlockEntity)) {
						continue;
					}
					this.level.setBlock(n.cell, CutBlock.stateFor(ModBlocks.CUT_BLOCK, n.state), SILENT);
					if (this.level.getBlockEntity(n.cell) instanceof CutBlockEntity cut) {
						cut.setContents(n.state, n.planes, true);
					}
					changed.add(n.cell);
				}
			}
		}

		// Things hanging off the falling parts (torches, vines, flowers on top...) come along.
		// That includes things on a block that was split: if what stays behind cannot hold them, they
		// leave with the half that moves.
		ArrayDeque<BlockPos> queue = new ArrayDeque<>();
		Map<Long, Body> ownerOfCell = new HashMap<>();
		for (Body body : bodies) {
			for (PartNode m : body.members) {
				if ((removed.contains(m.cell.asLong()) || m.isSplit()) && ownerOfCell.putIfAbsent(m.cell.asLong(), body) == null) {
					queue.add(m.cell);
				}
			}
		}
		int attachedCount = 0;
		while (!queue.isEmpty() && attachedCount < 4096) {
			BlockPos pos = queue.poll();
			Body body = ownerOfCell.get(pos.asLong());
			for (Direction dir : DIRS) {
				BlockPos np = pos.relative(dir);
				long key = np.asLong();
				if (removed.contains(key) || !this.level.isLoaded(np)) {
					continue;
				}
				BlockState ns = this.level.getBlockState(np);
				if (ns.isAir() || ns.getBlock() instanceof LiquidBlock || ns.is(ModBlocks.CUT_BLOCK)) {
					continue;
				}
				if (ns.canSurvive(this.level, np) || ns.getDestroySpeed(this.level, np) < 0 || !this.mayModify(np, ns)) {
					continue;
				}
				BlockEntity nbe = this.level.getBlockEntity(np);
				if (nbe != null) {
					body.blockEntities.put(np, Optional.of(nbe.saveWithFullMetadata(this.level.registryAccess())));
					if (nbe instanceof Clearable clearable) {
						clearable.clearContent();
					}
				}
				body.attachments.add(np);
				body.attachmentStates.put(np, ns);
				this.level.removeBlockEntity(np);
				this.level.setBlock(np, ns.getFluidState().createLegacyBlock(), SILENT);
				removed.add(key);
				changed.add(np);
				ownerOfCell.put(key, body);
				queue.add(np);
				attachedCount++;
			}
		}

		// Let the rest of the world react (fences disconnect, water flows in, redstone updates...).
		for (BlockPos pos : changed) {
			BlockState now = this.level.getBlockState(pos);
			now.updateNeighbourShapes(this.level, pos, Block.UPDATE_ALL);
			this.level.updateNeighborsAt(pos, now.getBlock());
		}

		// Spawn the pieces.
		int spawned = 0;
		for (Body body : bodies) {
			if (this.spawnBody(body, owner)) {
				spawned++;
			}
		}
		return spawned;
	}

	/** Natural leaves join the falling part they are closest to (by their leaf distance). */
	private void claimLeaves(Body body, Map<PartNode, Body> owner) {
		ArrayDeque<PartNode> queue = new ArrayDeque<>();
		Map<PartNode, Integer> depth = new HashMap<>();
		List<PartNode> start = new ArrayList<>(body.members);
		for (PartNode m : start) {
			this.visitLeafNeighbours(m, 0, body, owner, queue, depth);
		}
		while (!queue.isEmpty()) {
			PartNode leaf = queue.poll();
			this.visitLeafNeighbours(leaf, depth.get(leaf), body, owner, queue, depth);
		}
	}

	private void visitLeafNeighbours(PartNode from, int fromDepth, Body body, Map<PartNode, Body> owner, ArrayDeque<PartNode> queue, Map<PartNode, Integer> depth) {
		int next = fromDepth + 1;
		if (next > 7) {
			return;
		}
		for (Direction dir : DIRS) {
			PartNode[] around = this.nodesAt(from.cell.relative(dir));
			for (PartNode leaf : around) {
				if (!leaf.softLeaves || owner.containsKey(leaf) || this.anchorNodes.containsKey(leaf)) {
					continue;
				}
				if (next > BlockGeometry.leafDistance(leaf.state)) {
					continue;
				}
				if (!Bonds.face(from, leaf, dir, this.slash, this.space)) {
					continue;
				}
				owner.put(leaf, body);
				body.members.add(leaf);
				depth.put(leaf, next);
				queue.add(leaf);
			}
		}
	}

	private boolean spawnBody(Body body, Map<PartNode, Body> owner) {
		// Collapse split cells whose halves both ended up in this body.
		Map<BlockPos, PartNode> byCell = new LinkedHashMap<>();
		Set<BlockPos> whole = new HashSet<>();
		for (PartNode m : body.members) {
			if (byCell.containsKey(m.cell)) {
				whole.add(m.cell);
			} else {
				byCell.put(m.cell, m);
			}
		}
		if (byCell.isEmpty()) {
			return false;
		}
		int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE;
		for (BlockPos p : byCell.keySet()) {
			minX = Math.min(minX, p.getX());
			minY = Math.min(minY, p.getY());
			minZ = Math.min(minZ, p.getZ());
		}
		for (BlockPos p : body.attachments) {
			minX = Math.min(minX, p.getX());
			minY = Math.min(minY, p.getY());
			minZ = Math.min(minZ, p.getZ());
		}
		BlockPos origin = new BlockPos(minX, minY, minZ);
		List<PieceBlock> blocks = new ArrayList<>();
		for (Map.Entry<BlockPos, PartNode> e : byCell.entrySet()) {
			PartNode m = e.getValue();
			List<Plane> planes = whole.contains(e.getKey()) ? m.oldPlanes : m.planes;
			Optional<CompoundTag> tag = body.blockEntities.getOrDefault(e.getKey(), Optional.empty());
			blocks.add(new PieceBlock(e.getKey().subtract(origin), m.state, planes, tag));
		}
		for (BlockPos p : body.attachments) {
			blocks.add(new PieceBlock(p.subtract(origin), body.attachmentStates.get(p), List.of(), body.blockEntities.getOrDefault(p, Optional.empty())));
		}

		Vector3d gridOrigin = new Vector3d(origin.getX(), origin.getY(), origin.getZ());
		PieceEntity piece = PieceEntity.create(this.level, blocks, gridOrigin, new Quaterniond(), new Vector3d(), new Vector3d(), new Vector3d());
		if (piece == null) {
			return false;
		}
		// Kick: the blade drags the piece along its travel direction, and the halves part slightly.
		Vector3d com = new Vector3d(piece.getX(), piece.getY(), piece.getZ());
		double massScale = Math.min(1.0, 3.0 / Math.sqrt(Math.max(piece.body().mass, 0.01)));
		Vector3d kick = this.slash.bladeDirection(com.x, com.y, com.z).mul(this.config.slashPush * (0.35 + 0.65 * massScale));
		double part = Math.signum(body.sideVote);
		kick.fma(0.25 * part * massScale, this.slash.n);
		piece.vel.add(kick);
		piece.markFreshCut();
		double spin = 0.25 * massScale;
		piece.angVel.add((this.level.getRandom().nextDouble() - 0.5) * spin, (this.level.getRandom().nextDouble() - 0.5) * spin, (this.level.getRandom().nextDouble() - 0.5) * spin);
		this.level.addFreshEntity(piece);
		BladeMode.LOGGER.debug("Detached piece of {} blocks at {}", blocks.size(), origin);
		return true;
	}

}
