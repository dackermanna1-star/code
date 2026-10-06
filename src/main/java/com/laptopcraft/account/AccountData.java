package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;
import org.jspecify.annotations.Nullable;

/**
 * World-wide EmeraldPay accounts, stored with the overworld's saved data ({@code data/laptopcraft_accounts.dat}).
 */
public final class AccountData extends SavedData {
	public static final Codec<AccountData> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.unboundedMap(UUIDUtil.STRING_CODEC, PlayerAccount.CODEC).optionalFieldOf("accounts", Map.of()).forGetter(d -> d.accounts)
	).apply(i, AccountData::new));

	// No vanilla DataFixTypes apply to mod data; Fabric's DimensionDataStorage mixin accepts null.
	public static final SavedDataType<AccountData> TYPE = new SavedDataType<>("laptopcraft_accounts", AccountData::new, CODEC, null);

	private final Map<UUID, PlayerAccount> accounts;

	public AccountData() {
		this(Map.of());
	}

	private AccountData(Map<UUID, PlayerAccount> accounts) {
		this.accounts = new HashMap<>(accounts);
	}

	public static AccountData get(MinecraftServer server) {
		return server.overworld().getDataStorage().computeIfAbsent(TYPE);
	}

	public @Nullable PlayerAccount get(UUID player) {
		return accounts.get(player);
	}

	public void put(UUID player, PlayerAccount account) {
		accounts.put(player, account);
		setDirty();
	}

	/** Read-only view of all accounts (player uuid -> account). */
	public Map<UUID, PlayerAccount> all() {
		return Collections.unmodifiableMap(accounts);
	}
}
