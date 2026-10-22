package dev.juukulius.test;

import com.mojang.authlib.GameProfile;
import dev.juukulius.JuliusMod;
import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusData;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.client.ClientJulius;
import dev.juukulius.client.anim.AnimClips;
import dev.juukulius.client.hud.SpiritWheelScreen;
import dev.juukulius.client.input.JuliusKeys;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.network.ActionRequestPayload;
import dev.juukulius.network.ActionRequestPayload.Action;
import dev.juukulius.registry.JuliusItems;
import dev.juukulius.spirit.Spirit;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * Runs the real client. Singleplayer: drives Julius with the actual key bindings (transform, combo, spirit selection,
 * arts, specials, Al Cranvel, death and respawn) and checks prediction and sync. Dedicated server: a second player
 * performs every technique on the server while this client watches, which checks that other players see the
 * transformation, animations and effects. Screenshots of both are written to the test run's screenshots folder.
 */
public class JuliusClientGameTest implements FabricClientGameTest {
	private static final List<String> TEXTURES = List.of(
		"textures/entity/julius/julius_wide.png", "textures/entity/julius/julius_slim.png", "textures/entity/julius/outfit.png",
		"textures/entity/stone_spike.png", "textures/gui/hud_icons.png", "textures/gui/spirit_wheel.png", "textures/effect/glow.png",
		"textures/effect/magic_circle_outer.png", "textures/effect/rainbow_swirl.png", "textures/item/house_juukulius_sword.png",
		"textures/item/house_juukulius_sword_energy.png"
	);

	@Override
	public void runTest(ClientGameTestContext context) {
		checkResources(context);
		context.runOnClient(minecraft -> {
			minecraft.options.setCameraType(CameraType.FIRST_PERSON);
			minecraft.options.hideGui = false;
			// Small distances and no menu blur keep frames cheap on software-rendered CI machines, where every client
			// tick (and with it the lockstep server) waits for the frame.
			minecraft.options.renderDistance().set(4);
			minecraft.options.simulationDistance().set(5);
			minecraft.options.menuBackgroundBlurriness().set(0);
			minecraft.options.cloudStatus().set(CloudStatus.OFF);
		});
		context.getInput().resizeWindow(960, 540);

		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			singleplayer(context, world.getServer());
		}

		try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
			try (TestServerConnection connection = server.connect()) {
				connection.getClientWorld().waitForChunksRender();
				multiplayer(context, server);
			}
		}
	}

	// ------------------------------------------------------------------------------------------------ resources

	private static void checkResources(ClientGameTestContext context) {
		context.runOnClient(minecraft -> {
			for (JuliusAnim animation : JuliusAnim.values()) {
				check(AnimClips.INSTANCE.get(animation) != null, "animation clip missing: " + animation.clipName);
			}

			for (String texture : TEXTURES) {
				check(minecraft.getResourceManager().getResource(JuliusMod.id(texture)).isPresent(), "texture missing: " + texture);
			}

			for (Identifier sound : BuiltInRegistries.SOUND_EVENT.keySet()) {
				if (sound.getNamespace().equals(JuliusMod.MOD_ID)) {
					check(minecraft.getSoundManager().getSoundEvent(sound) != null, "sound event has no sounds.json entry: " + sound);
				}
			}
		});
	}

	// ------------------------------------------------------------------------------------------------ singleplayer

	private static void singleplayer(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("difficulty peaceful");
		server.runCommand("time set 6000");
		context.waitTicks(5);

		// Transform with the key binding: the server grants the sword and the client sees the synced appearance.
		context.getInput().pressKey(JuliusKeys.TRANSFORM);
		context.waitFor(minecraft -> ClientJulius.transformed(), 40);
		context.waitTicks(30);
		check(context.computeOnClient(minecraft -> minecraft.player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD)),
			"the first transformation grants the sword");
		context.takeScreenshot("sp_first_person_transformed");

		context.runOnClient(minecraft -> minecraft.options.setCameraType(CameraType.THIRD_PERSON_FRONT));
		context.waitTicks(2);
		context.takeScreenshot("sp_third_person_front");

		// Three-hit combo with the attack key; mana is restored by hits only, so just check the combo plays and costs nothing.
		float manaBefore = context.computeOnClient(minecraft -> ClientJulius.mana());
		for (int hit = 1; hit <= 3; hit++) {
			context.getInput().pressKey(options -> options.keyAttack);
			context.waitTicks(2);
			context.takeScreenshot("sp_combo_" + hit + "_mid");
			context.waitTicks(3);
		}

		context.waitTicks(20);
		check(context.computeOnClient(minecraft -> ClientJulius.mana()) >= manaBefore - 0.01F, "the combo costs no mana");

		// Spirit selection: a tap moves to the next spirit, the server confirms it.
		context.getInput().pressKey(JuliusKeys.SPIRIT_SELECT);
		context.waitTicks(4);
		Spirit selected = server.computeOnServer(s -> Spirit.byIndex(JuliusAttachments.data(onlyPlayer(s)).selectedSpirit));
		check(selected == Spirit.KUA, "tapping the spirit key selects the next spirit, got " + selected);

		// Holding the key opens the spirit wheel; releasing it closes the wheel.
		context.getInput().holdKey(JuliusKeys.SPIRIT_SELECT);
		context.waitForScreen(SpiritWheelScreen.class);
		context.takeScreenshot("sp_spirit_wheel");
		context.getInput().releaseKey(JuliusKeys.SPIRIT_SELECT);
		context.waitForScreen(null);

		// Each spirit's primary art from the key binding; the server spends mana and starts the cooldown.
		server.runCommand("julius reset @a");
		for (Spirit spirit : Spirit.values()) {
			server.runOnServer(s -> JuliusServer.handleRequest(onlyPlayer(s), new ActionRequestPayload(Action.SELECT_SPIRIT, spirit.ordinal())));
			context.waitTicks(3);
			context.getInput().pressKey(JuliusKeys.SPIRIT_ART);
			context.waitTicks(4);
			context.takeScreenshot("sp_art_" + spirit.id);
			int cooldown = server.computeOnServer(s -> JuliusAttachments.data(onlyPlayer(s)).cooldown(spirit.primaryArt));
			check(cooldown > 0, spirit.id + "'s art should have been cast");
			context.waitTicks(16);
			server.runCommand("julius reset @a");
		}

		// Sword special and charge.
		context.getInput().pressKey(JuliusKeys.SWORD_SPECIAL);
		context.waitTicks(5);
		context.takeScreenshot("sp_heavy_strike");
		context.waitTicks(20);
		context.getInput().holdKeyFor(options -> options.keyUse, CombatRules.CHARGE_FULL_TICKS + 4);
		context.takeScreenshot("sp_charge_release");
		context.waitTicks(20);

		// Al Cranvel from the key binding, then the HUD with the ultimate running.
		server.runCommand("julius reset @a");
		context.getInput().pressKey(JuliusKeys.ULTIMATE);
		context.waitTicks(10);
		context.takeScreenshot("sp_cranvel_awakening");
		context.waitTicks(30);
		check(context.computeOnClient(minecraft -> ClientJulius.ultimateActive()), "Al Cranvel is active on the client");
		context.runOnClient(minecraft -> minecraft.options.setCameraType(CameraType.FIRST_PERSON));
		context.waitTicks(2);
		context.takeScreenshot("sp_cranvel_first_person_hud");

		// Death reverts the transformation; respawning starts untransformed with the respawn mana.
		server.runCommand("kill @a");
		context.waitForScreen(DeathScreen.class);
		context.waitTicks(25);
		context.clickScreenButton("deathScreen.respawn");
		context.waitForScreen(null);
		context.waitTicks(10);
		check(!context.computeOnClient(minecraft -> ClientJulius.transformed()), "respawned untransformed");
		float mana = server.computeOnServer(s -> JuliusAttachments.data(onlyPlayer(s)).mana);
		check(mana >= CombatRules.MANA_AFTER_DEATH && mana < CombatRules.MANA_AFTER_DEATH + 15.0F, "respawn mana (plus a little regeneration), got " + mana);
		context.getInput().pressKey(JuliusKeys.TRANSFORM);
		context.waitFor(minecraft -> ClientJulius.transformed(), 40);
		context.waitTicks(CombatRules.TRANSFORM_COOLDOWN + 2);
		context.getInput().pressKey(JuliusKeys.TRANSFORM);
		context.waitFor(minecraft -> !ClientJulius.transformed(), 40);
	}

	// ------------------------------------------------------------------------------------------------ multiplayer

	/**
	 * A second player ("Julius") joins the dedicated server and performs every technique server-side, while this
	 * client stands nearby as an observer. Everything it sees arrives through the server's synchronisation.
	 */
	private static void multiplayer(ClientGameTestContext context, TestDedicatedServerContext server) {
		server.runCommand("difficulty peaceful");
		server.runCommand("time set 6000");
		server.runCommand("gamemode spectator @a");
		UUID julius = server.computeOnServer(JuliusClientGameTest::spawnSecondPlayer);
		context.runOnClient(minecraft -> minecraft.options.hideGui = true);
		// Watch from Julius's front right, so the sword arm faces the camera.
		server.runCommand("tp @a[gamemode=spectator] -1.6 -60 3.0 -140 11");
		context.waitTicks(20);
		check(context.computeOnClient(minecraft -> remote(minecraft, julius) != null), "the second player is visible to this client");

		runAs(server, julius, Action.TRANSFORM, 0);
		context.waitTicks(6);
		context.takeScreenshot("mp_transform_flash");
		context.waitTicks(30);
		check(context.computeOnClient(minecraft -> JuliusAttachments.appearance(remote(minecraft, julius)).transformed()),
			"other players see the transformation");
		context.takeScreenshot("mp_transformed_idle");

		// Close-ups of the character from the front, the back and the side.
		server.runCommand("tp @a[gamemode=spectator] 0.5 -59.6 2.6 180 12");
		context.waitTicks(4);
		context.takeScreenshot("mp_closeup_front");
		server.runCommand("tp @a[gamemode=spectator] 0.5 -59.6 -1.6 0 12");
		context.waitTicks(4);
		context.takeScreenshot("mp_closeup_back");
		server.runCommand("tp @a[gamemode=spectator] -1.6 -59.6 0.5 -90 12");
		context.waitTicks(4);
		context.takeScreenshot("mp_closeup_side");
		server.runCommand("tp @a[gamemode=spectator] -1.6 -60 3.0 -140 11");
		context.waitTicks(4);

		for (int step = 1; step <= 3; step++) {
			runAs(server, julius, Action.SWING, step);
			context.waitTicks(step == 3 ? 4 : 3);
			context.takeScreenshot("mp_slash_" + step);
			context.waitTicks(step == 3 ? 12 : 2);
		}

		context.waitTicks(10);
		runAs(server, julius, Action.SWORD_SPECIAL, 0);
		context.waitTicks(5);
		context.takeScreenshot("mp_heavy_windup");
		context.waitTicks(3);
		context.takeScreenshot("mp_heavy_impact");
		context.waitTicks(20);

		server.runOnServer(s -> {
			ServerPlayer player = s.getPlayerList().getPlayer(julius);
			player.startUsingItem(InteractionHand.MAIN_HAND);
		});
		context.waitTicks(CombatRules.CHARGE_FULL_TICKS);
		context.takeScreenshot("mp_charging");
		server.runOnServer(s -> s.getPlayerList().getPlayer(julius).releaseUsingItem());
		context.waitTicks(2);
		context.takeScreenshot("mp_al_clarista_wave");
		context.waitTicks(20);

		for (Spirit spirit : Spirit.values()) {
			for (int combination = 0; combination <= 1; combination++) {
				server.runCommand("julius reset Julius");
				runAs(server, julius, Action.SELECT_SPIRIT, spirit.ordinal());
				context.waitTicks(4);
				runAs(server, julius, Action.SPIRIT_ART, combination);
				context.waitTicks(6);
				context.takeScreenshot("mp_art_" + spirit.art(combination == 1).id);
				context.waitTicks(Math.max(spirit.art(combination == 1).lockTicks, 12));
			}
		}

		server.runCommand("julius reset Julius");
		runAs(server, julius, Action.SWORD_SPECIAL, 1);
		context.waitTicks(8);
		context.takeScreenshot("mp_al_clauzeria_gather");
		context.waitTicks(8);
		context.takeScreenshot("mp_al_clauzeria_release");
		context.waitTicks(30);

		server.runCommand("julius reset Julius");
		runAs(server, julius, Action.ULTIMATE, 0);
		context.waitTicks(10);
		context.takeScreenshot("mp_cranvel_rise");
		context.waitTicks(10);
		context.takeScreenshot("mp_cranvel_burst");
		context.waitTicks(25);
		context.takeScreenshot("mp_cranvel_active");
		check(context.computeOnClient(minecraft -> JuliusAttachments.appearance(remote(minecraft, julius)).ultimateEnd() > 0L),
			"other players see Al Cranvel");

		server.runOnServer(s -> JuliusAttachments.data(s.getPlayerList().getPlayer(julius)).ultimateTicks = 2);
		context.waitTicks(10);
		context.takeScreenshot("mp_cranvel_end");
		context.waitTicks(20);

		runAs(server, julius, Action.TOGGLE_SPIRITS, 0);
		context.waitTicks(14);
		check(context.computeOnClient(minecraft -> !JuliusAttachments.appearance(remote(minecraft, julius)).spiritsOut()),
			"other players see the spirits dismissed");
		context.waitTicks(30);
		runAs(server, julius, Action.TRANSFORM, 0);
		context.waitTicks(8);
		context.takeScreenshot("mp_revert");
		context.waitTicks(20);
		check(context.computeOnClient(minecraft -> !JuliusAttachments.appearance(remote(minecraft, julius)).transformed()),
			"other players see the revert");
		server.runOnServer(s -> s.getPlayerList().remove(s.getPlayerList().getPlayer(julius)));
		context.runOnClient(minecraft -> minecraft.options.hideGui = false);
	}

	/** Joins a server-side player named Julius (backed by an in-memory connection) at the stage, holding the sword. */
	private static UUID spawnSecondPlayer(MinecraftServer server) {
		ServerLevel level = server.overworld();
		CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), "Julius"), false);
		ServerPlayer player = new ServerPlayer(server, level, cookie.gameProfile(), cookie.clientInformation());
		Connection connection = new Connection(PacketFlow.SERVERBOUND);
		new EmbeddedChannel(connection);
		server.getPlayerList().placeNewPlayer(connection, player, cookie);
		player.teleportTo(level, 0.5, -60.0, 0.5, Set.of(), 0.0F, 0.0F, true);
		player.setYHeadRot(0.0F);
		player.setYBodyRot(0.0F);
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(JuliusItems.HOUSE_JUUKULIUS_SWORD));
		JuliusData data = JuliusAttachments.data(player);
		data.swordGranted = true;
		// Without a network connection nothing ticks this player; tick it like a connected one so its held item is
		// broadcast and item use (the charge) advances.
		UUID uuid = player.getUUID();
		ServerTickEvents.END_SERVER_TICK.register(s -> {
			ServerPlayer mock = s.getPlayerList().getPlayer(uuid);
			if (mock != null) {
				mock.doTick();
			}
		});
		return uuid;
	}

	private static void runAs(TestDedicatedServerContext server, UUID player, Action action, int argument) {
		server.runOnServer(s -> JuliusServer.handleRequest(s.getPlayerList().getPlayer(player), new ActionRequestPayload(action, argument)));
	}

	private static AbstractClientPlayer remote(Minecraft minecraft, UUID uuid) {
		Player player = minecraft.level.getPlayerByUUID(uuid);
		return player instanceof AbstractClientPlayer client ? client : null;
	}

	private static ServerPlayer onlyPlayer(MinecraftServer server) {
		return server.getPlayerList().getPlayers().getFirst();
	}

	private static void check(boolean condition, String message) {
		if (!condition) {
			throw new AssertionError(message);
		}
	}
}
