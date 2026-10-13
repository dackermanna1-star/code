package dev.calibercraft.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.GameProfile;
import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.core.GunState;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.FirePayload;
import dev.calibercraft.network.GunActionPayload;
import dev.calibercraft.network.GunsmithPayload;
import dev.calibercraft.registry.ModComponents;
import dev.calibercraft.registry.ModItems;
import dev.calibercraft.server.AmmoInventory;
import dev.calibercraft.server.GunService;
import dev.calibercraft.server.GunsmithService;
import java.io.IOException;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ClientInformation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;
import io.netty.channel.embedded.EmbeddedChannel;

/**
 * Server-side game tests exercising the real weapon systems inside a running server: firing, damage, ammunition,
 * reload state machine, anti-abuse validation and customization. Run with {@code ./gradlew runGameTest}.
 */
public class CaliberCraftGameTests {
	private static final Identifier CC = Identifier.fromNamespaceAndPath("calibercraft", "x");

	private static Item item(String id) {
		return BuiltInRegistries.ITEM.getValue(CC.withPath(id));
	}

	/** Survival mock player at a relative position, looking toward +Z. Relative y=0 is the ground surface (the empty test structure is all air). */
	private static ServerPlayer survivalPlayer(GameTestHelper h, double x, double y, double z) {
		CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), "cc-tester"), false);
		ServerPlayer p = new ServerPlayer(h.getLevel().getServer(), h.getLevel(), cookie.gameProfile(), ClientInformation.createDefault()) {
			@Override
			public GameType gameMode() {
				return GameType.SURVIVAL;
			}

			@Override
			public boolean isCreative() {
				return false;
			}
		};
		Connection connection = new Connection(PacketFlow.SERVERBOUND);
		new EmbeddedChannel(connection);
		h.getLevel().getServer().getPlayerList().placeNewPlayer(connection, p, cookie);
		Vec3 pos = h.absoluteVec(new Vec3(x, y, z));
		p.snapTo(pos.x, pos.y, pos.z, 0f, 0f);
		p.getInventory().setSelectedSlot(0);
		return p;
	}

	private static ItemStack loaded(String weapon) {
		return WeaponStacks.create(item(weapon), CaliberDataHolder.server(), true);
	}

	private static GunState state(ServerPlayer p) {
		return WeaponStacks.state(p.getMainHandItem());
	}

	private static void fire(ServerPlayer p, int seq, int pull) {
		GunService.handleFire(new FirePayload(seq, pull, p.getYRot(), p.getXRot(), 0.5f, p.getInventory().getSelectedSlot()), p);
	}

	private static String diag(GameTestHelper h, ServerPlayer p, Zombie z) {
		return "[zombie " + h.relativeVec(z.position()) + " baby=" + z.isBaby() + " h=" + z.getHealth() + " eye=" + h.relativeVec(p.getEyePosition())
			+ " rot=" + p.getYRot() + "/" + p.getXRot() + " state=" + state(p) + "]";
	}

	private static void cleanup(GameTestHelper h, ServerPlayer p) {
		h.getLevel().getServer().getPlayerList().remove(p);
		p.discard();
	}

	@GameTest(maxTicks = 80)
	public void firingConsumesAmmoAndDamagesTarget(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("ar15"));
		Zombie z = h.spawnWithNoFreeWill(EntityType.ZOMBIE, new Vec3(1.5, 0, 6.5));
		float before = z.getHealth();
		h.runAfterDelay(15, () -> {
			GunState s0 = state(p);
			fire(p, 1, 1);
			GunState s1 = state(p);
			h.assertValueEqual(s0.total() - 1, s1.total(), "one round consumed");
			h.assertTrue(s1.chambered(), "self-loading action re-chambers");
			h.assertTrue(z.getHealth() < before, "target took damage (" + z.getHealth() + ")");
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 60)
	public void duplicateAndReplayedShotsAreIgnored(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("ar15"));
		h.runAfterDelay(15, () -> {
			int total = state(p).total();
			fire(p, 5, 1);
			fire(p, 5, 2);
			fire(p, 3, 3);
			h.assertValueEqual(total - 1, state(p).total(), "only the first packet with a new sequence fires");
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 60)
	public void fireRateAndSemiAutoAreEnforced(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("ar15"));
		h.runAfterDelay(15, () -> {
			int total = state(p).total();
			// Semi-auto (default mode): a held trigger (same pull id) fires once.
			fire(p, 1, 7);
			fire(p, 2, 7);
			h.assertValueEqual(total - 1, state(p).total(), "semi-auto needs a new trigger pull");
			// Spamming new pulls within the same instant is capped by the rate limiter's burst allowance.
			for (int i = 0; i < 30; i++) {
				fire(p, 10 + i, 100 + i);
			}
			int used = total - state(p).total();
			h.assertTrue(used <= 1 + (int) Math.ceil(ServerConfig.get().fireBurstAllowance), "rate limited, fired " + used);
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 60)
	public void shotsFromWrongSlotOrWhileEquippingAreRejected(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("sniper"));
		h.runAfterDelay(2, () -> {
			int total = state(p).total();
			fire(p, 1, 1); // sniper equip time is 14 ticks
			h.assertValueEqual(total, state(p).total(), "cannot fire while drawing");
			h.runAfterDelay(20, () -> {
				GunService.handleFire(new FirePayload(2, 2, 0, 0, 0.1f, 5), p);
				h.assertValueEqual(total, state(p).total(), "slot mismatch rejected");
				cleanup(h, p);
				h.succeed();
			});
		});
	}

	@GameTest(maxTicks = 120)
	public void magazineReloadCommitsAtTheRightTimeAndUsesReserve(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		ItemStack gun = loaded("ar15");
		gun.set(ModComponents.GUN_STATE, WeaponStacks.state(gun).withRounds(10));
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, gun);
		p.getInventory().add(new ItemStack(item("ammo_556"), 64));
		h.runAfterDelay(12, () -> {
			GunService.handleAction(new GunActionPayload(GunActionPayload.Action.RELOAD, 0), p);
			h.runAfterDelay(20, () -> h.assertValueEqual(10, state(p).rounds(), "nothing changes before the commit point"));
			h.runAfterDelay(45, () -> {
				h.assertValueEqual(30, state(p).rounds(), "magazine full after commit");
				h.assertTrue(state(p).chambered(), "tactical reload keeps the chambered round");
				h.assertValueEqual(44, AmmoInventory.countRaw(p, item("ammo_556")), "20 rounds taken from reserve");
				cleanup(h, p);
				h.succeed();
			});
		});
	}

	@GameTest(maxTicks = 100)
	public void interruptedReloadNeverLosesOrDuplicatesAmmunition(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		ItemStack gun = loaded("ak");
		gun.set(ModComponents.GUN_STATE, WeaponStacks.state(gun).withRounds(3));
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, gun);
		p.getInventory().add(new ItemStack(item("ammo_762"), 40));
		h.runAfterDelay(12, () -> {
			GunService.handleAction(new GunActionPayload(GunActionPayload.Action.RELOAD, 0), p);
			h.runAfterDelay(10, () -> p.getInventory().setSelectedSlot(4)); // switch weapons mid-reload
			h.runAfterDelay(60, () -> {
				h.assertValueEqual(3, WeaponStacks.state(gun).rounds(), "magazine untouched");
				h.assertValueEqual(40, AmmoInventory.countRaw(p, item("ammo_762")), "reserve untouched");
				cleanup(h, p);
				h.succeed();
			});
		});
	}

	@GameTest(maxTicks = 80)
	public void pumpShotgunMustCycleBetweenShots(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("pump_shotgun"));
		h.runAfterDelay(12, () -> {
			fire(p, 1, 1);
			h.assertTrue(!state(p).chambered(), "pump leaves the chamber empty");
			int total = state(p).total();
			fire(p, 2, 2);
			h.assertValueEqual(total, state(p).total(), "cannot fire before pumping");
			h.runAfterDelay(15, () -> {
				h.assertTrue(state(p).chambered(), "pump stroke chambered a shell");
				cleanup(h, p);
				h.succeed();
			});
		});
	}

	@GameTest(maxTicks = 40)
	public void attachmentsInstallRemoveAndValidate(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("ar15"));
		p.getInventory().add(new ItemStack(item("red_dot")));
		p.getInventory().add(new ItemStack(item("short_barrel")));
		h.runAfterDelay(2, () -> {
			int r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.OPTIC, Optional.of(CC.withPath("red_dot"))), p);
			h.assertValueEqual(GunsmithService.OK, r, "install result");
			h.assertValueEqual(Optional.of(CC.withPath("red_dot")), WeaponStacks.loadout(p.getMainHandItem()).get(AttachmentSlot.OPTIC), "installed");
			h.assertValueEqual(0, AmmoInventory.countRaw(p, item("red_dot")), "attachment item consumed");
			var cmd = p.getMainHandItem().get(DataComponents.CUSTOM_MODEL_DATA);
			h.assertValueEqual("calibercraft:red_dot", cmd.getString(AttachmentSlot.OPTIC.modelIndex), "model selection updated");
			r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.OPTIC, Optional.of(CC.withPath("suppressor"))), p);
			h.assertValueEqual(GunsmithService.INCOMPATIBLE, r, "muzzle device cannot go in the optic slot");
			r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.BARREL, Optional.of(CC.withPath("short_barrel"))), p);
			h.assertValueEqual(GunsmithService.NEEDS_BENCH, r, "barrels need a gunsmith bench in the field");
			r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.REMOVE, AttachmentSlot.OPTIC, Optional.empty()), p);
			h.assertValueEqual(GunsmithService.OK, r, "remove result");
			h.assertValueEqual(1, AmmoInventory.countRaw(p, item("red_dot")), "attachment returned");
			r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.OPTIC, Optional.of(CC.withPath("sniper_scope"))), p);
			h.assertValueEqual(GunsmithService.MISSING_ITEM, r, "cannot install what you don't own");
			p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("m9"));
			r = GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.OPTIC, Optional.of(CC.withPath("acog_scope"))), p);
			h.assertValueEqual(GunsmithService.INCOMPATIBLE, r, "the M9 does not accept a 3x scope");
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 40)
	public void customizationSurvivesSerialization(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		h.setBlock(new BlockPos(3, 1, 1), dev.calibercraft.registry.ModBlocks.GUNSMITH_BENCH);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("vector9"));
		p.getInventory().add(new ItemStack(item("short_barrel")));
		h.runAfterDelay(2, () -> {
			GunsmithService.openBench(p, h.absolutePos(new BlockPos(3, 1, 1)));
			h.assertValueEqual(GunsmithService.OK, GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.SKIN, AttachmentSlot.OPTIC,
				Optional.of(CC.withPath("woodland"))), p), "skin at bench");
			h.assertValueEqual(GunsmithService.OK, GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.INSTALL, AttachmentSlot.BARREL,
				Optional.of(CC.withPath("short_barrel"))), p), "barrel at bench");
			h.assertValueEqual(GunsmithService.NEEDS_KIT, GunsmithService.apply(new GunsmithPayload(GunsmithPayload.Op.SKIN, AttachmentSlot.OPTIC,
				Optional.of(CC.withPath("energy"))), p), "legendary finish needs a kit");
			ItemStack stack = p.getMainHandItem();
			Tag tag = ItemStack.CODEC.encodeStart(h.getLevel().registryAccess().createSerializationContext(NbtOps.INSTANCE), stack).getOrThrow();
			ItemStack back = ItemStack.CODEC.parse(h.getLevel().registryAccess().createSerializationContext(NbtOps.INSTANCE), tag).getOrThrow();
			h.assertValueEqual(CC.withPath("woodland"), WeaponStacks.skin(back), "skin persisted");
			h.assertValueEqual(WeaponStacks.loadout(stack), WeaponStacks.loadout(back), "attachments persisted");
			h.assertValueEqual(WeaponStacks.state(stack), WeaponStacks.state(back), "ammunition state persisted");
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 60)
	public void bulletsShatterGlassAndPassThrough(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("dmr"));
		h.setBlock(new BlockPos(1, 1, 4), Blocks.GLASS);
		Zombie z = h.spawnWithNoFreeWill(EntityType.ZOMBIE, new Vec3(1.5, 0, 6.5));
		float before = z.getHealth();
		h.runAfterDelay(15, () -> {
			fire(p, 1, 1);
			h.assertTrue(h.getLevel().getBlockState(h.absolutePos(new BlockPos(1, 1, 4))).isAir(), "glass shattered");
			h.assertTrue(z.getHealth() < before, "bullet continued into the target " + diag(h, p, z));
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest(maxTicks = 60)
	public void meleeBashHitsTargetInFront(GameTestHelper h) {
		ServerPlayer p = survivalPlayer(h, 1.5, 0, 1.5);
		p.setItemInHand(net.minecraft.world.InteractionHand.MAIN_HAND, loaded("pump_shotgun"));
		Zombie z = h.spawnWithNoFreeWill(EntityType.ZOMBIE, new Vec3(1.5, 0, 3.3));
		float before = z.getHealth();
		h.runAfterDelay(5, () -> {
			GunService.handleAction(new GunActionPayload(GunActionPayload.Action.MELEE, 0), p);
			h.assertTrue(z.getHealth() < before, "melee bash damaged the target " + diag(h, p, z));
			cleanup(h, p);
			h.succeed();
		});
	}

	@GameTest
	public void everyRegisteredItemAndSoundHasAssets(GameTestHelper h) {
		ModContainer mod = FabricLoader.getInstance().getModContainer("calibercraft").orElseThrow();
		JsonObject lang = json(mod, "assets/calibercraft/lang/en_us.json");
		JsonObject sounds = json(mod, "assets/calibercraft/sounds.json");
		List<String> problems = new ArrayList<>();
		int items = 0;
		for (Item item : BuiltInRegistries.ITEM) {
			Identifier id = BuiltInRegistries.ITEM.getKey(item);
			if (!id.getNamespace().equals("calibercraft")) {
				continue;
			}
			items++;
			if (mod.findPath("assets/calibercraft/items/" + id.getPath() + ".json").isEmpty()) {
				problems.add("item " + id + " has no item model definition");
			}
			if (!lang.has(item.getDescriptionId())) {
				problems.add("item " + id + " has no translation (" + item.getDescriptionId() + ")");
			}
		}
		int soundCount = 0;
		for (Identifier id : BuiltInRegistries.SOUND_EVENT.keySet()) {
			if (id.getNamespace().equals("calibercraft")) {
				soundCount++;
				if (!sounds.has(id.getPath())) {
					problems.add("sound event " + id + " is missing from sounds.json");
				}
			}
		}
		h.assertTrue(items >= 12 + 24 + 15, "registered items: " + items);
		h.assertTrue(soundCount > 50, "registered sound events: " + soundCount);
		h.assertTrue(problems.isEmpty(), problems.size() + " asset problem(s): " + String.join("; ", problems.subList(0, Math.min(10, problems.size()))));
		h.succeed();
	}

	private static JsonObject json(ModContainer mod, String path) {
		try (Reader r = Files.newBufferedReader(mod.findPath(path).orElseThrow())) {
			return JsonParser.parseReader(r).getAsJsonObject();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
