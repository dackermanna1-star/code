package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Everything the client needs to know about the player's EmeraldPay account. Sent on laptop open
 * and after every change. Lists are newest-first.
 *
 * @param balance  wallet balance in emeralds
 * @param gameTime overworld game time when the snapshot was taken (lets the client derive order progress)
 */
public record AccountSnapshot(int balance, List<Order> orders, List<Mail> mail, List<Transaction> transactions, long gameTime) {
	public static final AccountSnapshot EMPTY = new AccountSnapshot(0, List.of(), List.of(), List.of(), 0L);

	public static final Codec<AccountSnapshot> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.INT.fieldOf("balance").forGetter(AccountSnapshot::balance),
			Order.CODEC.listOf().fieldOf("orders").forGetter(AccountSnapshot::orders),
			Mail.CODEC.listOf().fieldOf("mail").forGetter(AccountSnapshot::mail),
			Transaction.CODEC.listOf().fieldOf("transactions").forGetter(AccountSnapshot::transactions),
			Codec.LONG.fieldOf("game_time").forGetter(AccountSnapshot::gameTime)
	).apply(i, AccountSnapshot::new));

	public static final StreamCodec<ByteBuf, AccountSnapshot> STREAM_CODEC = ByteBufCodecs.fromCodecTrusted(CODEC);

	public long unreadMail() {
		return mail.stream().filter(m -> !m.read()).count();
	}
}
