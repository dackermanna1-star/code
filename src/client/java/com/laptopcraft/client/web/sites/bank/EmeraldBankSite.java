package com.laptopcraft.client.web.sites.bank;

import com.laptopcraft.account.Transaction;
import com.laptopcraft.client.os.AccountView;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.jspecify.annotations.Nullable;

/** Emerald Bank (emeraldbank.mc) — move real emeralds between your inventory and your EmeraldPay wallet. */
public class EmeraldBankSite extends PlaceholderSite {
	public EmeraldBankSite() {
		super("emeraldbank.mc", "Emerald Bank", "Deposit and withdraw emeralds. Your wallet for every web shop.", "bank", "bank_logo", 0xFF1B5E20,
				List.of("bank", "money", "emeralds", "deposit", "withdraw", "wallet", "balance", "emeraldpay"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new BankPage(this);
	}

	static final class BankPage extends KitPage {
		private static final int BG = 0xFFF1F5F2, CARD = 0xFFFFFFFF, TEXT = 0xFF14261A, DIM = 0xFF5F6F64, GREEN = 0xFF1B7F3B, DARK = 0xFF0B3D20,
				RED = 0xFFC62828, LINE = 0xFFDCE5DE;
		private final EmeraldBankSite site;
		private final TextField amount = new TextField("Amount");
		private int docHeight;
		private float shownBalance = -1;
		private @Nullable String message;
		private boolean messageError;
		private long messageAt;
		private int pendingVersion = -1;

		BankPage(EmeraldBankSite site) {
			this.site = site;
		}

		@Override
		public void init() {
			amount.maxLength = 5;
			amount.filter = s -> s.chars().allMatch(Character::isDigit);
			amount.setText("10");
			ui.add(amount);
		}

		@Override
		public String title() {
			return "Emerald Bank — Online Banking";
		}

		@Override
		public int background() {
			return BG;
		}

		@Override
		public int contentHeight(int width, int viewportHeight) {
			return Math.max(viewportHeight, docHeight);
		}

		private AccountView account() {
			return page.app().account();
		}

		private int parsed() {
			try {
				return Integer.parseInt(amount.getText().trim());
			} catch (NumberFormatException e) {
				return 0;
			}
		}

		private void act(String what, Runnable action) {
			account().consumeLastError();
			pendingVersion = account().version();
			message = what;
			messageError = false;
			messageAt = Ease.now();
			action.run();
		}

		@Override
		public void tick() {
			super.tick();
			String err = account().consumeLastError();
			if (err != null) {
				message = err;
				messageError = true;
				messageAt = Ease.now();
				pendingVersion = -1;
			} else if (pendingVersion >= 0 && account().version() != pendingVersion) {
				pendingVersion = -1;
				message = "Done! Your balance has been updated.";
				messageAt = Ease.now();
			}
		}

		@Override
		protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
			AccountView acc = account();
			int bal = acc.balance();
			shownBalance = shownBalance < 0 ? bal : shownBalance + (bal - shownBalance) * 0.15f;
			if (Math.abs(bal - shownBalance) < 0.5f) {
				shownBalance = bal;
			}
			// header
			Gfx.gradientH(g, 0, 0, width, 32, DARK, 0xFF14532D);
			Gfx.textureFit(g, site.logo(), 10, 6, 120, 20);
			Gfx.textRight(g, "Secure session · " + page.app().username(), width - 10, 12, 0xFFCDEBD6);
			int w = Math.min(width - 20, 520), x = (width - w) / 2, y = 44;
			Gfx.text(g, "Welcome back, " + page.app().username() + ".", x, y, TEXT);
			y += 14;
			// balance card
			int ch = 70;
			Gfx.shadow(g, x, y, w, ch, 4);
			Gfx.gradientH(g, x, y, w, ch, 0xFF0E6B33, 0xFF19A35A);
			for (int i = 0; i < 8; i++) {
				int gx = x + w - 30 - i * 14 + (int) (Math.sin(Ease.now() / 800.0 + i) * 3);
				Gfx.rect(g, gx, y + 10 + (i % 3) * 16, 6, 6, 0x22FFFFFF);
			}
			Gfx.text(g, "EmeraldPay wallet balance", x + 14, y + 10, 0xFFD7F5E1);
			Gfx.emerald(g, x + 14, y + 30);
			Gfx.textScaled(g, Gfx.formatNumber(Math.round(shownBalance)), x + 28, y + 26, 2.5f, 0xFFFFFFFF);
			Gfx.text(g, "Account •••• " + String.format("%04d", Math.abs(page.app().username().hashCode()) % 10000), x + 14, y + 54, 0xFFBDEBCB);
			Gfx.itemScaled(g, new ItemStack(Items.EMERALD_BLOCK), x + w - 52, y + 18, 2f);
			y += ch + 12;
			// transfer panel
			int inv = acc.inventoryEmeralds();
			int ph = 96;
			Gfx.roundRect(g, x, y, w, ph, 6, CARD);
			Gfx.roundBorder(g, x, y, w, ph, 6, LINE);
			Gfx.text(g, "Transfer emeralds", x + 12, y + 10, TEXT);
			Gfx.item(g, new ItemStack(Items.EMERALD), x + 12, y + 24);
			Gfx.text(g, "In your inventory: " + Gfx.formatNumber(inv) + " emeralds" + (inv > 0 ? "" : " (emerald blocks count as 9)"), x + 32, y + 28, DIM);
			amount.setBounds(x + 12, y + 46, 70, 18);
			int cx = x + 90;
			for (int v : new int[] {1, 10, 32, 64}) {
				String s = String.valueOf(v);
				int cw = Gfx.width(s) + 14;
				boolean h = region(g, cx, y + 48, cw, 14, () -> amount.setText(String.valueOf(v)));
				Gfx.roundRect(g, cx, y + 48, cw, 14, 7, h ? 0xFFDCEFE2 : 0xFFEEF5F0);
				Gfx.text(g, s, cx + 7, y + 51, TEXT);
				cx += cw + 4;
			}
			int bw = Math.max(70, (w - 24 - 8 * 2) / 3);
			int by = y + 70;
			int n = parsed();
			button(g, x + 12, by, bw, 18, "Deposit " + (n > 0 ? n : ""), GREEN, 0xFFFFFFFF, () -> {
				if (n > 0) {
					act("Depositing " + n + " emeralds…", () -> account().deposit(n));
				}
			});
			button(g, x + 20 + bw, by, bw, 18, "Withdraw " + (n > 0 ? n : ""), 0xFF2E7D5B, 0xFFFFFFFF, () -> {
				if (n > 0) {
					act("Withdrawing " + n + " emeralds…", () -> account().withdraw(n));
				}
			});
			button(g, x + 28 + bw * 2, by, bw, 18, "Deposit all", 0xFFE8F5EC, TEXT, () -> act("Depositing everything…", () -> account().depositAll()));
			y += ph + 8;
			if (message != null && Ease.now() - messageAt < 6000) {
				Gfx.roundRect(g, x, y, w, 18, 4, messageError ? 0xFFFDECEA : 0xFFE6F4EA);
				Gfx.textClipped(g, (messageError ? "⚠ " : "✔ ") + message, x + 8, y + 5, w - 16, messageError ? RED : GREEN);
				y += 24;
			}
			// spending chart
			List<Transaction> tx = acc.snapshot().transactions();
			int chartH = 56;
			Gfx.roundRect(g, x, y, w, chartH + 26, 6, CARD);
			Gfx.roundBorder(g, x, y, w, chartH + 26, 6, LINE);
			Gfx.text(g, "Recent activity", x + 12, y + 8, TEXT);
			int bars = Math.min(tx.size(), Math.max(1, (w - 24) / 14));
			int max = 1;
			for (int i = 0; i < bars; i++) {
				max = Math.max(max, Math.abs(tx.get(i).amount()));
			}
			for (int i = 0; i < bars; i++) {
				Transaction t = tx.get(bars - 1 - i);
				int bh = Math.max(2, Math.abs(t.amount()) * (chartH - 10) / max);
				int bx = x + 12 + i * 14;
				Gfx.roundRect(g, bx, y + 20 + chartH - bh, 10, bh, 2, t.amount() >= 0 ? 0xFF34A853 : 0xFFE57373);
				if (hover(bx, y + 20, 10, chartH)) {
					Gfx.tooltip(g, (t.amount() >= 0 ? "+" : "") + t.amount() + "  " + t.description(), mx, my);
				}
			}
			if (tx.isEmpty()) {
				Gfx.text(g, "No transactions yet.", x + 12, y + 30, DIM);
			}
			y += chartH + 34;
			// history table
			Gfx.roundRect(g, x, y, w, 26 + Math.max(1, Math.min(tx.size(), 30)) * 14, 6, CARD);
			Gfx.text(g, "Transaction history", x + 12, y + 8, TEXT);
			int ty = y + 22;
			for (int i = 0; i < Math.min(tx.size(), 30); i++) {
				Transaction t = tx.get(i);
				if (i % 2 == 1) {
					Gfx.rect(g, x + 4, ty - 2, w - 8, 14, 0xFFF6F9F7);
				}
				Gfx.text(g, Kit.when(t.time()), x + 12, ty + 1, DIM);
				Gfx.textClipped(g, t.description(), x + 100, ty + 1, w - 170, TEXT);
				String amt = (t.amount() >= 0 ? "+" : "-") + Gfx.formatNumber(Math.abs(t.amount()));
				Gfx.textRight(g, amt, x + w - 12, ty + 1, t.amount() >= 0 ? GREEN : RED);
				ty += 14;
			}
			if (tx.isEmpty()) {
				Gfx.text(g, "Deposit some emeralds to get started!", x + 12, ty + 1, DIM);
				ty += 14;
			}
			y = ty + 14;
			Gfx.textCentered(g, "Emerald Bank will never ask for your password. Villagers might. Don't tell them.", width / 2, y, DIM);
			docHeight = y + 20;
		}
	}
}
