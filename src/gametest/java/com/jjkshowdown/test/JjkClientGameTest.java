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
			// rival boss: intro, a practice QTE, then a domain clash against the rival
			sp.getServer().runCommand("jjk cooldowns reset @a");
			sp.getServer().runCommand("jjk energy fill @a");
			sp.getServer().runCommand("effect give @a minecraft:resistance 600 3 true");
			sp.getServer().runCommand("execute as @p at @s run jjk duel gojo");
			ctx.waitTicks(30);
			ctx.takeScreenshot("20_rival_intro");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 400);
			sp.getServer().runCommand("execute as @p run jjk qte test");
			ctx.waitTicks(10);
			ctx.takeScreenshot("21_qte_prompt");
			ctx.getInput().pressKey(Keybinds.DODGE);
			ctx.waitTicks(4);
			ctx.takeScreenshot("22_qte_result");
			ctx.waitTicks(20);
			sp.getServer().runCommand("jjk energy fill @a");
			sp.getServer().runCommand("jjk cooldowns reset @a");
			press(ctx, AbilitySlot.DOMAIN);
			ctx.waitFor(mc -> CameraDirector.isActive(), 60);
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitFor(mc -> ClientState.clash != null || CameraDirector.isActive(), 200);
			ctx.waitTicks(10);
			ctx.takeScreenshot("23_clash_cinematic");
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			for (int i = 0; i < 12; i++) {
				press(ctx, AbilitySlot.DOMAIN);
				ctx.waitTicks(2);
			}
			ctx.takeScreenshot("24_domain_clash");
			ctx.waitTicks(80);
			ctx.takeScreenshot("25_clash_later");
			ctx.waitTicks(200);
			ctx.takeScreenshot("26_after_clash");
			// rival gallery: Gojo and Sukuna, then Sukuna's Heian-era true form (phase two)
			sp.getServer().runCommand("jjk domain end");
			sp.getServer().runCommand("kill @e[type=jjkshowdown:gojo]");
			ctx.waitTicks(10);
			if (ctx.tryClickScreenButton("deathScreen.respawn")) ctx.waitTicks(40);
			sp.getServer().runCommand("effect clear @a");
			sp.getServer().runCommand("jjk cooldowns reset @a");
			ctx.waitTicks(20);
			sp.getServer().runCommand("tp @a 0 -60 0 0 10");
			sp.getServer().runCommand("summon jjkshowdown:sukuna 1.6 -60 5 {NoAI:1b,Rotation:[180f,0f]}");
			sp.getServer().runCommand("summon jjkshowdown:gojo -1.6 -60 5 {NoAI:1b,Rotation:[180f,0f]}");
			ctx.waitTicks(30);
			ctx.takeScreenshot("27_rivals_portrait");
			sp.getServer().runCommand("damage @e[type=jjkshowdown:sukuna,limit=1] 260");
			ctx.waitTicks(5);
			ctx.waitFor(mc -> !CameraDirector.isActive(), 300);
			ctx.waitTicks(20);
			ctx.takeScreenshot("28_heian_sukuna");
			ctx.setScreen(() -> new JjkConfigScreen(null));
			ctx.waitTicks(10);
			ctx.takeScreenshot("29_config_screen");
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
