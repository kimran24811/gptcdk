import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, usedTransactions } from "../db";
import { eq } from "drizzle-orm";

export interface PaymentResult {
  found: boolean;
  txId?: string;
  amountFound?: number;
  senderFound?: string;
}

export const GmailChecker = {
  /**
   * Searches the Gmail inbox for a NayaPay "Cha-Ching!" email matching
   * the given amount and sender name, received in the last 2 hours.
   */
  async findNayapayPayment(
    gmailUser: string,
    gmailAppPassword: string,
    expectedAmount: number,
    expectedSenderName: string,
    tenantId: number,
    orderId: number
  ): Promise<PaymentResult> {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      logger: false,
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");

      // Search for NayaPay emails received in the last 2 hours
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const uids = await client.search({ since, subject: "Cha-Ching" });

      if (!uids || uids.length === 0) {
        return { found: false };
      }

      // Check most recent first
      const reversed = [...uids].reverse();

      for (const uid of reversed) {
        const msg = await client.fetchOne(String(uid), { source: true });
        if (!msg?.source) continue;

        const parsed = await simpleParser(msg.source);
        const html = parsed.html || "";
        const text = parsed.text || "";
        const body = html || text;

        // Extract amount from "Amount Received" field: "Rs. 664"
        const amountMatch = body.match(/Amount\s+Received[^\d]*Rs\.?\s*([\d,]+)/i)
          ?? body.match(/Rs\.?\s*([\d,]+)/i);
        if (!amountMatch) continue;
        const parsedAmount = parseInt(amountMatch[1].replace(/,/g, ""), 10);

        // Extract sender name — appears as the bold name in the email
        // "Muhammad Hamza Allzai" appears before the nayapay ID
        const nameMatch = body.match(/<strong[^>]*>([^<]+)<\/strong>/i)
          ?? body.match(/from\s+([A-Z][a-zA-Z\s]+)\s+Rs/i);
        let parsedName = "";
        if (nameMatch) parsedName = nameMatch[1].trim();

        // Also try plain text extraction
        if (!parsedName && text) {
          const txtNameMatch = text.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s*\n.*nayapay/i);
          if (txtNameMatch) parsedName = txtNameMatch[1].trim();
        }

        // Extract Transaction ID
        const txMatch = body.match(/Transaction\s+ID[^a-f0-9]*([a-f0-9]{20,})/i)
          ?? text.match(/Transaction\s+ID[^a-f0-9]*([a-f0-9]{20,})/i);
        const txId = txMatch ? txMatch[1].trim() : `nayapay-${uid}-${Date.now()}`;

        // Check if this transaction has already been used
        const [alreadyUsed] = await db.select().from(usedTransactions).where(eq(usedTransactions.txId, txId));
        if (alreadyUsed) continue;

        // Validate amount (allow ±1 PKR tolerance for rounding)
        const amountMatch2 = Math.abs(parsedAmount - expectedAmount) <= 1;

        // Validate sender name (case-insensitive, partial match allowed)
        const nameNorm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
        const nameMatch2 =
          nameNorm(parsedName).includes(nameNorm(expectedSenderName)) ||
          nameNorm(expectedSenderName).includes(nameNorm(parsedName));

        if (amountMatch2 && nameMatch2) {
          // Mark transaction as used
          await db.insert(usedTransactions).values({ tenantId, txId, orderId });
          return { found: true, txId, amountFound: parsedAmount, senderFound: parsedName };
        }
      }

      return { found: false };
    } finally {
      await client.logout().catch(() => {});
    }
  },
};
