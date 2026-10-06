package com.laptopcraft.block;

import com.laptopcraft.delivery.DeliveryEffects;
import com.laptopcraft.registry.ModBlockEntities;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Containers;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Contents and shipping label of a delivered package. The contents are dropped if the package is broken,
 * blown up or replaced, and handed to the player when it is unboxed.
 */
public class PackageBlockEntity extends BlockEntity {
	/** Hard cap on stored stacks (a full order is at most 20 lines x 64 units). */
	public static final int MAX_STACKS = 2048;
	private static final int SUMMARY_ENTRIES = 3;

	private final List<ItemStack> contents = new ArrayList<>();
	private long orderId;
	private String recipient = "";
	private String sender = "";

	public PackageBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.PACKAGE, pos, state);
	}

	/** Fills a freshly placed package. */
	public void fill(List<ItemStack> stacks, long orderId, String recipient, String sender) {
		contents.clear();
		for (ItemStack stack : stacks) {
			if (!stack.isEmpty() && contents.size() < MAX_STACKS) {
				contents.add(stack.copy());
			}
		}
		this.orderId = orderId;
		this.recipient = recipient;
		this.sender = sender;
		setChanged();
	}

	public Store store() {
		return getBlockState().getBlock() instanceof PackageBlock block ? block.store() : Store.EMERAZON;
	}

	public long orderId() {
		return orderId;
	}

	public String recipient() {
		return recipient;
	}

	public boolean isEmpty() {
		return contents.isEmpty();
	}

	/** Gives everything to {@code player} (overflow drops at their feet), celebrates and removes the package. */
	public void unbox(ServerPlayer player) {
		if (!(level instanceof ServerLevel serverLevel)) {
			return;
		}
		BlockPos pos = getBlockPos();
		BlockState state = getBlockState();
		List<ItemStack> items = new ArrayList<>(contents);
		contents.clear();
		setChanged();

		Component summary = summarize(items);
		for (ItemStack stack : items) {
			player.getInventory().placeItemBackInInventory(stack);
		}
		DeliveryEffects.unbox(serverLevel, pos, store());
		serverLevel.gameEvent(GameEvent.BLOCK_DESTROY, pos, GameEvent.Context.of(player, state));
		serverLevel.removeBlock(pos, false);

		Component message;
		if (items.isEmpty()) {
			message = Component.translatable("message.laptopcraft.unboxed.empty").withStyle(ChatFormatting.GRAY);
		} else if (store() == Store.ENDER_EATS) {
			String from = sender.isEmpty() ? Store.ENDER_EATS.displayName() : sender;
			message = Component.translatable("message.laptopcraft.unboxed.food", summary, from).withStyle(ChatFormatting.LIGHT_PURPLE);
		} else {
			message = Component.translatable("message.laptopcraft.unboxed", summary).withStyle(ChatFormatting.GREEN);
		}
		player.displayClientMessage(message, true);
		if (!recipient.isEmpty() && !recipient.equals(player.getGameProfile().name())) {
			player.sendSystemMessage(Component.translatable("message.laptopcraft.unboxed.not_yours", recipient).withStyle(ChatFormatting.GOLD, ChatFormatting.ITALIC));
		}
	}

	/** "Red Hoodie x2, Top Hat and 3 more". */
	private static Component summarize(List<ItemStack> items) {
		List<ItemStack> merged = new ArrayList<>();
		outer:
		for (ItemStack stack : items) {
			for (ItemStack m : merged) {
				if (ItemStack.isSameItemSameComponents(m, stack)) {
					m.grow(stack.getCount());
					continue outer;
				}
			}
			// Copy without the max-stack clamp: counts above 99 are only used for display here.
			merged.add(stack.copy());
		}
		MutableComponent out = Component.empty();
		for (int i = 0; i < Math.min(SUMMARY_ENTRIES, merged.size()); i++) {
			ItemStack stack = merged.get(i);
			if (i > 0) {
				out.append(", ");
			}
			out.append(stack.getHoverName().copy().withStyle(ChatFormatting.WHITE));
			if (stack.getCount() > 1) {
				out.append(Component.literal(" x" + stack.getCount()).withStyle(ChatFormatting.GRAY));
			}
		}
		if (merged.size() > SUMMARY_ENTRIES) {
			out.append(Component.translatable("message.laptopcraft.unboxed.more", merged.size() - SUMMARY_ENTRIES).withStyle(ChatFormatting.GRAY));
		}
		return out;
	}

	@Override
	public void preRemoveSideEffects(BlockPos pos, BlockState state) {
		// Broken, blown up, pushed or replaced: spill the contents instead of deleting them.
		if (level != null && !contents.isEmpty()) {
			for (ItemStack stack : contents) {
				Containers.dropItemStack(level, pos.getX() + 0.5, pos.getY() + 0.3, pos.getZ() + 0.5, stack);
			}
			contents.clear();
		}
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		ValueOutput.TypedOutputList<ItemStack> list = output.list("contents", ItemStack.CODEC);
		for (ItemStack stack : contents) {
			if (!stack.isEmpty()) {
				list.add(stack);
			}
		}
		output.putLong("order_id", orderId);
		output.putString("recipient", recipient);
		output.putString("sender", sender);
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		contents.clear();
		input.listOrEmpty("contents", ItemStack.CODEC).stream().limit(MAX_STACKS).forEach(contents::add);
		orderId = input.getLongOr("order_id", 0L);
		recipient = input.getStringOr("recipient", "");
		sender = input.getStringOr("sender", "");
	}
}
