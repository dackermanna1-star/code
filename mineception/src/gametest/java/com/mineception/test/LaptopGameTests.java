package com.mineception.test;

import com.mineception.ModContent;
import com.mineception.block.LaptopBlock;
import com.mineception.block.LaptopBlockEntity;
import com.mineception.block.LaptopDataCodecs;
import com.mineception.dream.Face;
import com.mineception.dream.LaptopData;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.network.EditBlockPayload;
import com.mineception.network.LaptopEdits;
import com.mineception.network.LaptopEdits.Result;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Server game tests for laptops: placement, data components, persistence and server-side edit validation. */
public class LaptopGameTests {
	private static final BlockPos LAPTOP = new BlockPos(3, 1, 3);

	private static LaptopBlockEntity placeLaptop(GameTestHelper helper, BlockPos pos, Direction facing) {
		helper.setBlock(pos, ModContent.LAPTOP.defaultBlockState().setValue(LaptopBlock.FACING, facing));
		return helper.getBlockEntity(pos, LaptopBlockEntity.class);
	}

	/** A survival player standing two blocks in front of the laptop, looking at it. */
	private static Player playerNear(GameTestHelper helper) {
		Player player = helper.makeMockPlayer(GameType.SURVIVAL);
		Vec3 at = helper.absoluteVec(new Vec3(3.5, 1.0, 5.5));
		player.setPos(at.x, at.y, at.z);
		return player;
	}

	private static EditBlockPayload edit(GameTestHelper helper, int depth, int x, int y, int z, MiniBlock block) {
		return new EditBlockPayload(helper.absolutePos(LAPTOP), depth, MiniWorld.index(x, y, z), block.id);
	}

	private static void expect(GameTestHelper helper, Result expected, Result actual, String what) {
		helper.assertValueEqual(expected, actual, what);
	}

	/** First cell of a level holding a block that may be broken, searching down from the top. */
	private static int[] breakableCell(MiniWorld world) {
		for (int y = MiniWorld.SY - 1; y > 0; y--) {
			for (int z = 0; z < MiniWorld.SZ; z++) {
				for (int x = 0; x < MiniWorld.SX; x++) {
					if (world.get(x, y, z).breakable()) {
						return new int[]{x, y, z};
					}
				}
			}
		}
		throw new IllegalStateException("nothing breakable");
	}

	/** The first {@code count} air cells of a level, scanning down from the sky. */
	private static int[][] airCells(MiniWorld world, int count) {
		int[][] cells = new int[count][];
		int found = 0;
		for (int i = MiniWorld.VOLUME - 1; i >= 0 && found < count; i--) {
			if (world.get(i) == MiniBlock.AIR) {
				cells[found++] = new int[]{MiniWorld.indexX(i), MiniWorld.indexY(i), MiniWorld.indexZ(i)};
			}
		}
		return cells;
	}

	/** An air cell right above the spawn's head (always free in every level). */
	private static int[] airCell(MiniWorld world) {
		return new int[]{(int) Math.floor(world.spawnX), (int) Math.floor(world.spawnY) + 1, (int) Math.floor(world.spawnZ)};
	}

	// ------------------------------------------------------------------ placement and data

	@GameTest
	public void placedLaptopsDreamUpTheirOwnSeeds(GameTestHelper helper) {
		LaptopBlockEntity a = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		LaptopBlockEntity b = placeLaptop(helper, new BlockPos(5, 1, 3), Direction.NORTH);
		long seed = a.data().seed();
		helper.assertValueEqual(seed, a.data().seed(), "seed is stable once assigned");
		helper.assertTrue(seed != b.data().seed(), "two laptops share the seed " + seed);
		for (int depth = 1; depth <= 4; depth++) {
			helper.assertValueEqual(0, a.data().editCount(depth), "fresh laptop has no edits");
		}
		helper.assertValueEqual(Direction.NORTH, helper.getBlockState(new BlockPos(5, 1, 3)).getValue(LaptopBlock.FACING), "facing");
		helper.succeed();
	}

	@GameTest
	public void playerPlacedLaptopFacesThePlayer(GameTestHelper helper) {
		Player player = helper.makeMockPlayer(GameType.CREATIVE);
		Vec3 at = helper.absoluteVec(new Vec3(3.5, 1.0, 6.5));
		player.snapTo(at.x, at.y, at.z, 180.0F, 30.0F);
		helper.setBlock(new BlockPos(3, 0, 3), net.minecraft.world.level.block.Blocks.STONE);
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModContent.LAPTOP_ITEM));
		helper.placeAt(player, player.getMainHandItem(), new BlockPos(3, 0, 3), Direction.UP);
		BlockState state = helper.getBlockState(LAPTOP);
		helper.assertTrue(state.is(ModContent.LAPTOP), "laptop placed");
		// The player looks north, so the screen faces back south toward them
		helper.assertValueEqual(Direction.SOUTH, state.getValue(LaptopBlock.FACING), "screen faces the player");
		helper.assertTrue(helper.getBlockEntity(LAPTOP, LaptopBlockEntity.class).revision() >= 0, "block entity exists");
		helper.succeed();
	}

	@GameTest
	public void outlineFollowsTheLaptopGeometry(GameTestHelper helper) {
		for (Direction direction : Direction.Plane.HORIZONTAL) {
			BlockState state = ModContent.LAPTOP.defaultBlockState().setValue(LaptopBlock.FACING, direction);
			VoxelShape shape = state.getShape(helper.getLevel(), helper.absolutePos(LAPTOP));
			double[][] boxes = LaptopGeometry.boxes(LaptopBlock.face(direction));
			AABB bounds = shape.bounds();
			for (int a = 0; a < 3; a++) {
				double min = Math.min(boxes[0][a], boxes[1][a]);
				double max = Math.max(boxes[0][a + 3], boxes[1][a + 3]);
				helper.assertTrue(Math.abs(bounds.min(Direction.Axis.values()[a]) - min) < 1e-9
					&& Math.abs(bounds.max(Direction.Axis.values()[a]) - max) < 1e-9, "outline bounds for " + direction);
			}
			double deckTop = LaptopGeometry.BASE[4];
			Vec3 overDeck = new Vec3(0.5 + 0.3 * LaptopBlock.face(direction).dx, deckTop + 0.01, 0.5 + 0.3 * LaptopBlock.face(direction).dz);
			helper.assertFalse(shape.toAabbs().stream().anyMatch(box -> box.contains(overDeck)), "open above the keyboard for " + direction);
		}
		helper.assertValueEqual(Face.EAST, LaptopBlock.face(Direction.EAST), "direction mapping");
		helper.succeed();
	}

	@GameTest
	public void laptopIsCraftableMineableAndDropsItself(GameTestHelper helper) {
		ItemStack iron = new ItemStack(net.minecraft.world.item.Items.IRON_INGOT);
		ItemStack pane = new ItemStack(net.minecraft.world.item.Items.GLASS_PANE);
		ItemStack redstone = new ItemStack(net.minecraft.world.item.Items.REDSTONE);
		ItemStack diamond = new ItemStack(net.minecraft.world.item.Items.DIAMOND);
		var input = net.minecraft.world.item.crafting.CraftingInput.of(3, 3, List.of(
			iron, pane, iron,
			redstone, diamond, redstone,
			iron, iron, iron));
		var recipe = helper.getLevel().recipeAccess().getRecipeFor(net.minecraft.world.item.crafting.RecipeType.CRAFTING, input, helper.getLevel());
		helper.assertTrue(recipe.isPresent(), "laptop recipe loaded");
		ItemStack result = recipe.get().value().assemble(input, helper.getLevel().registryAccess());
		helper.assertTrue(result.is(ModContent.LAPTOP_ITEM), "recipe makes a laptop, not " + result);
		helper.assertTrue(result.get(ModContent.LAPTOP_DATA) == null, "crafted laptops start dreamless");

		BlockState state = ModContent.LAPTOP.defaultBlockState();
		helper.assertTrue(state.is(net.minecraft.tags.BlockTags.MINEABLE_WITH_PICKAXE), "mineable with a pickaxe");
		var lootKey = ModContent.LAPTOP.getLootTable();
		helper.assertTrue(lootKey.isPresent(), "loot table key");
		var loot = helper.getLevel().getServer().reloadableRegistries().getLootTable(lootKey.get());
		helper.assertTrue(loot != net.minecraft.world.level.storage.loot.LootTable.EMPTY, "loot table loaded");
		helper.succeed();
	}

	// ------------------------------------------------------------------ codecs and persistence

	private static LaptopData sampleData() {
		LaptopData data = new LaptopData(0x1234_5678_9ABCL);
		data.putEdit(1, MiniWorld.index(3, 10, 4), MiniBlock.BRICKS);
		data.putEdit(1, MiniWorld.index(5, 6, 7), MiniBlock.AIR);
		data.putEdit(2, MiniWorld.index(20, 4, 20), MiniBlock.GLOWSTONE);
		data.putEdit(4, MiniWorld.VOLUME - 1, MiniBlock.GLASS);
		return data;
	}

	@GameTest
	public void dataCodecsRoundTrip(GameTestHelper helper) {
		LaptopData data = sampleData();
		Tag nbt = LaptopDataCodecs.CODEC.encodeStart(NbtOps.INSTANCE, data).getOrThrow();
		helper.assertValueEqual(data, LaptopDataCodecs.CODEC.parse(NbtOps.INSTANCE, nbt).getOrThrow(), "NBT round trip");

		ByteBuf buf = Unpooled.buffer();
		LaptopDataCodecs.STREAM_CODEC.encode(buf, data);
		helper.assertValueEqual(data, LaptopDataCodecs.STREAM_CODEC.decode(buf), "network round trip");
		helper.assertValueEqual(0, buf.readableBytes(), "whole packet consumed");

		// A hostile packet claiming too many edits is refused instead of allocating huge arrays
		ByteBuf evil = Unpooled.buffer();
		evil.writeLong(1L);
		ByteBufCodecs.VAR_INT.encode(evil, LaptopData.MAX_EDITS_PER_DEPTH + 1);
		boolean refused = false;
		try {
			LaptopDataCodecs.STREAM_CODEC.decode(evil);
		} catch (RuntimeException e) {
			refused = true;
		}
		helper.assertTrue(refused, "oversized edit list accepted");

		// As an item component, through the item stack codecs
		ItemStack stack = new ItemStack(ModContent.LAPTOP_ITEM);
		stack.set(ModContent.LAPTOP_DATA, data);
		var ops = helper.getLevel().registryAccess().createSerializationContext(NbtOps.INSTANCE);
		Tag stackTag = ItemStack.CODEC.encodeStart(ops, stack).getOrThrow();
		ItemStack decoded = ItemStack.CODEC.parse(ops, stackTag).getOrThrow();
		helper.assertValueEqual(data, decoded.get(ModContent.LAPTOP_DATA), "item stack NBT round trip");
		RegistryFriendlyByteBuf registryBuf = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
		ItemStack.STREAM_CODEC.encode(registryBuf, stack);
		helper.assertValueEqual(data, ItemStack.STREAM_CODEC.decode(registryBuf).get(ModContent.LAPTOP_DATA), "item stack network round trip");
		helper.succeed();
	}

	@GameTest
	public void dataSurvivesSaveAndLoad(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.EAST);
		laptop.setData(sampleData());
		laptop.applyEdit(3, MiniWorld.index(10, 12, 10), MiniBlock.OAK_LOG);
		var registries = helper.getLevel().registryAccess();
		CompoundTag saved = laptop.saveWithFullMetadata(registries);
		BlockEntity loaded = BlockEntity.loadStatic(laptop.getBlockPos(), laptop.getBlockState(), saved, registries);
		helper.assertTrue(loaded instanceof LaptopBlockEntity, "reloaded as a laptop");
		LaptopData back = ((LaptopBlockEntity) loaded).data();
		helper.assertValueEqual(laptop.data(), back, "data after save and load");
		helper.assertValueEqual(MiniBlock.OAK_LOG, back.build(3).get(10, 12, 10), "edit applied after load");
		// What clients receive when the chunk is sent or the laptop changes carries the same data
		CompoundTag update = laptop.getUpdateTag(registries);
		LaptopData synced = LaptopDataCodecs.CODEC.parse(NbtOps.INSTANCE, update.get("dream")).getOrThrow();
		helper.assertValueEqual(laptop.data(), synced, "update tag data");
		helper.assertTrue(laptop.getUpdatePacket() != null, "update packet");
		helper.succeed();
	}

	@GameTest(maxTicks = 40)
	public void brokenLaptopKeepsItsDreams(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		laptop.data();
		laptop.applyEdit(1, MiniWorld.index(10, 10, 10), MiniBlock.BRICKS);
		laptop.applyEdit(4, MiniWorld.index(12, 9, 12), MiniBlock.GLOWSTONE);
		LaptopData original = laptop.data().copy();
		BlockPos abs = helper.absolutePos(LAPTOP);
		helper.getLevel().destroyBlock(abs, true);
		helper.assertTrue(helper.getBlockState(LAPTOP).isAir(), "laptop broken");
		List<ItemEntity> drops = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(abs).inflate(2.0));
		helper.assertValueEqual(1, drops.size(), "one drop");
		ItemStack stack = drops.get(0).getItem();
		helper.assertTrue(stack.is(ModContent.LAPTOP_ITEM), "dropped a laptop");
		helper.assertValueEqual(original, stack.get(ModContent.LAPTOP_DATA), "item carries the data");
		// The block entity keeps its data out of the item's block entity tag: it travels as the component only
		helper.assertTrue(stack.get(net.minecraft.core.component.DataComponents.BLOCK_ENTITY_DATA) == null, "no duplicate block entity data");
		drops.get(0).discard();

		// Placing it again restores the same dreams, edits and all
		Player player = helper.makeMockPlayer(GameType.SURVIVAL);
		Vec3 at = helper.absoluteVec(new Vec3(3.5, 1.0, 6.5));
		player.snapTo(at.x, at.y, at.z, 180.0F, 30.0F);
		helper.setBlock(new BlockPos(3, 0, 3), net.minecraft.world.level.block.Blocks.STONE);
		// The placement context reads the item from the player's hand
		player.setItemInHand(InteractionHand.MAIN_HAND, stack.copy());
		helper.placeAt(player, player.getMainHandItem(), new BlockPos(3, 0, 3), Direction.UP);
		LaptopBlockEntity placed = helper.getBlockEntity(LAPTOP, LaptopBlockEntity.class);
		helper.assertValueEqual(original, placed.data(), "data after placing again");
		helper.assertValueEqual(MiniBlock.BRICKS, placed.level(1).get(10, 10, 10), "edit visible in the rebuilt level");
		helper.succeed();
	}

	// ------------------------------------------------------------------ server validation

	@GameTest
	public void validEditsAreAppliedAndSynced(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		Player player = playerNear(helper);
		MiniWorld level = laptop.level(1);
		int[] solid = breakableCell(level);
		int revision = laptop.revision();
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, edit(helper, 1, solid[0], solid[1], solid[2], MiniBlock.AIR)), "break");
		helper.assertValueEqual(MiniBlock.AIR, laptop.level(1).get(solid[0], solid[1], solid[2]), "cached level updated");
		helper.assertValueEqual(MiniBlock.AIR, laptop.data().build(1).get(solid[0], solid[1], solid[2]), "edit stored");
		helper.assertTrue(laptop.revision() > revision, "revision bumped");
		// Place into the hole just made, and into the air above the spawn
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, edit(helper, 1, solid[0], solid[1], solid[2], MiniBlock.GLOWSTONE)), "place");
		int[] air = airCell(laptop.level(2));
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, edit(helper, 2, air[0], air[1] + 1, air[2], MiniBlock.OAK_PLANKS)), "place in level 2");
		helper.assertValueEqual(1, laptop.data().editCount(1), "one cell edited twice in level 1");
		helper.assertValueEqual(1, laptop.data().editCount(2), "one edit in level 2");
		CompoundTag update = laptop.getUpdateTag(helper.getLevel().registryAccess());
		LaptopData synced = LaptopDataCodecs.CODEC.parse(NbtOps.INSTANCE, update.get("dream")).getOrThrow();
		helper.assertValueEqual(MiniBlock.GLOWSTONE, synced.build(1).get(solid[0], solid[1], solid[2]), "clients receive the edit");
		helper.succeed();
	}

	@GameTest
	public void placingIntoWaterIsAllowed(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		Player player = playerNear(helper);
		MiniWorld limbo = laptop.level(4);
		for (int i = 0; i < MiniWorld.VOLUME; i++) {
			if (limbo.get(i) == MiniBlock.WATER) {
				int x = MiniWorld.indexX(i);
				int y = MiniWorld.indexY(i);
				int z = MiniWorld.indexZ(i);
				expect(helper, Result.NOT_BREAKABLE, LaptopEdits.handle(player, edit(helper, 4, x, y, z, MiniBlock.AIR)), "break water");
				expect(helper, Result.APPLIED, LaptopEdits.handle(player, edit(helper, 4, x, y, z, MiniBlock.COBBLESTONE)), "place in water");
				helper.succeed();
				return;
			}
		}
		helper.fail("no water in Limbo");
	}

	@GameTest
	public void invalidEditsAreRejected(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		Player player = playerNear(helper);
		MiniWorld level = laptop.level(1);
		int[] solid = breakableCell(level);
		int[] air = airCell(level);
		BlockPos pos = helper.absolutePos(LAPTOP);
		LaptopData before = laptop.data().copy();

		expect(helper, Result.BAD_DEPTH, LaptopEdits.handle(player, new EditBlockPayload(pos, 0, 0, 0)), "depth 0");
		expect(helper, Result.BAD_DEPTH, LaptopEdits.handle(player, new EditBlockPayload(pos, 5, 0, 0)), "depth 5");
		expect(helper, Result.BAD_DEPTH, LaptopEdits.handle(player, new EditBlockPayload(pos, Integer.MIN_VALUE, 0, 0)), "depth min");
		expect(helper, Result.BAD_INDEX, LaptopEdits.handle(player, new EditBlockPayload(pos, 1, -1, 0)), "index -1");
		expect(helper, Result.BAD_INDEX, LaptopEdits.handle(player, new EditBlockPayload(pos, 1, MiniWorld.VOLUME, 0)), "index volume");
		expect(helper, Result.BAD_BLOCK, LaptopEdits.handle(player, new EditBlockPayload(pos, 1, MiniWorld.index(air[0], air[1], air[2]), 255)), "unknown id");
		expect(helper, Result.BAD_BLOCK, LaptopEdits.handle(player, new EditBlockPayload(pos, 1, MiniWorld.index(air[0], air[1], air[2]), -7)), "negative id");
		for (MiniBlock unplaceable : new MiniBlock[]{MiniBlock.BEDROCK, MiniBlock.LAPTOP, MiniBlock.WATER, MiniBlock.SEA_LANTERN}) {
			expect(helper, Result.BAD_BLOCK, LaptopEdits.handle(player, edit(helper, 1, air[0], air[1], air[2], unplaceable)), "place " + unplaceable);
		}
		expect(helper, Result.PROTECTED_CELL, LaptopEdits.handle(player, edit(helper, 1, 5, 0, 5, MiniBlock.AIR)), "break bedrock floor");
		expect(helper, Result.PROTECTED_CELL, LaptopEdits.handle(player, edit(helper, 1, level.laptopX, level.laptopY, level.laptopZ, MiniBlock.AIR)), "break laptop");
		expect(helper, Result.PROTECTED_CELL, LaptopEdits.handle(player, edit(helper, 1, level.laptopX, level.laptopY, level.laptopZ, MiniBlock.STONE)), "replace laptop");
		expect(helper, Result.OCCUPIED, LaptopEdits.handle(player, edit(helper, 1, solid[0], solid[1], solid[2], MiniBlock.STONE)), "place into a block");
		expect(helper, Result.NOT_BREAKABLE, LaptopEdits.handle(player, edit(helper, 1, air[0], air[1], air[2], MiniBlock.AIR)), "break air");
		helper.assertValueEqual(before, laptop.data(), "nothing changed");
		helper.succeed();
	}

	@GameTest
	public void editsNeedALivingPlayerNearTheLaptop(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		int[] solid = breakableCell(laptop.level(1));
		EditBlockPayload valid = edit(helper, 1, solid[0], solid[1], solid[2], MiniBlock.AIR);

		Player far = helper.makeMockPlayer(GameType.SURVIVAL);
		Vec3 farAway = helper.absoluteVec(new Vec3(3.5, 1.0, 3.5 + LaptopEdits.MAX_DISTANCE + 1.0));
		far.setPos(farAway.x, farAway.y, farAway.z);
		expect(helper, Result.TOO_FAR, LaptopEdits.handle(far, valid), "too far");

		Player spectator = helper.makeMockPlayer(GameType.SPECTATOR);
		Vec3 near = helper.absoluteVec(new Vec3(3.5, 1.0, 5.5));
		spectator.setPos(near.x, near.y, near.z);
		expect(helper, Result.NOT_ALIVE, LaptopEdits.handle(spectator, valid), "spectator");

		Player dead = playerNear(helper);
		dead.setHealth(0.0F);
		expect(helper, Result.NOT_ALIVE, LaptopEdits.handle(dead, valid), "dead");

		Player player = playerNear(helper);
		expect(helper, Result.NO_LAPTOP, LaptopEdits.handle(player, new EditBlockPayload(helper.absolutePos(new BlockPos(4, 1, 4)), 1, valid.index(), 0)), "no laptop");
		BlockPos remote = helper.absolutePos(LAPTOP).offset(30_000_000, 0, 0);
		expect(helper, Result.TOO_FAR, LaptopEdits.handle(player, new EditBlockPayload(remote, 1, valid.index(), 0)), "remote position");
		helper.assertValueEqual(0, laptop.data().editCount(1), "no edits");
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, valid), "a player next to it may edit");
		helper.succeed();
	}

	@GameTest(maxTicks = 60)
	public void editsAreRateLimited(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		Player player = playerNear(helper);
		MiniWorld level = laptop.level(1);
		int[][] cells = airCells(level, 120);
		int applied = 0;
		int limited = 0;
		// Thirty placements in one tick: the burst allows twenty
		for (int i = 0; i < 30; i++) {
			Result result = LaptopEdits.handle(player, edit(helper, 1, cells[i][0], cells[i][1], cells[i][2], MiniBlock.STONE));
			if (result == Result.APPLIED) {
				applied++;
			} else if (result == Result.RATE_LIMITED) {
				limited++;
			}
		}
		helper.assertValueEqual(LaptopEdits.BURST, applied, "edits allowed in a burst");
		helper.assertValueEqual(30 - LaptopEdits.BURST, limited, "edits refused");
		// Another player has their own allowance
		Player other = playerNear(helper);
		expect(helper, Result.APPLIED, LaptopEdits.handle(other, edit(helper, 1, cells[40][0], cells[40][1], cells[40][2], MiniBlock.STONE)), "other player");
		// After one second the allowance has refilled
		helper.runAfterDelay(20, () -> {
			int later = 0;
			for (int i = 50; i < 80; i++) {
				if (LaptopEdits.handle(player, edit(helper, 1, cells[i][0], cells[i][1], cells[i][2], MiniBlock.STONE)) == Result.APPLIED) {
					later++;
				}
			}
			helper.assertValueEqual(LaptopEdits.BURST, later, "edits allowed after a second");
			helper.succeed();
		});
	}

	@GameTest
	public void fullDreamsRefuseNewEdits(GameTestHelper helper) {
		LaptopBlockEntity laptop = placeLaptop(helper, LAPTOP, Direction.SOUTH);
		LaptopData data = laptop.data();
		// Fill level 3 to the edit cap, from the top layer down (the spawn area stays untouched)
		for (int i = 0; i < LaptopData.MAX_EDITS_PER_DEPTH; i++) {
			data.putEdit(3, MiniWorld.VOLUME - 1 - i, MiniBlock.AIR);
		}
		laptop.setData(data);
		Player player = playerNear(helper);
		int[] air = airCell(laptop.level(3));
		expect(helper, Result.DREAM_FULL, LaptopEdits.handle(player, edit(helper, 3, air[0], air[1], air[2], MiniBlock.DIRT)), "full level");
		helper.assertValueEqual(LaptopData.MAX_EDITS_PER_DEPTH, laptop.data().editCount(3), "cap respected");
		// Re-editing an already edited cell still works, and other levels are unaffected
		int top = MiniWorld.VOLUME - 1;
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, new EditBlockPayload(helper.absolutePos(LAPTOP), 3, top, MiniBlock.GLASS.id)), "edited cell");
		int[] cityAir = airCell(laptop.level(1));
		expect(helper, Result.APPLIED, LaptopEdits.handle(player, edit(helper, 1, cityAir[0], cityAir[1], cityAir[2], MiniBlock.DIRT)), "other level");
		helper.succeed();
	}
}
