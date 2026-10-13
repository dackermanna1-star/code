package dev.calibercraft.client.screen;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.client.ClientGunData;
import dev.calibercraft.client.GunController;
import dev.calibercraft.client.sound.GunSounds;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.StatModifier;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.SkinDefinition;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.AttachmentItem;
import dev.calibercraft.item.AttachmentLoadout;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.GunsmithPayload;
import dev.calibercraft.registry.ModComponents;
import dev.calibercraft.registry.ModItems;
import dev.calibercraft.registry.ModSounds;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * Weapon customization: attachment slots, skins, a rotatable preview and before/after statistics. Every change is
 * a request to the server, which validates compatibility, inventory items and bench access.
 */
public final class GunsmithScreen extends Screen {
	private static final Identifier PANEL = CaliberCraft.id("gunsmith/panel");
	private static final Identifier SLOT = CaliberCraft.id("gunsmith/slot");
	private static final Identifier SLOT_HOVER = CaliberCraft.id("gunsmith/slot_hover");
	private static final Identifier SLOT_SELECTED = CaliberCraft.id("gunsmith/slot_selected");
	private static final Identifier STAT_UP = CaliberCraft.id("gunsmith/stat_up");
	private static final Identifier STAT_DOWN = CaliberCraft.id("gunsmith/stat_down");
	private static final Identifier LOCK = CaliberCraft.id("gunsmith/lock");

	/** Stats shown in the panel: stat, label key, bar maximum, whether larger values are better. */
	private record Row(String key, float max, boolean higherBetter) {
	}

	private static final List<Row> ROWS = List.of(new Row("damage", 30, true), new Row("rpm", 1200, true), new Row("range", 200, true),
		new Row("accuracy", 100, true), new Row("hip", 100, true), new Row("recoil", 8, false), new Row("handling", 16, false),
		new Row("mobility", 1.1f, true), new Row("reload", 1.6f, true), new Row("magazine", 150, true), new Row("velocity", 60, true),
		new Row("noise", 2, false), new Row("zoom", 10, true));

	private static GunsmithScreen current;

	private final boolean bench;
	private AttachmentSlot selected = AttachmentSlot.OPTIC;
	private boolean skinTab;
	private Identifier hoverAttachment;
	private boolean hoverRemove;
	private Identifier hoverSkin;
	private float yaw = -25;
	private float pitch = 12;
	private float zoom = 1.0f;
	private boolean dragging;
	private Component status = Component.empty();
	private int statusTicks;
	private int px0, py0, px1, py1;
	private int statsX;

	private GunsmithScreen(boolean bench) {
		super(Component.translatable("calibercraft.gunsmith.title"));
		this.bench = bench;
	}

	public static void open(boolean bench) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) {
			return;
		}
		if (!WeaponStacks.isFirearm(mc.player.getMainHandItem())) {
			mc.player.displayClientMessage(Component.translatable("calibercraft.gunsmith.hold_weapon"), true);
			if (!bench) {
				return;
			}
		}
		if (!bench && "none".equals(ClientGunData.settings().fieldCustomization())) {
			mc.player.displayClientMessage(Component.translatable("calibercraft.gunsmith.needs_bench"), true);
			return;
		}
		mc.setScreen(new GunsmithScreen(bench));
	}

	public static void onResult(int code) {
		if (current == null) {
			return;
		}
		String key = switch (code) {
			case 0 -> "ok";
			case 1 -> "missing_item";
			case 2 -> "incompatible";
			case 3 -> "needs_bench";
			case 4 -> "needs_kit";
			case 5 -> "hold_weapon";
			case 6 -> "busy";
			default -> "error";
		};
		current.status = Component.translatable("calibercraft.gunsmith.result." + key)
			.withStyle(code == 0 ? ChatFormatting.GREEN : ChatFormatting.RED);
		current.statusTicks = 60;
		current.rebuildWidgets();
	}

	// ------------------------------------------------------------------------------------------------ state

	private ItemStack weapon() {
		return minecraft.player == null ? ItemStack.EMPTY : minecraft.player.getMainHandItem();
	}

	private CaliberData data() {
		return ClientGunData.data();
	}

	private Optional<WeaponDefinition> def() {
		return WeaponStacks.definition(weapon(), data());
	}

	private boolean slotLocked(AttachmentSlot slot) {
		if (bench) {
			return false;
		}
		return switch (ClientGunData.settings().fieldCustomization()) {
			case "all" -> false;
			case "none" -> true;
			default -> !slot.quickDetach;
		};
	}

	private boolean skinsLocked() {
		return !bench && !"all".equals(ClientGunData.settings().fieldCustomization());
	}

	private int count(Item item) {
		if (minecraft.player == null) {
			return 0;
		}
		if (minecraft.player.isCreative()) {
			return Integer.MAX_VALUE;
		}
		Inventory inv = minecraft.player.getInventory();
		int n = 0;
		for (int i = 0; i < inv.getContainerSize(); i++) {
			if (inv.getItem(i).is(item)) {
				n += inv.getItem(i).getCount();
			}
		}
		return n;
	}

	private Item itemFor(Identifier attachment) {
		return data().attachment(attachment).map(a -> BuiltInRegistries.ITEM.getValue(a.item())).orElse(null);
	}

	/** Copy of the held weapon with the hovered candidate applied, for the preview and the stat comparison. */
	private ItemStack candidate() {
		ItemStack base = weapon();
		if (base.isEmpty()) {
			return base;
		}
		if (skinTab && hoverSkin != null) {
			ItemStack c = base.copy();
			c.set(ModComponents.SKIN, hoverSkin);
			WeaponStacks.refreshAppearance(c);
			return c;
		}
		if (!skinTab && (hoverAttachment != null || hoverRemove)) {
			ItemStack c = base.copy();
			AttachmentLoadout l = WeaponStacks.loadout(c);
			c.set(ModComponents.ATTACHMENTS, hoverRemove ? l.without(selected) : l.with(selected, hoverAttachment));
			WeaponStacks.refreshAppearance(c);
			return c;
		}
		return base;
	}

	// ------------------------------------------------------------------------------------------------ layout

	@Override
	protected void init() {
		current = this;
		int left = 8;
		int top = 24;
		int rightW = Mth.clamp(width / 4, 120, 170);
		statsX = width - rightW - 8;
		px0 = left + 124;
		px1 = statsX - 8;
		py0 = top;
		py1 = Math.max(top + 80, (int) (height * 0.58));

		Optional<WeaponDefinition> def = def();
		int y = top;
		if (def.isPresent()) {
			for (AttachmentSlot slot : AttachmentSlot.values()) {
				if (!def.get().hasSlot(slot)) {
					continue;
				}
				addRenderableWidget(new SlotButton(left, y, 118, 20, slot));
				y += 22;
			}
			addRenderableWidget(new SlotButton(left, y, 118, 20, null));
		}
		buildOptions(def);
		int by = height - 26;
		Button reset = Button.builder(Component.translatable("calibercraft.gunsmith.reset"), b -> send(GunsmithPayload.Op.RESET, selected, null))
			.bounds(width / 2 - 104, by, 100, 20).tooltip(Tooltip.create(Component.translatable("calibercraft.gunsmith.reset.tooltip"))).build();
		reset.active = def.isPresent();
		addRenderableWidget(reset);
		addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> onClose()).bounds(width / 2 + 4, by, 100, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("calibercraft.settings.short"), b -> minecraft.setScreen(new SettingsScreen(this)))
			.bounds(width - 70, 4, 62, 16).build());
	}

	private void buildOptions(Optional<WeaponDefinition> def) {
		if (def.isEmpty()) {
			return;
		}
		int x0 = px0;
		int y0 = py1 + 16;
		int perRow = Math.max(1, (px1 - px0) / 24);
		List<AbstractButton> buttons = new ArrayList<>();
		if (skinTab) {
			for (Identifier skin : data().sortedSkins()) {
				if (def.get().allowsSkin(skin)) {
					buttons.add(new SkinButton(0, 0, skin));
				}
			}
		} else {
			buttons.add(new OptionButton(0, 0, null, true, true));
			List<Identifier> allowed = def.get().attachments().getOrDefault(selected, List.of());
			for (Identifier a : allowed) {
				buttons.add(new OptionButton(0, 0, a, true, false));
			}
			// Attachments of this slot type the player owns that do not fit this weapon (shown disabled, with the reason).
			if (minecraft.player != null) {
				Inventory inv = minecraft.player.getInventory();
				List<Identifier> seen = new ArrayList<>(allowed);
				for (int i = 0; i < inv.getContainerSize(); i++) {
					if (inv.getItem(i).getItem() instanceof AttachmentItem ai) {
						Optional<Identifier> id = data().attachmentForItem(BuiltInRegistries.ITEM.getKey(ai));
						if (id.isPresent() && !seen.contains(id.get()) && data().attachment(id.get()).map(d -> d.slot() == selected).orElse(false)) {
							seen.add(id.get());
							buttons.add(new OptionButton(0, 0, id.get(), false, false));
						}
					}
				}
			}
		}
		for (int i = 0; i < buttons.size(); i++) {
			AbstractButton b = buttons.get(i);
			b.setX(x0 + (i % perRow) * 24);
			b.setY(y0 + (i / perRow) * 24);
			addRenderableWidget(b);
		}
	}

	private void send(GunsmithPayload.Op op, AttachmentSlot slot, Identifier target) {
		GunController.INSTANCE.sendGunsmith(new GunsmithPayload(op, slot, Optional.ofNullable(target)));
		GunSounds.playUi(ModSounds.get("ui.click"), 0.6f, 1.0f);
	}

	@Override
	public void onClose() {
		GunController.INSTANCE.sendGunsmith(new GunsmithPayload(GunsmithPayload.Op.CLOSE, AttachmentSlot.OPTIC, Optional.empty()));
		current = null;
		super.onClose();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void tick() {
		if (statusTicks > 0 && --statusTicks == 0) {
			status = Component.empty();
		}
		if (minecraft.player == null || !minecraft.player.isAlive()) {
			onClose();
		}
	}

	// ------------------------------------------------------------------------------------------------ input

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.x() >= px0 && event.x() <= px1 && event.y() >= py0 && event.y() <= py1 && event.button() == 0) {
			dragging = true;
		}
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		dragging = false;
		return super.mouseReleased(event);
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging) {
			yaw += (float) dx * 1.6f;
			pitch = Mth.clamp(pitch + (float) dy * 1.2f, -80, 80);
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double sx, double sy) {
		if (x >= px0 && x <= px1 && y >= py0 && y <= py1) {
			zoom = Mth.clamp(zoom + (float) sy * 0.1f, 0.6f, 2.2f);
			return true;
		}
		return super.mouseScrolled(x, y, sx, sy);
	}

	// ------------------------------------------------------------------------------------------------ rendering

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
		hoverAttachment = null;
		hoverRemove = false;
		hoverSkin = null;
		for (var child : children()) {
			if (child instanceof OptionButton ob && ob.isHoveredOrFocused() && ob.compatible) {
				hoverAttachment = ob.attachment;
				hoverRemove = ob.remove;
			} else if (child instanceof SkinButton sb && sb.isHoveredOrFocused()) {
				hoverSkin = sb.skin;
			}
		}
		super.render(g, mouseX, mouseY, partial);
		ItemStack weapon = weapon();
		g.drawCenteredString(font, title, width / 2, 8, 0xFFFFFFFF);
		if (!bench) {
			g.drawString(font, Component.translatable("calibercraft.gunsmith.field_mode"), 8, 8, 0xFFA0A0A0, false);
		}
		g.blitSprite(RenderPipelines.GUI_TEXTURED, PANEL, px0 - 4, py0 - 4, px1 - px0 + 8, py1 - py0 + 8);
		if (weapon.isEmpty() || def().isEmpty()) {
			g.drawCenteredString(font, Component.translatable("calibercraft.gunsmith.hold_weapon"), (px0 + px1) / 2, (py0 + py1) / 2, 0xFFFF8080);
			return;
		}
		ItemStack preview = candidate();
		float scale = Math.min(px1 - px0, (py1 - py0) * 1.8f) * 0.95f * zoom;
		g.guiRenderState.submitPicturesInPictureState(new WeaponPreviewRenderer.State(preview, yaw, pitch, px0, py0, px1, py1, scale,
			new ScreenRectangle(px0, py0, px1 - px0, py1 - py0)));
		g.drawString(font, weapon.getHoverName(), px0, py1 + 4, 0xFFE8C060, true);
		g.drawString(font, Component.translatable(skinTab ? "calibercraft.gunsmith.skins" : selected.translationKey()),
			px1 - font.width(Component.translatable(skinTab ? "calibercraft.gunsmith.skins" : selected.translationKey())), py1 + 4, 0xFFB0B8C0,
			false);
		renderStats(g, weapon, preview);
		if (!status.getString().isEmpty()) {
			g.drawCenteredString(font, status, width / 2, height - 38, 0xFFFFFFFF);
		}
	}

	private void renderStats(GuiGraphics g, ItemStack weapon, ItemStack preview) {
		CaliberData data = data();
		WeaponDefinition def = def().orElseThrow();
		WeaponStats before = WeaponStacks.stats(weapon, data).orElse(null);
		WeaponStats after = WeaponStacks.stats(preview, data).orElse(null);
		if (before == null || after == null) {
			return;
		}
		int x = statsX;
		int y = py0;
		int w = width - 8 - x;
		g.blitSprite(RenderPipelines.GUI_TEXTURED, PANEL, x - 4, y - 4, w + 8, ROWS.size() * 12 + 22);
		g.drawString(font, Component.translatable("calibercraft.gunsmith.stats"), x, y, 0xFFE8C060, false);
		y += 12;
		for (Row row : ROWS) {
			double b = value(row.key, before, def);
			double a = value(row.key, after, def);
			g.drawString(font, Component.translatable("calibercraft.stat." + row.key), x, y, 0xFFC8D0D8, false);
			// Columns: label | bar | change arrow | value (right-aligned, kept clear of the panel frame).
			int valueRight = x + w - 2;
			int barX = x + w / 2 - 6;
			int barW = valueRight - 26 - 10 - barX;
			g.fill(barX, y + 2, barX + barW, y + 6, 0xFF20262C);
			int fb = (int) (barW * Mth.clamp(b / row.max, 0, 1));
			int fa = (int) (barW * Mth.clamp(a / row.max, 0, 1));
			g.fill(barX, y + 2, barX + Math.min(fb, fa), y + 6, 0xFFB8C0C8);
			int valueColor = 0xFF808890;
			if (Math.abs(a - b) > 1e-6) {
				boolean better = (a > b) == row.higherBetter;
				int col = better ? 0xFF50D060 : 0xFFE05050;
				valueColor = col;
				g.fill(barX + Math.min(fb, fa), y + 2, barX + Math.max(fb, fa), y + 6, col);
				g.blitSprite(RenderPipelines.GUI_TEXTURED, (a > b) ? STAT_UP : STAT_DOWN, barX + barW + 2, y, 7, 7, col);
			}
			String text = format(row.key, a);
			g.drawString(font, text, valueRight - font.width(text), y, valueColor, false);
			y += 12;
		}
	}

	private static double value(String key, WeaponStats s, WeaponDefinition def) {
		return switch (key) {
			case "damage" -> s.get(Stat.DAMAGE) * s.get(Stat.PELLETS);
			case "rpm" -> s.get(Stat.RPM);
			case "range" -> s.get(Stat.EFFECTIVE_RANGE);
			case "accuracy" -> 100.0 / (1.0 + s.get(Stat.SPREAD_ADS) * 4);
			case "hip" -> 100.0 / (1.0 + s.get(Stat.SPREAD_HIP) * 0.5);
			case "recoil" -> s.get(Stat.RECOIL_VERTICAL) + s.get(Stat.RECOIL_HORIZONTAL) * 0.5;
			case "handling" -> s.get(Stat.ADS_TIME);
			case "mobility" -> s.get(Stat.MOVE_SPEED);
			case "reload" -> s.get(Stat.RELOAD_SPEED);
			case "magazine" -> s.get(Stat.MAGAZINE);
			case "velocity" -> s.get(Stat.VELOCITY);
			case "noise" -> s.get(Stat.LOUDNESS);
			case "zoom" -> s.get(Stat.ZOOM);
			default -> 0;
		};
	}

	private static String format(String key, double v) {
		return switch (key) {
			case "rpm", "range", "magazine", "velocity", "accuracy", "hip" -> Integer.toString((int) Math.round(v));
			case "mobility", "reload", "noise" -> String.format("%.2f", v);
			case "handling" -> String.format("%.1ft", v);
			case "zoom" -> String.format("%.1fx", v);
			default -> String.format("%.1f", v);
		};
	}

	/** Human-readable description of an attachment's modifiers for tooltips. */
	static List<Component> describe(List<StatModifier> mods) {
		List<Component> lines = new ArrayList<>();
		for (StatModifier m : mods) {
			double v = m.value();
			String amount = m.operation() == StatModifier.Operation.MULTIPLY
				? String.format("%+d%%", Math.round((v - 1) * 100)) : String.format("%+.1f", v);
			if (m.operation() == StatModifier.Operation.MULTIPLY && Math.abs(v - 1) < 1e-6) {
				continue;
			}
			boolean increase = m.operation() == StatModifier.Operation.MULTIPLY ? v > 1 : v > 0;
			boolean good = increase == m.stat().higherIsBetter();
			lines.add(Component.literal(amount + " ").append(Component.translatable("calibercraft.stat_name." + m.stat().key))
				.withStyle(good ? ChatFormatting.GREEN : ChatFormatting.RED));
		}
		return lines;
	}

	private static Tooltip tooltip(List<Component> lines) {
		MutableComponent all = Component.empty();
		for (int i = 0; i < lines.size(); i++) {
			if (i > 0) {
				all.append("\n");
			}
			all.append(lines.get(i));
		}
		return Tooltip.create(all);
	}

	// ------------------------------------------------------------------------------------------------ widgets

	private final class SlotButton extends AbstractButton {
		private final AttachmentSlot slot;

		SlotButton(int x, int y, int w, int h, AttachmentSlot slot) {
			super(x, y, w, h, slot == null ? Component.translatable("calibercraft.gunsmith.skins") : Component.translatable(slot.translationKey()));
			this.slot = slot;
			List<Component> tip = new ArrayList<>();
			tip.add(getMessage().copy().withStyle(ChatFormatting.GOLD));
			boolean locked = slot == null ? skinsLocked() : slotLocked(slot);
			if (locked) {
				tip.add(Component.translatable("calibercraft.gunsmith.needs_bench").withStyle(ChatFormatting.RED));
			}
			setTooltip(tooltip(tip));
		}

		private boolean selectedNow() {
			return slot == null ? skinTab : !skinTab && slot == selected;
		}

		@Override
		public void onPress(InputWithModifiers input) {
			skinTab = slot == null;
			if (slot != null) {
				selected = slot;
			}
			rebuildWidgets();
		}

		@Override
		protected void renderContents(GuiGraphics g, int mx, int my, float partial) {
			Identifier bg = selectedNow() ? SLOT_SELECTED : isHoveredOrFocused() ? SLOT_HOVER : SLOT;
			g.blitSprite(RenderPipelines.GUI_TEXTURED, bg, getX(), getY(), getWidth(), getHeight());
			String icon = slot == null ? "icon_skin" : "icon_" + slot.getSerializedName();
			g.blitSprite(RenderPipelines.GUI_TEXTURED, CaliberCraft.id("gunsmith/" + icon), getX() + 2, getY() + 2, 16, 16);
			Component current = slot == null ? Component.translatable("calibercraft.skin." + WeaponStacks.skin(weapon()).getPath())
				: WeaponStacks.loadout(weapon()).get(slot).map(id -> (Component) Component.translatable("item." + id.getNamespace() + "." + id.getPath()))
					.orElse(Component.translatable("calibercraft.gunsmith.empty"));
			g.drawString(font, font.plainSubstrByWidth(getMessage().getString(), getWidth() - 24), getX() + 21, getY() + 2, 0xFFFFFFFF, false);
			g.drawString(font, font.plainSubstrByWidth(current.getString(), getWidth() - 24), getX() + 21, getY() + 11, 0xFF9AA4AE, false);
			if (slot == null ? skinsLocked() : slotLocked(slot)) {
				g.blitSprite(RenderPipelines.GUI_TEXTURED, LOCK, getX() + getWidth() - 11, getY() + 2, 9, 9);
			}
		}

		@Override
		protected void updateWidgetNarration(NarrationElementOutput out) {
			defaultButtonNarrationText(out);
		}
	}

	private final class OptionButton extends AbstractButton {
		final Identifier attachment;
		final boolean compatible;
		final boolean remove;
		private final ItemStack icon;

		OptionButton(int x, int y, Identifier attachment, boolean compatible, boolean remove) {
			super(x, y, 22, 22, remove ? Component.translatable("calibercraft.gunsmith.remove")
				: Component.translatable("item." + attachment.getNamespace() + "." + attachment.getPath()));
			this.attachment = attachment;
			this.compatible = compatible;
			this.remove = remove;
			Item item = remove ? null : itemFor(attachment);
			this.icon = item == null ? ItemStack.EMPTY : new ItemStack(item);
			List<Component> tip = new ArrayList<>();
			tip.add(getMessage().copy().withStyle(ChatFormatting.GOLD));
			if (remove) {
				tip.add(Component.translatable("calibercraft.gunsmith.remove.tooltip").withStyle(ChatFormatting.GRAY));
			} else if (!compatible) {
				tip.add(Component.translatable("calibercraft.gunsmith.incompatible", weapon().getHoverName()).withStyle(ChatFormatting.RED));
			} else {
				WeaponDefinition def = def().orElseThrow();
				List<StatModifier> mods = def.attachmentOverrides().getOrDefault(attachment,
					data().attachment(attachment).map(AttachmentDefinition::modifiers).orElse(List.of()));
				tip.addAll(describe(mods));
				if (mods.isEmpty()) {
					tip.add(Component.translatable("calibercraft.gunsmith.cosmetic").withStyle(ChatFormatting.GRAY));
				}
				int n = item == null ? 0 : count(item);
				if (n != Integer.MAX_VALUE) {
					tip.add(Component.translatable("calibercraft.gunsmith.owned", n).withStyle(n > 0 ? ChatFormatting.AQUA : ChatFormatting.DARK_GRAY));
				}
			}
			if (slotLocked(selected)) {
				tip.add(Component.translatable("calibercraft.gunsmith.needs_bench").withStyle(ChatFormatting.RED));
			}
			setTooltip(tooltip(tip));
			this.active = compatible && !slotLocked(selected);
		}

		private boolean installed() {
			Optional<Identifier> cur = WeaponStacks.loadout(weapon()).get(selected);
			return remove ? cur.isEmpty() : cur.filter(attachment::equals).isPresent();
		}

		@Override
		public void onPress(InputWithModifiers input) {
			if (remove) {
				send(GunsmithPayload.Op.REMOVE, selected, null);
			} else {
				send(GunsmithPayload.Op.INSTALL, selected, attachment);
			}
		}

		@Override
		protected void renderContents(GuiGraphics g, int mx, int my, float partial) {
			Identifier bg = installed() ? SLOT_SELECTED : isHoveredOrFocused() && active ? SLOT_HOVER : SLOT;
			g.blitSprite(RenderPipelines.GUI_TEXTURED, bg, getX(), getY(), 22, 22, active || installed() ? 0xFFFFFFFF : 0x80FFFFFF);
			if (remove) {
				g.blitSprite(RenderPipelines.GUI_TEXTURED, CaliberCraft.id("gunsmith/icon_" + selected.getSerializedName()), getX() + 3, getY() + 3,
					16, 16, 0x70FFFFFF);
				g.fill(getX() + 4, getY() + 10, getX() + 18, getY() + 12, 0xC0E05050);
			} else if (!icon.isEmpty()) {
				g.renderItem(icon, getX() + 3, getY() + 3);
				int n = count(icon.getItem());
				if (n != Integer.MAX_VALUE && compatible) {
					g.drawString(font, Integer.toString(n), getX() + 21 - font.width(Integer.toString(n)), getY() + 13, n > 0 ? 0xFFFFFFFF : 0xFFFF6060,
						true);
				}
			}
			if (!compatible) {
				g.fill(getX() + 2, getY() + 2, getX() + 20, getY() + 20, 0x50FF0000);
			}
		}

		@Override
		protected void updateWidgetNarration(NarrationElementOutput out) {
			defaultButtonNarrationText(out);
		}
	}

	private final class SkinButton extends AbstractButton {
		final Identifier skin;
		private final SkinDefinition def;

		SkinButton(int x, int y, Identifier skin) {
			super(x, y, 22, 22, Component.translatable("calibercraft.skin." + skin.getPath()));
			this.skin = skin;
			this.def = data().skins().get(skin);
			List<Component> tip = new ArrayList<>();
			tip.add(getMessage().copy().withColor(def.rarity().color));
			tip.add(Component.translatable("calibercraft.rarity." + def.rarity().getSerializedName()).withColor(def.rarity().color));
			boolean kit = def.requiresKit() && ClientGunData.settings().rareSkinsRequireKit();
			if (kit) {
				int n = count(ModItems.PRISMATIC_FINISH_KIT);
				tip.add(Component.translatable("calibercraft.gunsmith.requires_kit", n == Integer.MAX_VALUE ? "∞" : Integer.toString(n))
					.withStyle(n > 0 ? ChatFormatting.AQUA : ChatFormatting.RED));
			}
			tip.add(Component.translatable("calibercraft.gunsmith.skin_cosmetic").withStyle(ChatFormatting.GRAY));
			if (skinsLocked()) {
				tip.add(Component.translatable("calibercraft.gunsmith.needs_bench").withStyle(ChatFormatting.RED));
			}
			setTooltip(tooltip(tip));
			this.active = !skinsLocked();
		}

		@Override
		public void onPress(InputWithModifiers input) {
			send(GunsmithPayload.Op.SKIN, AttachmentSlot.OPTIC, skin);
		}

		@Override
		protected void renderContents(GuiGraphics g, int mx, int my, float partial) {
			boolean on = WeaponStacks.skin(weapon()).equals(skin);
			Identifier bg = on ? SLOT_SELECTED : isHoveredOrFocused() && active ? SLOT_HOVER : SLOT;
			g.blitSprite(RenderPipelines.GUI_TEXTURED, bg, getX(), getY(), 22, 22);
			g.fill(getX() + 4, getY() + 4, getX() + 18, getY() + 18, def.swatch() | 0xFF000000);
			g.fill(getX() + 4, getY() + 16, getX() + 18, getY() + 18, def.rarity().color | 0xFF000000);
			if (def.requiresKit() && ClientGunData.settings().rareSkinsRequireKit() && count(ModItems.PRISMATIC_FINISH_KIT) == 0) {
				g.blitSprite(RenderPipelines.GUI_TEXTURED, LOCK, getX() + 12, getY() + 1, 9, 9);
			}
		}

		@Override
		protected void updateWidgetNarration(NarrationElementOutput out) {
			defaultButtonNarrationText(out);
		}
	}
}
