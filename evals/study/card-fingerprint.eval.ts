import { defineEval } from "eve/evals";
import { cardFingerprint } from "../../agent/lib/cards/fingerprint.js";

export default defineEval({
  description: "Generated-card fingerprints ignore superficial formatting but preserve semantic differences.",
  async test() {
    const first = cardFingerprint("Complete: La casa es ___. (rojo)");
    const formatted = cardFingerprint(" complete — la CASA es ___ rojo! ");
    const different = cardFingerprint("Complete: Las casas son ___. (rojo)");
    if (first !== formatted) throw new Error("Expected formatting variants to deduplicate.");
    if (first === different) throw new Error("Expected a different sentence to remain unique.");
  },
});
