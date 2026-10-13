package dev.calibercraft.gametest;

import dev.calibercraft.client.GunController;
import dev.calibercraft.client.screen.GunsmithScreen;
import dev.calibercraft.client.screen.SettingsScreen;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.item.WeaponStacks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CameraType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import org.lwjgl.glfw.GLFW;

/**
 * Drives the real client: singleplayer presentation (every weapon in first person, aiming, firing, reloading,
 * third person, gunsmith and settings screens at several GUI scales) and a dedicated-server round trip.
 * Screenshots land in build/run/clientGameTest/screenshots. Run with {@code ./gradlew runClientGameTest}
 * (needs a display; use xvfb-run on headless machines).
 */
public class CaliberCraftClientGameTest implements FabricClientGameTest {
	private static final String[] WEAPONS = {"m9", "revolver", "vector9", "mp5", "ar15", "ak", "bullpup", "pump_shotgun", "auto_shotgun",
		"sniper", "dmr", "lmg"};

	@Override
	public void runTest(ClientGameTestContext ctx) {
		ctx.runOnClient(mc -> {
			mc.options.guiScale().set(2);
			mc.options.framerateLimit().set(60);
		});
		try (TestSingleplayerContext sp = ctx.worldBuilder().adjustSettings(s -> {
			s.setGameMode(net.minecraft.client.gui.screens.worldselection.WorldCreationUiState.SelectedGameMode.CREATIVE);
		}).create()) {
			sp.getClientWorld().waitForChunksRender();
			sp.getServer().runCommand("time set noon");
			sp.getServer().runCommand("weather clear");
			sp.getServer().runCommand("gamerule doDaylightCycle false");
			sp.getServer().runCommand("gamerule doWeatherCycle false");
			sp.getServer().runCommand("summon minecraft:zombie ~ ~ ~6 {NoAI:1b,PersistenceRequired:1b}");
			ctx.waitTicks(20);

			for (String w : WEAPONS) {
				give(sp, w, 0);
				ctx.waitTicks(25);
				ctx.takeScreenshot("weapon_" + w + "_hip");
			}

			give(sp, "ar15", 0);
			ctx.waitTicks(25);
			ctx.getInput().holdMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			ctx.waitTicks(15);
			ctx.takeScreenshot("ar15_ads_iron");
			ctx.getInput().holdMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
			ctx.waitTick();
			ctx.takeScreenshot("ar15_firing");
			ctx.getInput().releaseMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
			ctx.getInput().releaseMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			ctx.waitTicks(10);
			int shots = ctx.computeOnClient(mc -> GunController.INSTANCE.shotsFired);
			if (shots < 1) {
				throw new AssertionError("expected at least one shot to be fired, got " + shots);
			}
			ctx.getInput().pressKey(GLFW.GLFW_KEY_R);
			ctx.waitTicks(14);
			ctx.takeScreenshot("ar15_reload_mag_out");
			ctx.waitTicks(10);
			ctx.takeScreenshot("ar15_reload_mag_in");
			ctx.waitTicks(30);

			give(sp, "sniper", 0);
			ctx.waitTicks(30);
			ctx.getInput().holdMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			ctx.waitTicks(20);
			ctx.takeScreenshot("sniper_scoped");
			ctx.getInput().releaseMouse(GLFW.GLFW_MOUSE_BUTTON_RIGHT);
			ctx.waitTicks(10);

			give(sp, "pump_shotgun", 0);
			ctx.waitTicks(20);
			ctx.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
			ctx.waitTicks(4);
			ctx.takeScreenshot("pump_cycling");
			ctx.waitTicks(20);

			ctx.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT));
			give(sp, "ak", 0);
			ctx.waitTicks(20);
			ctx.takeScreenshot("third_person_ak");
			ctx.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));

			for (int scale : new int[] {2, 3, 4}) {
				int s = scale;
				ctx.runOnClient(mc -> {
					mc.options.guiScale().set(s);
					mc.resizeDisplay();
				});
				ctx.setScreen(() -> {
					GunsmithScreen.open(true);
					return net.minecraft.client.Minecraft.getInstance().screen;
				});
				ctx.waitTicks(10);
				ctx.takeScreenshot("gunsmith_scale_" + scale);
				ctx.setScreen(() -> null);
			}
			ctx.runOnClient(mc -> {
				mc.options.guiScale().set(2);
				mc.resizeDisplay();
			});
			ctx.setScreen(() -> new SettingsScreen(null));
			ctx.waitTicks(5);
			ctx.takeScreenshot("settings_screen");
			ctx.setScreen(() -> null);

			sp.getServer().runOnServer(server -> {
				ServerPlayer p = server.getPlayerList().getPlayers().getFirst();
				ItemStack gun = WeaponStacks.create(item("vector9"), CaliberDataHolder.server(), true);
				gun.set(dev.calibercraft.registry.ModComponents.SKIN, Identifier.fromNamespaceAndPath("calibercraft", "energy"));
				WeaponStacks.refreshAppearance(gun);
				p.setItemInHand(InteractionHand.MAIN_HAND, gun);
			});
			ctx.waitTicks(25);
			ctx.takeScreenshot("vector9_energy_skin");
		}

		// Dedicated server round trip: the server must accept and apply a shot sent by a real client.
		try (TestDedicatedServerContext server = ctx.worldBuilder().createServer()) {
			server.runCommand("op Player0");
			try (TestServerConnection connection = server.connect()) {
				connection.getClientWorld().waitForChunksRender();
				server.runOnServer(s -> {
					ServerPlayer p = s.getPlayerList().getPlayers().getFirst();
					p.setGameMode(GameType.SURVIVAL);
					p.setItemInHand(InteractionHand.MAIN_HAND, WeaponStacks.create(item("mp5"), CaliberDataHolder.server(), true));
				});
				ctx.waitTicks(30);
				int before = server.computeOnServer(s -> WeaponStacks.state(s.getPlayerList().getPlayers().getFirst().getMainHandItem()).total());
				ctx.getInput().pressMouse(GLFW.GLFW_MOUSE_BUTTON_LEFT);
				ctx.waitTicks(10);
				int after = server.computeOnServer(s -> WeaponStacks.state(s.getPlayerList().getPlayers().getFirst().getMainHandItem()).total());
				if (after >= before) {
					throw new AssertionError("dedicated server did not register the shot: " + before + " -> " + after);
				}
				ctx.takeScreenshot("dedicated_server_mp5");
			}
		}
	}

	private static net.minecraft.world.item.Item item(String id) {
		return BuiltInRegistries.ITEM.getValue(Identifier.fromNamespaceAndPath("calibercraft", id));
	}

	private static void give(TestSingleplayerContext sp, String weapon, int slot) {
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = server.getPlayerList().getPlayers().getFirst();
			p.getInventory().setItem(slot, WeaponStacks.create(item(weapon), CaliberDataHolder.server(), true));
		});
	}
}
