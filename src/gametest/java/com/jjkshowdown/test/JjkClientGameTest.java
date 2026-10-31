package com.jjkshowdown.test;

import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.input.Keybinds;
import com.jjkshowdown.client.screen.CharacterSelectScreen;
import com.jjkshowdown.client.screen.JjkConfigScreen;
import com.jjkshowdown.sorcerer.CharacterType;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.KeyMapping;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * End-to-end client test with screenshots (run: xvfb-run ./gradlew runClientGameTest).
 * Screenshots land in build/run/clientGameTest/screenshots.
 */
public class JjkClientGameTest implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext ctx) {
		try (TestSingleplayerContext sp = ctx.worldBuilder()
				.adjustSettings(s -> s.setWorldType(new net.minecraft.client.gui.screens.worldselection.WorldCreationUiState.WorldTypeEntry(
						s.getSettings().worldgenLoadContext().lookupOrThrow(net.minecraft.core.registries.Registries.WORLD_PRESET).getOrThrow(WorldPresets.FLAT))))
				.create()) {
			sp.getClientWorld().waitForChunksRender();
			// first join opens character selection
			ctx.waitForScreen(CharacterSelectScreen.class);
			ctx.waitTicks(30);
			ctx.takeScreenshot("01_character_select");
			ctx.setScreen(() -> null);
			sp.getServer().runCommand("time set noon");
			sp.getServer().runCommand("gamerule advance_time false");
			sp.getServer().runCommand("gamemode survival @a");
			sp.getServer().runCommand("jjk character gojo @a");
			ctx.waitTicks(30);
			ctx.takeScreenshot("02_gojo_intro_cinematic");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 400);
			sp.getServer().runCommand("jjk mastery set 10 @a");
			sp.getServer().runCommand("summon minecraft:zombie ~6 ~ ~");
			sp.getServer().runCommand("summon minecraft:husk ~8 ~ ~3");
			sp.getServer().runCommand("summon minecraft:skeleton ~9 ~ ~-3");
			sp.getServer().runCommand("tp @a ~ ~ ~ -90 10");
			ctx.waitTicks(20);
			ctx.takeScreenshot("03_gojo_hud");
			// Infinity: skeleton arrows stop in mid-air
			press(ctx, AbilitySlot.TOGGLE);
			sp.getServer().runCommand("execute at @p run summon minecraft:skeleton ~10 ~ ~2");
			ctx.waitTicks(70);
			ctx.takeScreenshot("03b_infinity_arrows");
			// Blue (charged)
			hold(ctx, AbilitySlot.PRIMARY, 25);
			ctx.waitTicks(8);
			ctx.takeScreenshot("04_blue");
			ctx.waitTicks(40);
			// Red
			hold(ctx, AbilitySlot.SECONDARY, 20);
			ctx.waitTicks(4);
			ctx.takeScreenshot("05_red");
			ctx.waitTicks(30);
			// Hollow Purple: charge, cinematic, fire
			ctx.getInput().holdKey(Keybinds.ABILITY.get(AbilitySlot.ULTIMATE));
			ctx.waitTicks(25);
			ctx.takeScreenshot("06_purple_charge");
			ctx.waitTicks(20);
			ctx.getInput().releaseKey(Keybinds.ABILITY.get(AbilitySlot.ULTIMATE));
			ctx.waitTicks(20);
			ctx.takeScreenshot("07_purple_cinematic");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitTicks(6);
			ctx.takeScreenshot("08_purple_fired");
			ctx.waitTicks(60);
			// Unlimited Void
			sp.getServer().runCommand("jjk energy fill @a");
			sp.getServer().runCommand("summon minecraft:zombie ~5 ~ ~");
			press(ctx, AbilitySlot.DOMAIN);
			ctx.waitTicks(22);
			ctx.takeScreenshot("09_void_cinematic");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitTicks(20);
			ctx.takeScreenshot("10_unlimited_void_inside");
			sp.getServer().runCommand("jjk domain end");
			ctx.waitTicks(60);
			// Sukuna
			sp.getServer().runCommand("jjk character sukuna @a");
			ctx.waitFor(mc -> ClientState.character() == CharacterType.SUKUNA, 100);
			ctx.waitFor(mc -> !CameraDirector.isActive(), 400);
			sp.getServer().runCommand("jjk mastery set 10 @a");
			sp.getServer().runCommand("summon minecraft:zombie ~7 ~ ~");
			sp.getServer().runCommand("summon minecraft:zombie ~8 ~ ~2");
			ctx.waitTicks(10);
			ctx.takeScreenshot("11_sukuna_hud");
			press(ctx, AbilitySlot.PRIMARY);
			ctx.waitTicks(3);
			ctx.takeScreenshot("12_dismantle");
			ctx.waitTicks(20);
			hold(ctx, AbilitySlot.PRIMARY, 30);
			ctx.takeScreenshot("13_dismantle_barrage");
			ctx.waitTicks(30);
			hold(ctx, AbilitySlot.TERTIARY, 28);
			ctx.waitTicks(10);
			ctx.takeScreenshot("14_fuga");
			ctx.waitTicks(40);
			sp.getServer().runCommand("jjk energy fill @a");
			press(ctx, AbilitySlot.DOMAIN);
			ctx.waitTicks(25);
			ctx.takeScreenshot("15_shrine_cinematic");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitTicks(30);
			ctx.takeScreenshot("16_malevolent_shrine");
			ctx.waitTicks(60);
			ctx.takeScreenshot("17_shrine_destruction");
			sp.getServer().runCommand("jjk domain end");
			ctx.waitTicks(60);
			// World-Cutting Slash
			sp.getServer().runCommand("jjk cooldowns reset @a");
			sp.getServer().runCommand("jjk energy fill @a");
			ctx.getInput().holdKey(Keybinds.ABILITY.get(AbilitySlot.ULTIMATE));
			ctx.waitTicks(40);
			ctx.takeScreenshot("18_world_slash_incantation");
			ctx.waitTicks(30);
			ctx.getInput().releaseKey(Keybinds.ABILITY.get(AbilitySlot.ULTIMATE));
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitTicks(3);
			ctx.takeScreenshot("19_world_slash");
			ctx.waitTicks(40);
			// rival boss
			sp.getServer().runCommand("jjk cooldowns reset @a");
			sp.getServer().runCommand("execute as @p at @s run jjk duel gojo");
			ctx.waitTicks(30);
			ctx.takeScreenshot("20_rival_intro");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 400);
			ctx.waitTicks(40);
			ctx.takeScreenshot("21_rival_fight");
			ctx.waitTicks(100);
			ctx.takeScreenshot("22_rival_fight_later");
			ctx.setScreen(() -> new JjkConfigScreen(null));
			ctx.waitTicks(10);
			ctx.takeScreenshot("23_config_screen");
			ctx.setScreen(() -> null);
		}
	}

	private static void press(ClientGameTestContext ctx, AbilitySlot slot) {
		KeyMapping k = Keybinds.ABILITY.get(slot);
		ctx.getInput().holdKey(k);
		ctx.waitTicks(2);
		ctx.getInput().releaseKey(k);
	}

	private static void hold(ClientGameTestContext ctx, AbilitySlot slot, int ticks) {
		KeyMapping k = Keybinds.ABILITY.get(slot);
		ctx.getInput().holdKey(k);
		ctx.waitTicks(ticks);
		ctx.getInput().releaseKey(k);
	}
}
