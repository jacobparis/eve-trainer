import { defineEval } from "eve/evals";
import { matches } from "../../agent/tools/review.js";

export default defineEval({
  description: "Review answers accept case, punctuation, accents, and explicit alternatives.",
  async test() {
    if (!matches("  ÉL! ", "el")) throw new Error("Expected normalized answer to match.");
    if (!matches("nosotras", "nosotros | nosotras")) throw new Error("Expected alternative to match.");
    if (matches("la", "ella")) throw new Error("Expected a different answer not to match.");
  },
});
