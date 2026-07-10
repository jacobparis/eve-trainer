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
    "Add atomic review cards from a question, image, or loaded card-generator skill. Every card requires a stable topic slug for pattern-specific mastery. Generated cards require the generator ID and duplicate generated questions are ignored.",
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
      generatorId: z.string().min(1),
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
      generatorId: input.source === "generator" ? input.generatorId : undefined,
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
