package com.jjkshowdown.client.input;

import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.qte.QteClient;
import com.jjkshowdown.client.screen.CharacterSelectScreen;
import com.jjkshowdown.client.screen.JjkConfigScreen;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.qte.QteManager;
import com.jjkshowdown.sorcerer.CharacterType;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;

import java.util.EnumMap;
import java.util.Map;

/**
 * Translates key state into packets at the start of every client tick: ability press/release (holds for charging),
 * dodge, guard, double jump, hover, QTE presses and cinematic skipping.
 */
public final class InputHandler {
	private static final Map<AbilitySlot, Boolean> SENT_DOWN = new EnumMap<>(AbilitySlot.class);
	private static boolean blockDown;
	private static boolean jumpWasDown;
	private static boolean jumpReleasedInAir;
	private static boolean hovering;
	private static int lastForwardTap = -100, lastBackTap = -100, lastLeftTap = -100, lastRightTap = -100;
	private static boolean fwdWas, backWas, leftWas, rightWas;
	private static int clientTicks;

	private InputHandler() {
	}

	public static void tick(Minecraft mc) {
		clientTicks++;
		LocalPlayer player = mc.player;
		if (player == null || mc.getConnection() == null) return;

		// menus are usable even without a character
		while (Keybinds.CHARACTER_MENU.consumeClick()) {
			if (mc.screen == null) mc.setScreen(new CharacterSelectScreen(false));
		}
		while (Keybinds.CONFIG_MENU.consumeClick()) {
			if (mc.screen == null) mc.setScreen(new JjkConfigScreen(null));
		}

		// cinematics: jump skips
		if (CameraDirector.isActive()) {
			if (mc.options.keyJump.consumeClick() && ClientState.serverConfig.cinematics.allowSkip) CameraDirector.skip();
			releaseAll();
			return;
		}

		// quick-time events take the relevant keys
		QteClient.Active qte = QteClient.active;
		if (qte != null) {
			KeyMapping k = switch (qte.key) {
				case DODGE -> Keybinds.DODGE;
				case ATTACK -> mc.options.keyAttack;
				case DOMAIN -> Keybinds.ABILITY.get(AbilitySlot.DOMAIN);
				case ULTIMATE -> Keybinds.ABILITY.get(AbilitySlot.ULTIMATE);
				case JUMP -> mc.options.keyJump;
			};
			while (k.consumeClick()) QteClient.press(qte.key);
			if (qte.key == QteManager.Key.DODGE || qte.key == QteManager.Key.ATTACK) return;
		}

		CharacterType c = ClientState.character();
		if (!c.isSorcerer() || mc.screen != null) {
			releaseAll();
			return;
		}

		// abilities (hold-aware)
		for (Map.Entry<AbilitySlot, KeyMapping> e : Keybinds.ABILITY.entrySet()) {
			AbilitySlot slot = e.getKey();
			KeyMapping key = e.getValue();
			boolean down = key.isDown();
			boolean clicked = false;
			while (key.consumeClick()) clicked = true;
			boolean sent = SENT_DOWN.getOrDefault(slot, false);
			if ((down || clicked) && !sent) {
				ClientPlayNetworking.send(new Payloads.AbilityInput(slot.ordinal(), true));
				SENT_DOWN.put(slot, true);
				sent = true;
			} else if (clicked && slot == AbilitySlot.DOMAIN && ClientState.clash != null && ClientState.clash.active()) {
				// mashing during a clash: every click counts
				ClientPlayNetworking.send(new Payloads.AbilityInput(slot.ordinal(), true));
			}
			if (!down && sent) {
				ClientPlayNetworking.send(new Payloads.AbilityInput(slot.ordinal(), false));
				SENT_DOWN.put(slot, false);
			}
		}

		// dodge
		boolean dodge = false;
		while (Keybinds.DODGE.consumeClick()) dodge = true;
		if (ClientConfig.get().doubleTapDodge) dodge |= doubleTap(mc);
		if (dodge) {
			var mv = player.input.getMoveVector();
			ClientPlayNetworking.send(new Payloads.CombatAction(Payloads.CombatAction.DODGE, mv.x, mv.y));
		}

		// guard
		boolean block = Keybinds.BLOCK.isDown();
		if (block != blockDown) {
			blockDown = block;
			ClientPlayNetworking.send(new Payloads.CombatAction(block ? Payloads.CombatAction.BLOCK_START : Payloads.CombatAction.BLOCK_END, 0, 0));
		}

		// double jump / hover
		boolean jump = mc.options.keyJump.isDown();
		if (player.onGround()) {
			jumpReleasedInAir = false;
			if (hovering) setHover(false);
		} else {
			if (!jump) jumpReleasedInAir = true;
			if (jump && !jumpWasDown && jumpReleasedInAir && !player.getAbilities().flying && !player.isInWater()) {
				ClientPlayNetworking.send(new Payloads.CombatAction(Payloads.CombatAction.DOUBLE_JUMP, 0, 0));
			}
			// Gojo: keep holding jump while falling to hover
			boolean wantHover = c == CharacterType.GOJO && jump && player.getDeltaMovement().y < -0.1 && !player.getAbilities().flying;
			if (wantHover != hovering && (wantHover || !jump)) setHover(wantHover);
		}
		jumpWasDown = jump;
	}

	private static void setHover(boolean on) {
		hovering = on;
		ClientPlayNetworking.send(new Payloads.CombatAction(on ? Payloads.CombatAction.HOVER_START : Payloads.CombatAction.HOVER_END, 0, 0));
	}

	private static boolean doubleTap(Minecraft mc) {
		boolean f = mc.options.keyUp.isDown(), b = mc.options.keyDown.isDown(), l = mc.options.keyLeft.isDown(), r = mc.options.keyRight.isDown();
		boolean hit = false;
		if (f && !fwdWas) {
			hit |= clientTicks - lastForwardTap < 6;
			lastForwardTap = clientTicks;
		}
		if (b && !backWas) {
			hit |= clientTicks - lastBackTap < 6;
			lastBackTap = clientTicks;
		}
		if (l && !leftWas) {
			hit |= clientTicks - lastLeftTap < 6;
			lastLeftTap = clientTicks;
		}
		if (r && !rightWas) {
			hit |= clientTicks - lastRightTap < 6;
			lastRightTap = clientTicks;
		}
		fwdWas = f;
		backWas = b;
		leftWas = l;
		rightWas = r;
		return hit;
	}

	/** Send releases for anything still held (screen opened, cinematic started, character cleared). */
	public static void releaseAll() {
		if (Minecraft.getInstance().getConnection() == null) return;
		for (Map.Entry<AbilitySlot, Boolean> e : SENT_DOWN.entrySet()) {
			if (e.getValue()) {
				ClientPlayNetworking.send(new Payloads.AbilityInput(e.getKey().ordinal(), false));
				e.setValue(false);
			}
		}
		if (blockDown) {
			blockDown = false;
			ClientPlayNetworking.send(new Payloads.CombatAction(Payloads.CombatAction.BLOCK_END, 0, 0));
		}
		if (hovering) setHover(false);
	}

	/** True if movement input must be suppressed (paralysis / cinematic / stagger). */
	public static boolean movementLocked() {
		return CameraDirector.isActive() || ClientState.isOverloaded() || ClientState.isLocked();
	}
}
