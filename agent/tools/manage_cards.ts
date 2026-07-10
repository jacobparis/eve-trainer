import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  deleteCards,
  getActiveCard,
  getOrCreateUser,
  updateCard,
} from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

const editableFields = {
  question: z.string().min(1).max(2_000).optional(),
  answer: z.string().min(1).max(2_000).optional(),
  topic: z.string().min(1).max(100).optional(),
};

export default defineTool({
  description:
    "Modify the learner's SRS card library. Update or delete the active review card directly; use inspect_library search results to get card IDs for other cards. Meaning-changing edits reset that card's review progress, while topic-only edits preserve it.",
  inputSchema: z.discriminatedUnion("action", [
    z.object({
      externalUserId: z.string().optional(),
      channel: z.string().optional(),
      threadKey: z.string().optional(),
      action: z.literal("update_active"),
      ...editableFields,
    }),
    z.object({
      externalUserId: z.string().optional(),
      channel: z.string().optional(),
      threadKey: z.string().optional(),
      action: z.literal("delete_active"),
    }),
    z.object({
      externalUserId: z.string().optional(),
      action: z.literal("update_card"),
      cardId: z.string().uuid(),
      ...editableFields,
    }),
    z.object({
      externalUserId: z.string().optional(),
      action: z.literal("delete_cards"),
      cardIds: z.array(z.string().uuid()).min(1).max(100),
    }),
  ]),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);

    if (input.action === "delete_cards") {
      const deleted = await deleteCards({ userId: user.id, cardIds: input.cardIds });
      return { deleted, requested: input.cardIds.length };
    }

    if (input.action === "update_card") {
      const result = await updateCard({
        userId: user.id,
        cardId: input.cardId,
        question: input.question,
        answer: input.answer,
        topic: input.topic,
      });
      return result
        ? { updated: true, progressReset: result.progressReset, card: summarize(result.card) }
        : { updated: false, message: "Card not found for this user." };
    }

    const active = await getActiveCard(identity.channel, identity.threadKey);
    if (!active || active.userId !== user.id) {
      return { message: "There is no active review card for this conversation." };
    }

    if (input.action === "delete_active") {
      const deleted = await deleteCards({ userId: user.id, cardIds: [active.id] });
      return { deleted, removedActiveCard: deleted === 1 };
    }

    const result = await updateCard({
      userId: user.id,
      cardId: active.id,
      question: input.question,
      answer: input.answer,
      topic: input.topic,
    });
    return result
      ? { updated: true, progressReset: result.progressReset, card: summarize(result.card) }
      : { updated: false, message: "The active card no longer exists." };
  },
});

function summarize(card: { question: string; answer: string; topic: string }) {
  return { question: card.question, answer: card.answer, topic: card.topic };
}
