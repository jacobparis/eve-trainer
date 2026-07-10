import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  chooseNextCard,
  clearActiveCard,
  deleteCards,
  getActiveCard,
  getOrCreateUser,
  recordAnswer,
  rememberWhatsAppThread,
  setActiveCard,
  updateCard,
} from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

export default defineTool({
  description:
    "Start or continue reviewing. With an answer, grade the active card and return the next one. With skip, move on. Can also delete or rewrite the active card when the learner rejects or corrects it.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    channel: z.string().optional(),
    threadKey: z.string().optional(),
    answer: z.string().optional(),
    skip: z.boolean().default(false),
    deleteActive: z.boolean().default(false),
    updateActive: z
      .object({
        question: z.string().min(1).max(2_000).optional(),
        answer: z.string().min(1).max(2_000).optional(),
        topic: z.string().min(1).max(100).optional(),
      })
      .optional(),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    if (identity.whatsappThreadId) await rememberWhatsAppThread(user.id, identity.whatsappThreadId);

    const active = await getActiveCard(identity.channel, identity.threadKey);
    let feedback: string | undefined;
    let previousCardId: string | undefined;

    if (input.deleteActive) {
      if (!active) return { message: "There is no active review card to delete." };
      const deleted = await deleteCards({ userId: user.id, cardIds: [active.id] });
      return { deleted, message: "The active review card was removed. Do not ask it again." };
    } else if (input.updateActive) {
      if (!active) return { message: "There is no active review card to update." };
      const result = await updateCard({
        userId: user.id,
        cardId: active.id,
        ...input.updateActive,
      });
      return result
        ? {
            updated: true,
            progressReset: result.progressReset,
            prompt: result.card.question,
            message: "The active card was updated. Ask the revised prompt only if the user wants to continue.",
          }
        : { updated: false, message: "The active card no longer exists." };
    } else if (input.answer !== undefined) {
      if (!active) return { message: "There is no active review question. Start a review first." };
      const correct = matches(input.answer, active.answer);
      await recordAnswer(active, correct);
      await clearActiveCard(identity.channel, identity.threadKey);
      previousCardId = active.id;
      feedback = correct ? "Correct." : `Not quite. The answer is: ${active.answer}`;
    } else if (input.skip && active) {
      await clearActiveCard(identity.channel, identity.threadKey);
      previousCardId = active.id;
      feedback = "Skipped.";
    } else if (active) {
      return { prompt: active.question, message: "Ask the prompt and wait for an answer." };
    }

    const next = await chooseNextCard(user.id, previousCardId);
    if (!next) return { feedback, message: "There are no review cards yet." };
    await setActiveCard({
      userId: user.id,
      channel: identity.channel,
      threadKey: identity.threadKey,
      cardId: next.id,
    });
    return { feedback, prompt: next.question, message: "Give the feedback, then ask the prompt." };
  },
});

export function matches(answer: string, expected: string): boolean {
  const actual = normalize(answer);
  return expected.split(/\s*(?:\||;|\bor\b)\s*/i).some((value) => normalize(value) === actual);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
