package com.extremesports.client.screen;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.render.EquipmentRenderState;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.item.EquipmentItem;
import com.extremesports.network.Payloads;
import com.extremesports.registry.ModAttachments;
import com.extremesports.registry.ModDataComponents;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModSounds;
import com.extremesports.server.PlayerSportData;
import com.extremesports.server.Unlocks;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.EquipmentStats;
import com.extremesports.sport.PartCatalog;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * Customization workshop: pick a piece of equipment from the inventory, change parts and colours with a live
 * 3D preview and stat comparison, then apply it (validated again on the server). Configurations can be saved as
 * named presets in the client config.
 */
public class WorkshopScreen extends Screen {
	private enum Tab {
		PARTS("parts"),
		COLORS("colors"),
		PRESETS("presets");

		final String key;

		Tab(String key) {
			this.key = key;
		}
	}

	private static final int ROW = 26;
	private static final int ENTRY = 22;
	private static Tab lastTab = Tab.PARTS;
	private static int lastSelected = -1;

	private final @Nullable Screen parent;
	private final @Nullable BlockPos workshopPos;
	private final List<Integer> equipmentSlots = new ArrayList<>();
	private int selected = -1;
	private @Nullable EquipmentKind kind;
	private EquipmentConfig original = EquipmentConfig.EMPTY;
	private EquipmentConfig working = EquipmentConfig.EMPTY;
	private Tab tab = lastTab;
	private int scroll;
	private int listScroll;
	private float spin = 215.0F;
	private long lastFrame = Util.getMillis();
	private boolean dragging;
	private @Nullable SportEquipmentEntity preview;
	private String pendingName = "";
	private @Nullable Component status;
	private int statusColor = 0xFFFFFFFF;
	private long statusUntil;
	private @Nullable Button applyButton;

	public WorkshopScreen() {
		this(null, null);
	}

	public WorkshopScreen(@Nullable BlockPos workshopPos, @Nullable Screen parent) {
		super(Component.translatable("screen.extremesports.workshop"));
		this.workshopPos = workshopPos;
		this.parent = parent;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	// ------------------------------------------------------------------ layout

	private int listLeft() {
		return 8;
	}

	private int listRight() {
		return listLeft() + Mth.clamp(width / 4, 96, 130);
	}

	private int rightRight() {
		return width - 8;
	}

	private int rightLeft() {
		return rightRight() - Mth.clamp((int) (width * 0.38F), 160, 200);
	}

	private int top() {
		return 22;
	}

	private int bottom() {
		return height - 44;
	}

	private int contentTop() {
		return top() + 24;
	}

	private int contentBottom() {
		return bottom() - 12;
	}

	private int previewBottom() {
		return bottom() - 68;
	}

	// ------------------------------------------------------------------ state

	private Inventory inventory() {
		return minecraft.player.getInventory();
	}

	private ItemStack selectedStack() {
		return selected < 0 ? ItemStack.EMPTY : inventory().getItem(selected);
	}

	private PlayerSportData data() {
		PlayerSportData data = minecraft.player == null ? null : minecraft.player.getAttached(ModAttachments.SPORT_DATA);
		return data == null ? new PlayerSportData() : data;
	}

	private boolean creative() {
		return minecraft.player != null && minecraft.player.isCreative();
	}

	private boolean unlocked(PartCatalog.Option option) {
		return Unlocks.isUnlocked(data(), option.unlock(), creative());
	}

	private boolean hasLockedParts(EquipmentConfig config) {
		if (kind == null) {
			return false;
		}
		for (var entry : PartCatalog.slots(kind.sport()).entrySet()) {
			if (!unlocked(entry.getValue().option(config.part(kind.sport(), entry.getKey())))) {
				return true;
			}
		}
		return false;
	}

	/** Compares two configs by what they resolve to, so "unset" and "explicit default" count as equal. */
	private boolean same(EquipmentConfig a, EquipmentConfig b) {
		if (kind == null) {
			return true;
		}
		for (String slot : PartCatalog.slots(kind.sport()).keySet()) {
			if (!a.part(kind.sport(), slot).equals(b.part(kind.sport(), slot))) {
				return false;
			}
		}
		for (PartCatalog.ColorSlot colorSlot : PartCatalog.colorSlots(kind)) {
			if (a.color(kind, colorSlot.id()) != b.color(kind, colorSlot.id())) {
				return false;
			}
		}
		return true;
	}

	private boolean canUseWorkshop() {
		return workshopPos != null || creative();
	}

	private void refreshEquipmentList() {
		equipmentSlots.clear();
		Inventory inventory = inventory();
		for (int i = 0; i < inventory.getContainerSize(); i++) {
			if (inventory.getItem(i).getItem() instanceof EquipmentItem) {
				equipmentSlots.add(i);
			}
		}
		if (selected >= 0 && !(inventory.getItem(selected).getItem() instanceof EquipmentItem)) {
			selected = -1;
		}
		if (selected < 0 && !equipmentSlots.isEmpty()) {
			int preferred = inventory.getSelectedSlot();
			if (equipmentSlots.contains(lastSelected)) {
				preferred = lastSelected;
			}
			select(equipmentSlots.contains(preferred) ? preferred : equipmentSlots.getFirst());
		}
	}

	private void select(int slot) {
		ItemStack stack = inventory().getItem(slot);
		if (!(stack.getItem() instanceof EquipmentItem item)) {
			return;
		}
		boolean kindChanged = kind != item.kind();
		selected = slot;
		lastSelected = slot;
		kind = item.kind();
		original = EquipmentItem.config(stack);
		working = original;
		if (kindChanged || preview == null) {
			preview = ModEntities.forSport(kind.sport()).create(minecraft.level, EntitySpawnReason.LOAD);
			scroll = 0;
		}
		updatePreview();
	}

	private void updatePreview() {
		if (preview == null || selected < 0) {
			return;
		}
		ItemStack stack = selectedStack().copyWithCount(1);
		stack.set(ModDataComponents.EQUIPMENT_CONFIG, working);
		preview.setItem(stack);
	}

	private void setWorking(EquipmentConfig config) {
		working = config;
		updatePreview();
		rebuildWidgets();
	}

	private void setStatus(Component message, int color) {
		status = message;
		statusColor = color;
		statusUntil = Util.getMillis() + 3000L;
	}

	private void click() {
		minecraft.getSoundManager().play(SimpleSoundInstance.forUI(ModSounds.UI_CLICK, 1.0F, 0.6F));
	}

	// ------------------------------------------------------------------ widgets

	@Override
	protected void init() {
		if (minecraft.player == null) {
			return;
		}
		refreshEquipmentList();
		int left = rightLeft();
		int right = rightRight();
		int tabWidth = (right - left) / Tab.values().length;
		for (int i = 0; i < Tab.values().length; i++) {
			Tab t = Tab.values()[i];
			Button button = Button.builder(Component.translatable("screen.extremesports." + t.key), b -> {
				tab = t;
				lastTab = t;
				scroll = 0;
				click();
				rebuildWidgets();
			}).bounds(left + i * tabWidth, top(), tabWidth - 2, 20).build();
			button.active = t != tab && kind != null;
			addRenderableWidget(button);
		}

		int buttonsY = height - 26;
		int center = width / 2;
		applyButton = addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.apply"), b -> apply())
			.bounds(center - 166, buttonsY, 80, 20).build());
		addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.reset"), b -> {
			click();
			setWorking(original);
		}).bounds(center - 82, buttonsY, 80, 20).build()).active = kind != null && !same(working, original);
		addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.defaults"), b -> {
			click();
			setWorking(EquipmentConfig.EMPTY);
		}).bounds(center + 2, buttonsY, 80, 20).build()).active = kind != null && !same(working, EquipmentConfig.EMPTY);
		addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.done"), b -> onClose())
			.bounds(center + 86, buttonsY, 80, 20).build());
		updateApplyButton();

		if (kind == null) {
			return;
		}
		switch (tab) {
			case PARTS -> initParts();
			case COLORS -> initColors();
			case PRESETS -> initPresets();
		}
	}

	private void updateApplyButton() {
		if (applyButton != null) {
			applyButton.active = kind != null && !same(working, original) && !hasLockedParts(working) && canUseWorkshop();
		}
	}

	private boolean rowVisible(int y, int rowHeight) {
		return y >= contentTop() && y + rowHeight <= contentBottom();
	}

	private void initParts() {
		int left = rightLeft();
		int right = rightRight();
		int y = contentTop() - scroll;
		for (PartCatalog.Slot slot : PartCatalog.slots(kind.sport()).values()) {
			if (rowVisible(y, ROW)) {
				addRenderableWidget(Button.builder(Component.literal("<"), b -> cycle(slot, -1)).bounds(left, y + 10, 16, 14).build());
				addRenderableWidget(Button.builder(Component.literal(">"), b -> cycle(slot, 1)).bounds(right - 16, y + 10, 16, 14).build());
			}
			y += ROW;
		}
	}

	private void cycle(PartCatalog.Slot slot, int direction) {
		List<PartCatalog.Option> options = slot.options();
		int index = options.indexOf(slot.option(working.part(kind.sport(), slot.id())));
		int next = Math.floorMod(index + direction, options.size());
		click();
		setWorking(working.withPart(slot.id(), options.get(next).id()));
	}

	private void initColors() {
		int y = contentTop() - scroll + PartCatalog.colorSlots(kind).size() * ROW + 2;
		if (rowVisible(y, 20)) {
			addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.randomize"), b -> randomizeColors())
				.bounds(rightLeft(), y, rightRight() - rightLeft(), 18).build());
		}
	}

	private void randomizeColors() {
		EquipmentConfig config = working;
		var random = minecraft.level.getRandom();
		for (PartCatalog.ColorSlot colorSlot : PartCatalog.colorSlots(kind)) {
			config = config.withColor(colorSlot.id(), PartCatalog.PALETTE[random.nextInt(PartCatalog.PALETTE.length)]);
		}
		click();
		setWorking(config);
	}

	private List<ClientConfig.SavedPreset> presetsForKind() {
		List<ClientConfig.SavedPreset> list = new ArrayList<>();
		for (ClientConfig.SavedPreset preset : ClientConfig.get().presets) {
			if (preset.kind.equals(kind.itemId())) {
				list.add(preset);
			}
		}
		return list;
	}

	private void initPresets() {
		int left = rightLeft();
		int right = rightRight();
		EditBox nameBox = new EditBox(font, left, contentTop(), right - left - 54, 18, Component.translatable("screen.extremesports.preset_name"));
		nameBox.setMaxLength(24);
		nameBox.setHint(Component.translatable("screen.extremesports.preset_name").withStyle(ChatFormatting.DARK_GRAY));
		nameBox.setValue(pendingName);
		nameBox.setResponder(value -> pendingName = value);
		addRenderableWidget(nameBox);
		addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.save_preset"), b -> savePreset())
			.bounds(right - 50, contentTop(), 50, 18).build());

		int y = contentTop() + 24 - scroll;
		for (ClientConfig.SavedPreset preset : presetsForKind()) {
			if (y >= contentTop() + 24 && y + ENTRY <= contentBottom()) {
				addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.load_preset"), b -> {
					click();
					setWorking(ClientConfig.decode(preset).sanitized(kind));
					setStatus(Component.translatable("screen.extremesports.preset_loaded", preset.name), 0xFF9EE7FF);
				}).bounds(right - 82, y, 44, 18).build());
				addRenderableWidget(Button.builder(Component.translatable("screen.extremesports.delete_preset"), b -> {
					ClientConfig.get().presets.remove(preset);
					ClientConfig.save();
					click();
					rebuildWidgets();
				}).bounds(right - 36, y, 36, 18).build());
			}
			y += ENTRY;
		}
	}

	private void savePreset() {
		String name = pendingName.trim();
		if (name.isEmpty()) {
			name = Component.translatable(kind.translationKey()).getString() + " " + (presetsForKind().size() + 1);
		}
		ClientConfig.get().savePreset(name, kind.itemId(), working.sanitized(kind));
		pendingName = "";
		click();
		setStatus(Component.translatable("screen.extremesports.preset_saved", name), 0xFF5CFF7A);
		rebuildWidgets();
	}

	private void apply() {
		if (kind == null || selected < 0) {
			return;
		}
		if (hasLockedParts(working)) {
			setStatus(Component.translatable("screen.extremesports.locked_parts"), 0xFFFF6A6A);
			return;
		}
		if (!canUseWorkshop()) {
			setStatus(Component.translatable("screen.extremesports.need_workshop"), 0xFFFF6A6A);
			return;
		}
		EquipmentConfig config = working.sanitized(kind);
		ClientPlayNetworking.send(new Payloads.WorkshopApply(selected, config));
		original = config;
		working = config;
		minecraft.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.SMITHING_TABLE_USE, 1.0F, 0.8F));
		setStatus(Component.translatable("screen.extremesports.applied"), 0xFF5CFF7A);
		rebuildWidgets();
	}

	// ------------------------------------------------------------------ input

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) {
			return true;
		}
		double mx = event.x();
		double my = event.y();
		// Equipment list
		if (mx >= listLeft() && mx < listRight() && my >= top() && my < bottom()) {
			int index = (int) ((my - top() + listScroll) / ENTRY);
			if (index >= 0 && index < equipmentSlots.size()) {
				int slot = equipmentSlots.get(index);
				if (slot != selected) {
					click();
					select(slot);
					rebuildWidgets();
				}
				return true;
			}
		}
		// Colour swatches
		if (kind != null && tab == Tab.COLORS && mx >= rightLeft() && mx < rightRight() && my >= contentTop() && my < contentBottom()) {
			int y = contentTop() - scroll;
			int swatch = swatchSize();
			for (PartCatalog.ColorSlot colorSlot : PartCatalog.colorSlots(kind)) {
				int rowY = y + 11;
				if (my >= rowY && my < rowY + swatch) {
					int index = (int) ((mx - rightLeft()) / (swatch + 1));
					if (index >= 0 && index < PartCatalog.PALETTE.length) {
						click();
						setWorking(working.withColor(colorSlot.id(), PartCatalog.PALETTE[index]));
						return true;
					}
				}
				y += ROW;
			}
		}
		// Start rotating the preview
		if (inPreview(mx, my)) {
			dragging = true;
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (dragging) {
			spin += (float) dx * 2.0F;
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		dragging = false;
		return super.mouseReleased(event);
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		if (mouseX < listRight()) {
			int max = Math.max(0, equipmentSlots.size() * ENTRY - (bottom() - top()));
			listScroll = Mth.clamp(listScroll - (int) (scrollY * 16), 0, max);
			return true;
		}
		if (kind != null && mouseX >= rightLeft()) {
			int contentHeight = switch (tab) {
				case PARTS -> PartCatalog.slots(kind.sport()).size() * ROW;
				case COLORS -> PartCatalog.colorSlots(kind).size() * ROW + 22;
				case PRESETS -> 24 + presetsForKind().size() * ENTRY;
			};
			int max = Math.max(0, contentHeight - (contentBottom() - contentTop()));
			int newScroll = Mth.clamp(scroll - (int) (scrollY * 13), 0, max);
			if (newScroll != scroll) {
				scroll = newScroll;
				rebuildWidgets();
			}
			return true;
		}
		return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
	}

	private boolean inPreview(double x, double y) {
		return x >= listRight() + 6 && x < rightLeft() - 6 && y >= top() && y < previewBottom();
	}

	private int swatchSize() {
		return Math.max(6, (rightRight() - rightLeft()) / PartCatalog.PALETTE.length - 1);
	}

	@Override
	public void tick() {
		// Keep the list in sync if the inventory changes while the screen is open (e.g. the server refused an apply).
		if (minecraft.player == null) {
			return;
		}
		if (selected >= 0 && !(selectedStack().getItem() instanceof EquipmentItem)) {
			selected = -1;
			kind = null;
			preview = null;
			rebuildWidgets();
		} else if (selected >= 0 && same(working, original)) {
			EquipmentConfig stored = EquipmentItem.config(selectedStack());
			if (!same(stored, original)) {
				original = stored;
				working = stored;
				updatePreview();
				rebuildWidgets();
			}
		}
	}

	// ------------------------------------------------------------------ rendering

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		graphics.drawCenteredString(font, title, width / 2, 8, 0xFFFFC94A);
		renderEquipmentList(graphics, mouseX, mouseY);
		if (kind == null) {
			graphics.drawWordWrap(font, Component.translatable("screen.extremesports.no_equipment"), listRight() + 12, height / 2 - 10,
				rightLeft() - listRight() - 24, 0xFFBBBBBB);
		} else {
			renderPreview(graphics);
			renderStats(graphics);
			graphics.fill(rightLeft() - 4, contentTop() - 2, rightRight() + 4, contentBottom() + 2, 0x90101014);
			graphics.enableScissor(rightLeft() - 4, contentTop() - 2, rightRight() + 4, contentBottom() + 2);
			switch (tab) {
				case PARTS -> renderParts(graphics, mouseX, mouseY);
				case COLORS -> renderColors(graphics, mouseX, mouseY);
				case PRESETS -> renderPresets(graphics);
			}
			graphics.disableScissor();
		}
		renderStatus(graphics);
		super.render(graphics, mouseX, mouseY, partialTick);
	}

	private void renderEquipmentList(GuiGraphics graphics, int mouseX, int mouseY) {
		int left = listLeft();
		int right = listRight();
		graphics.fill(left - 2, top() - 2, right + 2, bottom() + 2, 0x90101014);
		graphics.enableScissor(left - 2, top() - 2, right + 2, bottom() + 2);
		int y = top() - listScroll;
		for (int slot : equipmentSlots) {
			ItemStack stack = inventory().getItem(slot);
			boolean hovered = mouseX >= left && mouseX < right && mouseY >= y && mouseY < y + ENTRY - 2 && mouseY >= top() && mouseY < bottom();
			int background = slot == selected ? 0xFF3A4152 : hovered ? 0xFF2A2E38 : 0x80202228;
			graphics.fill(left, y, right, y + ENTRY - 2, background);
			if (slot == selected) {
				graphics.fill(left, y, left + 2, y + ENTRY - 2, 0xFFFFC94A);
			}
			graphics.renderItem(stack, left + 3, y + 2);
			fitString(graphics, stack.getHoverName().getString(), left + 22, y + 6, right - left - 25, slot == selected ? 0xFFFFFFFF : 0xFFBBBBBB);
			y += ENTRY;
		}
		graphics.disableScissor();
	}

	/** Draws text shrunk (down to 70%) to fit the width, truncating only if it still doesn't fit. */
	private void fitString(GuiGraphics graphics, String text, int x, int y, int maxWidth, int color) {
		int width = font.width(text);
		float scale = width <= maxWidth ? 1.0F : Math.max(0.7F, (float) maxWidth / width);
		String shown = font.plainSubstrByWidth(text, (int) (maxWidth / scale));
		graphics.pose().pushMatrix();
		graphics.pose().translate(x, y + (1.0F - scale) * 4.0F);
		graphics.pose().scale(scale, scale);
		graphics.drawString(font, shown, 0, 0, color, true);
		graphics.pose().popMatrix();
	}

	private void renderPreview(GuiGraphics graphics) {
		int x0 = listRight() + 6;
		int x1 = rightLeft() - 6;
		int y0 = top();
		int y1 = previewBottom();
		graphics.fillGradient(x0, y0, x1, y1, 0xFF2B3140, 0xFF14161C);
		graphics.renderOutline(x0, y0, x1 - x0, y1 - y0, 0xFF3A4152);
		long now = Util.getMillis();
		float dt = Math.min(100L, now - lastFrame);
		lastFrame = now;
		if (!dragging && !ClientConfig.get().reducedMotion) {
			spin += dt * 0.02F;
		}
		graphics.drawCenteredString(font, Component.translatable("screen.extremesports.rotate_hint"), (x0 + x1) / 2, y1 - 11, 0xFF6E7380);
		if (preview == null) {
			return;
		}
		EntityRenderer<? super SportEquipmentEntity, ?> renderer = minecraft.getEntityRenderDispatcher().getRenderer(preview);
		EntityRenderState state = renderer.createRenderState(preview, 1.0F);
		state.lightCoords = LightTexture.FULL_BRIGHT;
		state.shadowPieces.clear();
		state.outlineColor = 0;
		if (state instanceof EquipmentRenderState equipment) {
			equipment.preview = true;
			equipment.ridden = false;
		}
		float size = previewSize(kind);
		float scale = Math.min((x1 - x0) / size, (y1 - y0 - 12) / (size * 0.85F)) * 0.78F;
		Quaternionf rotation = new Quaternionf()
			.rotateZ((float) Math.PI)
			.rotateX(-24.0F * Mth.DEG_TO_RAD)
			.rotateY(spin * Mth.DEG_TO_RAD);
		Vector3f translation = new Vector3f(0.0F, previewCenterY(kind), 0.0F);
		graphics.submitEntityRenderState(state, scale, translation, rotation, null, x0 + 1, y0 + 1, x1 - 1, y1 - 12);
	}

	private static float previewSize(EquipmentKind kind) {
		return switch (kind.sport()) {
			case SKATEBOARD -> Math.max(0.6F, kind.length);
			case BMX -> 1.2F;
			case SCOOTER -> 1.05F;
			case SKATES -> 0.6F;
		};
	}

	private static float previewCenterY(EquipmentKind kind) {
		return switch (kind.sport()) {
			case SKATEBOARD -> 0.1F;
			case BMX -> 0.48F;
			case SCOOTER -> 0.45F;
			case SKATES -> 0.15F;
		};
	}

	private void renderStats(GuiGraphics graphics) {
		int x0 = listRight() + 6;
		int x1 = rightLeft() - 6;
		int y = previewBottom() + 4;
		EquipmentStats before = EquipmentStats.compute(kind, original);
		EquipmentStats after = EquipmentStats.compute(kind, working);
		graphics.fill(x0, y - 2, x1, bottom() - 2, 0x90101014);
		int labelWidth = 0;
		for (String key : PartCatalog.STAT_KEYS) {
			labelWidth = Math.max(labelWidth, font.width(Component.translatable("stat.extremesports." + key)));
		}
		int barLeft = x0 + 6 + labelWidth + 6;
		int segment = Math.max(3, (x1 - 6 - barLeft) / 10);
		for (int i = 0; i < 5; i++) {
			int rowY = y + 3 + i * 12;
			graphics.drawString(font, Component.translatable("stat.extremesports." + PartCatalog.STAT_KEYS[i]), x0 + 6, rowY, 0xFFBBBBBB, false);
			int was = before.get(i);
			int now = after.get(i);
			for (int s = 0; s < 10; s++) {
				int color;
				if (s < Math.min(was, now)) {
					color = 0xFF4FC3F7;
				} else if (s < now) {
					color = 0xFF5CFF7A;
				} else if (s < was) {
					color = 0xFFB03A3A;
				} else {
					color = 0xFF33363E;
				}
				int sx = barLeft + s * segment;
				graphics.fill(sx, rowY + 1, sx + segment - 1, rowY + 7, color);
			}
		}
	}

	private void renderParts(GuiGraphics graphics, int mouseX, int mouseY) {
		int left = rightLeft();
		int right = rightRight();
		int y = contentTop() - scroll;
		for (PartCatalog.Slot slot : PartCatalog.slots(kind.sport()).values()) {
			PartCatalog.Option option = slot.option(working.part(kind.sport(), slot.id()));
			boolean unlocked = unlocked(option);
			boolean changed = !option.id().equals(slot.option(original.part(kind.sport(), slot.id())).id());
			graphics.drawString(font, Component.translatable(slot.translationKey()), left, y + 1, changed ? 0xFFFFC94A : 0xFF9AA0AC, false);
			if (!unlocked) {
				Component locked = Component.translatable("screen.extremesports.locked");
				graphics.drawString(font, locked, right - font.width(locked), y + 1, 0xFFFF6A6A, false);
			}
			graphics.fill(left + 17, y + 10, right - 17, y + 24, unlocked ? 0xFF22252D : 0xFF3A2226);
			String name = font.plainSubstrByWidth(Component.translatable(option.translationKey(slot.id())).getString(), right - left - 38);
			graphics.drawCenteredString(font, name, (left + right) / 2, y + 13, unlocked ? 0xFFFFFFFF : 0xFFFF9A9A);
			if (mouseX >= left + 17 && mouseX < right - 17 && mouseY >= y + 10 && mouseY < y + 24
				&& mouseY >= contentTop() && mouseY < contentBottom()) {
				List<Component> tooltip = new ArrayList<>();
				tooltip.add(Component.translatable(option.translationKey(slot.id())));
				for (int i = 0; i < 5; i++) {
					int delta = option.statDelta()[i];
					if (delta != 0) {
						tooltip.add(Component.literal((delta > 0 ? "+" : "") + delta + " ")
							.append(Component.translatable("stat.extremesports." + PartCatalog.STAT_KEYS[i]))
							.withStyle(delta > 0 ? ChatFormatting.GREEN : ChatFormatting.RED));
					}
				}
				if (!unlocked) {
					Unlocks.Unlock unlock = Unlocks.all().get(option.unlock());
					if (unlock != null) {
						tooltip.add(Component.translatable("screen.extremesports.requirement", SportsMenuScreen.requirement(unlock))
							.withStyle(ChatFormatting.GOLD));
					}
				}
				graphics.setComponentTooltipForNextFrame(font, tooltip, mouseX, mouseY);
			}
			y += ROW;
		}
	}

	private void renderColors(GuiGraphics graphics, int mouseX, int mouseY) {
		int left = rightLeft();
		int y = contentTop() - scroll;
		int swatch = swatchSize();
		for (PartCatalog.ColorSlot colorSlot : PartCatalog.colorSlots(kind)) {
			int current = working.color(kind, colorSlot.id());
			graphics.drawString(font, Component.translatable(colorSlot.translationKey()), left, y + 1, 0xFF9AA0AC, false);
			graphics.fill(rightRight() - 18, y, rightRight(), y + 8, 0xFF000000 | current);
			graphics.renderOutline(rightRight() - 18, y, 18, 8, 0xFF606570);
			for (int i = 0; i < PartCatalog.PALETTE.length; i++) {
				int sx = left + i * (swatch + 1);
				int sy = y + 11;
				int color = PartCatalog.PALETTE[i];
				graphics.fill(sx, sy, sx + swatch, sy + swatch, 0xFF000000 | color);
				if (color == current) {
					graphics.renderOutline(sx - 1, sy - 1, swatch + 2, swatch + 2, 0xFFFFFFFF);
				} else if (mouseX >= sx && mouseX < sx + swatch && mouseY >= sy && mouseY < sy + swatch) {
					graphics.renderOutline(sx - 1, sy - 1, swatch + 2, swatch + 2, 0xFF9AA0AC);
				}
			}
			y += ROW;
		}
	}

	private void renderPresets(GuiGraphics graphics) {
		int left = rightLeft();
		int y = contentTop() + 24 - scroll;
		List<ClientConfig.SavedPreset> presets = presetsForKind();
		if (presets.isEmpty()) {
			graphics.drawWordWrap(font, Component.translatable("screen.extremesports.no_presets"), left, contentTop() + 28,
				rightRight() - left, 0xFF8A8F99);
		}
		for (ClientConfig.SavedPreset preset : presets) {
			if (y >= contentTop() + 24 - ENTRY && y < contentBottom()) {
				fitString(graphics, preset.name, left + 2, y + 5, rightRight() - left - 88, 0xFFFFFFFF);
			}
			y += ENTRY;
		}
	}

	private void renderStatus(GuiGraphics graphics) {
		int y = height - 40;
		Component message = status;
		int color = statusColor;
		if (message == null || Util.getMillis() > statusUntil) {
			message = null;
			if (kind != null && hasLockedParts(working)) {
				message = Component.translatable("screen.extremesports.locked_parts");
				color = 0xFFFF9A9A;
			} else if (kind != null && !canUseWorkshop() && !same(working, original)) {
				message = Component.translatable("screen.extremesports.need_workshop");
				color = 0xFFFF9A9A;
			}
		}
		if (message != null) {
			graphics.drawCenteredString(font, message, width / 2, y, color);
		}
	}

	@Override
	public void onClose() {
		minecraft.setScreen(parent);
	}
}
