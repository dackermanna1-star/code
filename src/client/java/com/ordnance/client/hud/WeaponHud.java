package com.ordnance.client.hud;

import com.ordnance.client.fx.StrikeMarkers;
import com.ordnance.config.ConfigManager;
import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.GrenadeItem;
import com.ordnance.weapon.GrenadeLauncherItem;
import com.ordnance.weapon.MagazineComponent;
import com.ordnance.weapon.MagazineWeaponItem;
import com.ordnance.weapon.StrikeDesignatorItem;
import com.ordnance.weapon.WeaponHelper;
import com.ordnance.registry.ModItems;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.MathHelper;

/** Compact weapon readout beside the hotbar, lock-on reticle for the designator, and incoming strike warnings. */
public final class WeaponHud {
	private static final int WHITE = 0xFFFFFFFF;
	private static final int GREY = 0xFFA0A0A0;
	private static final int AMBER = 0xFFFFB040;
	private static final int RED = 0xFFFF4040;

	private WeaponHud() {
	}

	public static void render(DrawContext context, RenderTickCounter tickCounter) {
		MinecraftClient client = MinecraftClient.getInstance();
		ClientPlayerEntity player = client.player;
		if (player == null || client.options.hudHidden || !ConfigManager.get().visuals.weaponHud) {
			return;
		}

		TextRenderer font = client.textRenderer;
		int width = context.getScaledWindowWidth();
		int height = context.getScaledWindowHeight();
		strikeWarning(context, font, player, width, height);

		ItemStack stack = player.getMainHandStack();
		int x = width / 2 + 98;
		int y = height - 21;
		if (stack.getItem() instanceof MagazineWeaponItem weapon) {
			magazine(context, font, player, stack, weapon, x, y);
		} else if (stack.getItem() instanceof FlamethrowerItem) {
			int fuel = FlamethrowerItem.fuel(stack);
			int max = FlamethrowerItem.maxFuel();
			context.drawTextWithShadow(font, Text.translatable("hud.ordnance.fuel"), x, y - 10, fuel > 0 ? AMBER : RED);
			bar(context, x, y + 1, 60, fuel / (float)max, fuel > max / 5 ? 0xFFFF8A20 : RED);
			int canisters = WeaponHelper.count(player, ModItems.FUEL_CANISTER);
			context.drawTextWithShadow(font, Text.literal("+" + canisters), x + 64, y - 2, GREY);
		} else if (stack.getItem() instanceof StrikeDesignatorItem) {
			designator(context, font, player, width, height, x, y);
		}

		ItemStack active = player.getActiveItem();
		if (player.isUsingItem() && active.getItem() instanceof GrenadeItem grenade && ConfigManager.get().weapons.grenades.cooking && !grenade.profile().style().isSmoke()) {
			float left = (ConfigManager.get().weapons.grenades.fuseTicks - player.getItemUseTime()) / 20.0F;
			int color = left < 1.0F ? RED : left < 2.0F ? AMBER : WHITE;
			Text text = Text.translatable("hud.ordnance.fuse", String.format("%.1f", Math.max(0.0F, left)));
			context.drawCenteredTextWithShadow(font, text, width / 2, height / 2 + 14, color);
		}
	}

	private static void magazine(DrawContext context, TextRenderer font, ClientPlayerEntity player, ItemStack stack, MagazineWeaponItem weapon, int x, int y) {
		MagazineComponent magazine = MagazineWeaponItem.magazine(stack);
		int spare = WeaponHelper.countAmmo(player, weapon.ammoCategory());
		Text name = magazine.isEmpty() ? Text.translatable("hud.ordnance.empty") : magazine.next().value().getName();
		context.drawTextWithShadow(font, name, x, y - 10, magazine.isEmpty() ? RED : WHITE);
		StringBuilder rounds = new StringBuilder();
		for (int i = 0; i < weapon.magazineSize(); i++) {
			rounds.append(i < magazine.size() ? '▮' : '▯');
		}

		Text line = Text.literal(rounds + "  +" + (player.isInCreativeMode() ? "∞" : String.valueOf(spare)));
		if (weapon instanceof GrenadeLauncherItem) {
			line = line.copy().append("  ").append(Text.translatable(GrenadeLauncherItem.fireMode(stack).translationKey()));
		}

		context.drawTextWithShadow(font, line, x, y, GREY);
		if (player.isUsingItem() && player.getActiveItem() == stack && magazine.size() < weapon.magazineSize()) {
			bar(context, x, y + 10, 60, weapon.reloadProgress(stack, player), 0xFF60C0FF);
		} else if (magazine.isEmpty() && spare > 0) {
			context.drawTextWithShadow(font, Text.translatable("hud.ordnance.reload"), x, y + 10, AMBER);
		}
	}

	private static void designator(DrawContext context, TextRenderer font, ClientPlayerEntity player, int width, int height, int x, int y) {
		int missiles = WeaponHelper.count(player, ModItems.HYPERSONIC_MISSILE);
		context.drawTextWithShadow(font, Text.translatable("hud.ordnance.missiles", player.isInCreativeMode() ? "∞" : String.valueOf(missiles)), x, y - 4, missiles > 0 || player.isInCreativeMode() ? WHITE : RED);
		if (!player.isUsingItem() || !(player.getActiveItem().getItem() instanceof StrikeDesignatorItem)) {
			return;
		}

		BlockHitResult hit = StrikeDesignatorItem.raycastTarget(player, 1.0F);
		int cx = width / 2;
		int cy = height / 2;
		if (hit == null) {
			context.drawCenteredTextWithShadow(font, Text.translatable("hud.ordnance.no_target"), cx, cy + 16, GREY);
			return;
		}

		float progress = StrikeDesignatorItem.lockProgress(player);
		double range = player.getEyePos().distanceTo(hit.getPos());
		boolean locked = progress >= 1.0F;
		int color = locked ? RED : AMBER;
		int box = 10 + (int)((1.0F - progress) * 14.0F);
		outline(context, cx - box, cy - box, cx + box, cy + box, color);
		Text status = locked ? Text.translatable("hud.ordnance.locked") : Text.translatable("hud.ordnance.locking", (int)(progress * 100.0F));
		context.drawCenteredTextWithShadow(font, status, cx, cy + box + 6, color);
		context.drawCenteredTextWithShadow(font, Text.translatable("hud.ordnance.range", (int)range), cx, cy + box + 16, GREY);
	}

	private static void strikeWarning(DrawContext context, TextRenderer font, ClientPlayerEntity player, int width, int height) {
		StrikeMarkers.Marker marker = StrikeMarkers.nearest(player.getEntityPos(), 160.0);
		if (marker == null) {
			return;
		}

		boolean blink = (player.age / 5) % 2 == 0;
		float seconds = StrikeMarkers.secondsLeft(marker);
		Text text = Text.translatable("hud.ordnance.incoming", String.format("%.1f", seconds));
		context.drawCenteredTextWithShadow(font, text, width / 2, height / 4, blink ? RED : 0xFFFFA0A0);
		int distance = (int)player.getEntityPos().distanceTo(marker.target);
		context.drawCenteredTextWithShadow(font, Text.translatable("hud.ordnance.distance", distance), width / 2, height / 4 + 11, GREY);
	}

	private static void bar(DrawContext context, int x, int y, int width, float fraction, int color) {
		fraction = MathHelper.clamp(fraction, 0.0F, 1.0F);
		context.fill(x - 1, y - 1, x + width + 1, y + 4, 0xA0000000);
		context.fill(x, y, x + (int)(width * fraction), y + 3, color);
	}

	private static void outline(DrawContext context, int x1, int y1, int x2, int y2, int color) {
		context.fill(x1, y1, x2, y1 + 1, color);
		context.fill(x1, y2 - 1, x2, y2, color);
		context.fill(x1, y1, x1 + 1, y2, color);
		context.fill(x2 - 1, y1, x2, y2, color);
	}
}
