import { defineEval } from "eve/evals";
import { normalizeWhatsAppUserId } from "../../agent/lib/identity.js";

export default defineEval({
  description: "WhatsApp allow-list comparisons ignore transport prefixes and phone formatting.",
  async test() {
    const configured = normalizeWhatsAppUserId("+1 (416) 555-0123");
    const inbound = normalizeWhatsAppUserId("whatsapp:+14165550123");
    if (configured !== inbound) throw new Error("Expected both values to identify the same user.");
  },
});
