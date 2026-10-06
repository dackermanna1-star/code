package com.gojosatoru.client.hud;

import com.gojosatoru.GojoMod;
import com.gojosatoru.client.ClientGojo;
import com.gojosatoru.client.GojoKeys;
import com.gojosatoru.power.Ability;
import com.gojosatoru.power.GojoForm;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;

/** Cursed energy, technique cooldowns, technique names and full-screen flashes. */
public final class GojoHud {
    private static final Identifier ICON_BLUE = GojoMod.id("textures/gui/blue.png");
    private static final Identifier ICON_RED = GojoMod.id("textures/gui/red.png");
    private static final Identifier ICON_PURPLE = GojoMod.id("textures/gui/purple.png");
    private static final Identifier ICON_DOMAIN = GojoMod.id("textures/gui/domain.png");
    private static final Identifier ICON_TELEPORT = GojoMod.id("textures/gui/teleport.png");
    private static final Identifier ICON_INFINITY = GojoMod.id("textures/gui/infinity.png");

    private record Slot(Ability ability, Identifier icon) {
    }

    private static final Slot[] SLOTS = {
            new Slot(Ability.INFINITY, ICON_INFINITY),
            new Slot(Ability.BLUE, ICON_BLUE),
            new Slot(Ability.RED, ICON_RED),
            new Slot(Ability.PURPLE, ICON_PURPLE),
            new Slot(Ability.DOMAIN, ICON_DOMAIN),
            new Slot(Ability.TELEPORT, ICON_TELEPORT),
    };

    private GojoHud() {
    }

    public static void render(GuiGraphics graphics, DeltaTracker delta) {
        Minecraft minecraft = Minecraft.getInstance();
        Player player = minecraft.player;
        if (player == null) {
            return;
        }
        float partial = delta.getGameTimeDeltaPartialTick(false);
        int width = graphics.guiWidth();
        int height = graphics.guiHeight();

        if (ClientGojo.insideAnyDomain(minecraft.gameRenderer.getMainCamera().position())) {
            vignette(graphics, width, height, 0x05001A, 0.75F);
        }
        GojoForm form = ClientGojo.form(player);
        if (form.transformed() && !minecraft.options.hideGui) {
            panel(graphics, minecraft.font, form);
        }
        castName(graphics, minecraft.font, width, height);
        domainTitle(graphics, minecraft.font, width, height);

        float flash = ClientGojo.flashAmount(partial);
        if (flash > 0.01F) {
            graphics.fill(0, 0, width, height, ARGB.color(Mth.clamp(flash, 0.0F, 1.0F), ClientGojo.flashColor));
        }
    }

    // ---------------------------------------------------------------------------------- panel ---

    private static void panel(GuiGraphics graphics, Font font, GojoForm form) {
        int x = 6;
        int y = 6;
        int barWidth = 112;
        float ratio = Mth.clamp(ClientGojo.energy / (float) ClientGojo.maxEnergy, 0.0F, 1.0F);

        graphics.fill(x - 3, y - 3, x + barWidth + 3, y + 44, 0x88060818);
        graphics.drawString(font, Component.literal("CURSED ENERGY"), x, y, 0xFF8FD8FF, true);
        String value = ClientGojo.energy + "";
        graphics.drawString(font, value, x + barWidth - font.width(value), y, ClientGojo.inOwnDomain ? 0xFFFFE080 : 0xFFE6F6FF, true);

        int barY = y + 11;
        graphics.fill(x - 1, barY - 1, x + barWidth + 1, barY + 6, 0xFF000000);
        graphics.fill(x, barY, x + barWidth, barY + 5, 0xFF141A33);
        int filled = Math.round(barWidth * ratio);
        if (filled > 0) {
            graphics.fillGradient(x, barY, x + filled, barY + 5, 0xFF9FE8FF, 0xFF2E6BFF);
            // a little shine sweeping along the bar
            int shine = (int) ((ClientGojo.time * 3) % (barWidth + 30)) - 15;
            int s0 = Math.max(x, x + shine);
            int s1 = Math.min(x + filled, x + shine + 10);
            if (s1 > s0) {
                graphics.fill(s0, barY, s1, barY + 5, 0x55FFFFFF);
            }
        }

        int iconY = barY + 9;
        for (int i = 0; i < SLOTS.length; i++) {
            Slot slot = SLOTS[i];
            int ix = x + i * 19;
            slot(graphics, font, slot, ix, iconY, form);
        }
    }

    private static void slot(GuiGraphics graphics, Font font, Slot slot, int x, int y, GojoForm form) {
        Ability ability = slot.ability();
        boolean active = ability != Ability.INFINITY || form.infinity();
        graphics.fill(x - 1, y - 1, x + 17, y + 17, active ? 0xAA1A2550 : 0xAA202020);
        int tint = active ? 0xFFFFFFFF : 0xFF606060;
        graphics.blit(RenderPipelines.GUI_TEXTURED, slot.icon(), x, y, 0.0F, 0.0F, 16, 16, 32, 32, 32, 32, tint);

        int cooldown = ClientGojo.cooldowns[ability.ordinal()];
        if (cooldown > 0 && ability != Ability.INFINITY) {
            int h = Mth.clamp(Math.round(16.0F * cooldown / Math.max(1, ability.cooldown)), 0, 16);
            graphics.fill(x, y, x + 16, y + h, 0xB0000000);
            String seconds = cooldown >= 20 ? String.valueOf((cooldown + 19) / 20) : "";
            if (!seconds.isEmpty()) {
                graphics.drawString(font, seconds, x + 8 - font.width(seconds) / 2, y + 4, 0xFFFFFFFF, true);
            }
        } else if (ability.cost > ClientGojo.energy && !Minecraft.getInstance().player.getAbilities().instabuild) {
            graphics.fill(x, y, x + 16, y + 16, 0x70FF2020);
        }
        String key = shortKeyName(GojoKeys.forAbility(ability).getTranslatedKeyMessage().getString());
        graphics.pose().pushMatrix();
        graphics.pose().translate(x + 17, y + 12);
        graphics.pose().scale(0.5F, 0.5F);
        graphics.drawString(font, key, -font.width(key), 0, 0xFFFFE070, true);
        graphics.pose().popMatrix();
    }

    /** "Left Alt" becomes "Alt", "Right Shift" becomes "RSh", everything else is cut to three letters. */
    private static String shortKeyName(String key) {
        if (key.startsWith("Left ")) {
            key = key.substring(5);
        } else if (key.startsWith("Right ")) {
            key = "R" + key.substring(6);
        }
        return key.length() > 3 ? key.substring(0, 3) : key;
    }

    // ------------------------------------------------------------------------------- titles ---

    private static void castName(GuiGraphics graphics, Font font, int width, int height) {
        if (ClientGojo.castTicks <= 0 || ClientGojo.castAbility < 0) {
            return;
        }
        Ability ability = Ability.byId(ClientGojo.castAbility);
        if (ability == null) {
            return;
        }
        String jp;
        String en;
        int color;
        switch (ability) {
            case BLUE -> {
                jp = "術式順転「蒼」";
                en = "Cursed Technique Lapse: Blue";
                color = 0x6FB6FF;
            }
            case RED -> {
                jp = "術式反転「赫」";
                en = "Cursed Technique Reversal: Red";
                color = 0xFF5A46;
            }
            case PURPLE -> {
                jp = "虚式「茈」";
                en = "Imaginary Technique: Purple";
                color = 0xC07CFF;
            }
            case DOMAIN -> {
                jp = "領域展開「無量空処」";
                en = "Domain Expansion: Infinite Void";
                color = 0x8FD8FF;
            }
            default -> {
                return;
            }
        }
        float alpha = fade(ClientGojo.castTicks, 56);
        int y = height / 2 + 38;
        graphics.pose().pushMatrix();
        graphics.pose().translate(width / 2.0F, y);
        graphics.pose().scale(1.5F, 1.5F);
        graphics.drawString(font, jp, -font.width(jp) / 2, 0, ARGB.color(alpha, 0xFFFFFF), true);
        graphics.pose().popMatrix();
        graphics.drawString(font, en, width / 2 - font.width(en) / 2, y + 16, ARGB.color(alpha, color), true);
    }

    private static void domainTitle(GuiGraphics graphics, Font font, int width, int height) {
        if (ClientGojo.domainTitleTicks <= 0) {
            return;
        }
        float alpha = fade(ClientGojo.domainTitleTicks, 80);
        String big = "領域展開";
        String small = "DOMAIN EXPANSION";
        String name = "無量空処 · Infinite Void";
        graphics.pose().pushMatrix();
        graphics.pose().translate(width / 2.0F, height / 2.0F - 52);
        graphics.pose().scale(3.0F, 3.0F);
        graphics.drawString(font, big, -font.width(big) / 2, 0, ARGB.color(alpha, 0xFFFFFF), true);
        graphics.pose().popMatrix();
        graphics.drawString(font, small, width / 2 - font.width(small) / 2, height / 2 - 20, ARGB.color(alpha, 0x8FD8FF), true);
        graphics.drawString(font, name, width / 2 - font.width(name) / 2, height / 2 - 8, ARGB.color(alpha, 0xC8E8FF), true);
    }

    /** Fades in over the first quarter and out over the last third of {@code total} ticks. */
    private static float fade(int ticksLeft, int total) {
        float t = 1.0F - ticksLeft / (float) total;
        float in = Math.min(1.0F, t / 0.15F);
        float out = Math.min(1.0F, ticksLeft / (total * 0.35F));
        return Mth.clamp(Math.min(in, out), 0.0F, 1.0F);
    }

    private static void vignette(GuiGraphics graphics, int width, int height, int rgb, float strength) {
        int edge = ARGB.color(strength, rgb);
        int clear = ARGB.color(0.0F, rgb);
        int band = height / 3;
        graphics.fillGradient(0, 0, width, band, edge, clear);
        graphics.fillGradient(0, height - band, width, height, clear, edge);
    }
}
