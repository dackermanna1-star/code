package com.laptopcraft.network;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.registry.Reg;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Store;
import io.netty.buffer.ByteBuf;
import java.util.List;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Every LaptopCraft packet. Server handlers live in {@code ServerNetworking}, client handlers in
 * {@code com.laptopcraft.client.net.ClientNetworking}.
 *
 * <h2>Laptop OS data layout</h2>
 * Each laptop block entity stores one opaque {@link CompoundTag} ("os data") that only the client
 * OS interprets. Top-level keys:
 * <ul>
 *   <li>{@code settings} — compound of OS settings (wallpaper, theme, accent, username, ...)</li>
 *   <li>{@code files} — compound: file name -> compound {@code {type:"text"|"image"|..., content:..., modified:long}}</li>
 *   <li>{@code apps} — compound: app id -> compound of that app's persistent state</li>
 * </ul>
 * The client edits it with {@link LaptopSave} using a path: {@code "settings"},
 * {@code "files/<name>"} or {@code "apps/<appId>"}.
 */
public final class ModPayloads {
	private ModPayloads() {
	}

	static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> payloadType(String name) {
		return new CustomPacketPayload.Type<>(Reg.id(name));
	}

	// ---------------------------------------------------------------- server -> client

	/** Opens the laptop screen for the block at {@code pos}. */
	public record OpenLaptop(BlockPos pos, CompoundTag osData, AccountSnapshot account, String ownerName) implements CustomPacketPayload {
		public static final Type<OpenLaptop> TYPE = payloadType("open_laptop");
		public static final StreamCodec<ByteBuf, OpenLaptop> CODEC = StreamCodec.composite(
				BlockPos.STREAM_CODEC, OpenLaptop::pos,
				ByteBufCodecs.TRUSTED_COMPOUND_TAG, OpenLaptop::osData,
				AccountSnapshot.STREAM_CODEC, OpenLaptop::account,
				ByteBufCodecs.stringUtf8(64), OpenLaptop::ownerName,
				OpenLaptop::new);

		@Override
		public Type<OpenLaptop> type() {
			return TYPE;
		}
	}

	/** Fresh account state (balance, orders, mail, transactions). */
	public record AccountSync(AccountSnapshot account) implements CustomPacketPayload {
		public static final Type<AccountSync> TYPE = payloadType("account_sync");
		public static final StreamCodec<ByteBuf, AccountSync> CODEC = AccountSnapshot.STREAM_CODEC.map(AccountSync::new, AccountSync::account);

		@Override
		public Type<AccountSync> type() {
			return TYPE;
		}
	}

	/**
	 * A notification for the player. If the laptop screen is open it is shown as a CubeOS
	 * notification, otherwise as a vanilla toast.
	 *
	 * @param icon  icon key: "emerazon", "ender_eats", "bank", "mail", "info", "error", "success"
	 */
	public record Notify(String icon, String title, String message) implements CustomPacketPayload {
		public static final Type<Notify> TYPE = payloadType("notify");
		public static final StreamCodec<ByteBuf, Notify> CODEC = StreamCodec.composite(
				ByteBufCodecs.stringUtf8(64), Notify::icon,
				ByteBufCodecs.stringUtf8(256), Notify::title,
				ByteBufCodecs.stringUtf8(1024), Notify::message,
				Notify::new);

		@Override
		public Type<Notify> type() {
			return TYPE;
		}
	}

	// ---------------------------------------------------------------- client -> server

	/**
	 * Writes ({@code delete == false}) or removes ({@code delete == true}) one part of the laptop's
	 * OS data. {@code path} is "settings", "files/&lt;name&gt;" or "apps/&lt;appId&gt;".
	 */
	public record LaptopSave(BlockPos pos, String path, CompoundTag data, boolean delete) implements CustomPacketPayload {
		public static final Type<LaptopSave> TYPE = payloadType("laptop_save");
		public static final StreamCodec<ByteBuf, LaptopSave> CODEC = StreamCodec.composite(
				BlockPos.STREAM_CODEC, LaptopSave::pos,
				ByteBufCodecs.stringUtf8(256), LaptopSave::path,
				ByteBufCodecs.COMPOUND_TAG, LaptopSave::data,
				ByteBufCodecs.BOOL, LaptopSave::delete,
				LaptopSave::new);

		@Override
		public Type<LaptopSave> type() {
			return TYPE;
		}
	}

	/** Opens or closes the laptop lid (e.g. "Shut down" closes it). */
	public record LaptopLid(BlockPos pos, boolean open) implements CustomPacketPayload {
		public static final Type<LaptopLid> TYPE = payloadType("laptop_lid");
		public static final StreamCodec<ByteBuf, LaptopLid> CODEC = StreamCodec.composite(
				BlockPos.STREAM_CODEC, LaptopLid::pos,
				ByteBufCodecs.BOOL, LaptopLid::open,
				LaptopLid::new);

		@Override
		public Type<LaptopLid> type() {
			return TYPE;
		}
	}

	/**
	 * Places an order. The server re-validates everything against the {@code Catalog}.
	 *
	 * @param restaurantId    Ender Eats restaurant (all lines must be on its menu); empty for Emerazon
	 * @param tip             courier tip in emeralds (Ender Eats only, 0..Catalog.MAX_TIP)
	 * @param deliverToPlayer true = deliver next to the player wherever they are; false = next to the laptop
	 * @param laptopPos       the laptop the order was placed from (delivery address)
	 */
	public record Purchase(Store store, String restaurantId, List<OrderLine> lines, DeliveryOption option, int tip,
			boolean deliverToPlayer, BlockPos laptopPos) implements CustomPacketPayload {
		public static final Type<Purchase> TYPE = payloadType("purchase");
		public static final StreamCodec<ByteBuf, Purchase> CODEC = StreamCodec.composite(
				Store.STREAM_CODEC, Purchase::store,
				ByteBufCodecs.stringUtf8(128), Purchase::restaurantId,
				OrderLine.STREAM_CODEC.apply(ByteBufCodecs.list(64)), Purchase::lines,
				DeliveryOption.STREAM_CODEC, Purchase::option,
				ByteBufCodecs.VAR_INT, Purchase::tip,
				ByteBufCodecs.BOOL, Purchase::deliverToPlayer,
				BlockPos.STREAM_CODEC, Purchase::laptopPos,
				Purchase::new);

		@Override
		public Type<Purchase> type() {
			return TYPE;
		}
	}

	/**
	 * Emerald Bank actions: "deposit" (amount emeralds from inventory, emerald blocks count as 9),
	 * "deposit_all", "withdraw" (amount emeralds into inventory).
	 */
	public record Bank(String action, int amount) implements CustomPacketPayload {
		public static final Type<Bank> TYPE = payloadType("bank");
		public static final StreamCodec<ByteBuf, Bank> CODEC = StreamCodec.composite(
				ByteBufCodecs.stringUtf8(32), Bank::action,
				ByteBufCodecs.VAR_INT, Bank::amount,
				Bank::new);

		@Override
		public Type<Bank> type() {
			return TYPE;
		}
	}

	/** Mail actions: "read", "delete", "read_all" (mailId ignored), "delete_all" (mailId ignored). */
	public record MailAction(String action, long mailId) implements CustomPacketPayload {
		public static final Type<MailAction> TYPE = payloadType("mail_action");
		public static final StreamCodec<ByteBuf, MailAction> CODEC = StreamCodec.composite(
				ByteBufCodecs.stringUtf8(32), MailAction::action,
				ByteBufCodecs.VAR_LONG, MailAction::mailId,
				MailAction::new);

		@Override
		public Type<MailAction> type() {
			return TYPE;
		}
	}

	/** Asks the server for a fresh {@link AccountSync}. */
	public record RequestAccount() implements CustomPacketPayload {
		public static final RequestAccount INSTANCE = new RequestAccount();
		public static final Type<RequestAccount> TYPE = payloadType("request_account");
		public static final StreamCodec<ByteBuf, RequestAccount> CODEC = StreamCodec.unit(INSTANCE);

		@Override
		public Type<RequestAccount> type() {
			return TYPE;
		}
	}

	/** Registers all payload types. Called from common init (both sides). */
	public static void init() {
		PayloadTypeRegistry.playS2C().register(OpenLaptop.TYPE, OpenLaptop.CODEC);
		PayloadTypeRegistry.playS2C().register(AccountSync.TYPE, AccountSync.CODEC);
		PayloadTypeRegistry.playS2C().register(Notify.TYPE, Notify.CODEC);

		PayloadTypeRegistry.playC2S().register(LaptopSave.TYPE, LaptopSave.CODEC);
		PayloadTypeRegistry.playC2S().register(LaptopLid.TYPE, LaptopLid.CODEC);
		PayloadTypeRegistry.playC2S().register(Purchase.TYPE, Purchase.CODEC);
		PayloadTypeRegistry.playC2S().register(Bank.TYPE, Bank.CODEC);
		PayloadTypeRegistry.playC2S().register(MailAction.TYPE, MailAction.CODEC);
		PayloadTypeRegistry.playC2S().register(RequestAccount.TYPE, RequestAccount.CODEC);
	}
}
