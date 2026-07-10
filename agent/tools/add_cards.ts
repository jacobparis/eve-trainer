import { defineTool } from "eve/tools";
import { z } from "zod";
import { addCards, getOrCreateUser, rememberWhatsAppThread } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

const cards = z.array(
  z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    topic: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  }),
).min(1);

export default defineTool({
  description:
    "Add atomic review cards from a question, image, or the generic practice-generator skill. Every card requires a stable topic slug for pattern-specific mastery. Generated cards are grouped and deduplicated by topic automatically.",
  inputSchema: z.discriminatedUnion("source", [
    z.object({
      externalUserId: z.string().optional(),
      source: z.literal("question"),
      referenceId: z.string().uuid().optional(),
      cards,
    }),
    z.object({
      externalUserId: z.string().optional(),
      source: z.literal("image"),
      referenceId: z.string().uuid().optional(),
      cards,
    }),
    z.object({
      externalUserId: z.string().optional(),
      source: z.literal("generator"),
      referenceId: z.string().uuid().optional(),
      cards,
    }),
  ]),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    if (identity.whatsappThreadId) await rememberWhatsAppThread(user.id, identity.whatsappThreadId);
    const added = await addCards({
      userId: user.id,
      source: input.source,
      referenceId: input.referenceId,
      cards: input.cards,
    });
    return {
      added,
      skipped: input.cards.length - added,
      message: `Added ${added} review ${added === 1 ? "card" : "cards"}.`,
    };
  },
});
