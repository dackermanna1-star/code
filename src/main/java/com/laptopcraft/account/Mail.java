package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;

/**
 * A message in the player's CubeOS Mail inbox (order confirmations, delivery notices, bank alerts, spam...).
 *
 * @param link optional in-game URL (e.g. "emerazon.mc/orders") opened by a button in the Mail app; empty for none
 */
public record Mail(long id, String from, String subject, String body, long time, boolean read, String link) {
	public static final Codec<Mail> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.LONG.fieldOf("id").forGetter(Mail::id),
			Codec.STRING.fieldOf("from").forGetter(Mail::from),
			Codec.STRING.fieldOf("subject").forGetter(Mail::subject),
			Codec.STRING.fieldOf("body").forGetter(Mail::body),
			Codec.LONG.fieldOf("time").forGetter(Mail::time),
			Codec.BOOL.fieldOf("read").forGetter(Mail::read),
			Codec.STRING.optionalFieldOf("link", "").forGetter(Mail::link)
	).apply(i, Mail::new));

	public Mail asRead() {
		return new Mail(id, from, subject, body, time, true, link);
	}
}
