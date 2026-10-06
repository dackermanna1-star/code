package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;

/** A wallet movement: positive amount = money in, negative = money out. */
public record Transaction(long time, int amount, String description) {
	public static final Codec<Transaction> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.LONG.fieldOf("time").forGetter(Transaction::time),
			Codec.INT.fieldOf("amount").forGetter(Transaction::amount),
			Codec.STRING.fieldOf("desc").forGetter(Transaction::description)
	).apply(i, Transaction::new));
}
