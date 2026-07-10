import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  deleteCards,
  findLibraryCards,
  getLibraryOverview,
  getOrCreateUser,
  getTopicProgression,
  updateCard,
} from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

const status = z.enum(["new", "learning", "mature", "due"]);
const source = z.enum(["question", "image", "generator"]);
const sort = z.enum(["weakest", "due", "recent"]);

export default defineTool({
  description:
    "Inspect the learner's complete SRS library. Use overview for cross-topic stats and priorities, topic for mastery history and weak cards in one pattern, or search to browse and find individual cards. Results are paginated to stay useful with large libraries.",
  inputSchema: z.discriminatedUnion("view", [
    z.object({
      externalUserId: z.string().optional(),
      view: z.literal("overview"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
    z.object({
      externalUserId: z.string().optional(),
      view: z.literal("topic"),
      topic: z.string().min(1),
      status: status.optional(),
      sort: sort.default("weakest"),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }),
    z.object({
      externalUserId: z.string().optional(),
      view: z.literal("search"),
      query: z.string().min(1).optional(),
      topic: z.string().min(1).optional(),
      status: status.optional(),
      source: source.optional(),
      sort: sort.default("recent"),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }),
    z.object({
      externalUserId: z.string().optional(),
      view: z.literal("delete"),
      cardIds: z.array(z.string().uuid()).min(1).max(100),
    }),
    z.object({
      externalUserId: z.string().optional(),
      view: z.literal("update"),
      cardId: z.string().uuid(),
      question: z.string().min(1).max(2_000).optional(),
      answer: z.string().min(1).max(2_000).optional(),
      topic: z.string().min(1).max(100).optional(),
    }),
  ]),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);

    if (input.view === "delete") {
      const deleted = await deleteCards({ userId: user.id, cardIds: input.cardIds });
      return { view: input.view, deleted, requested: input.cardIds.length };
    }

    if (input.view === "update") {
      const result = await updateCard({
        userId: user.id,
        cardId: input.cardId,
        question: input.question,
        answer: input.answer,
        topic: input.topic,
      });
      return result
        ? {
            view: input.view,
            updated: true,
            progressReset: result.progressReset,
            card: {
              question: result.card.question,
              answer: result.card.answer,
              topic: result.card.topic,
            },
          }
        : { view: input.view, updated: false, message: "Card not found for this user." };
    }

    if (input.view === "overview") {
      return {
        view: input.view,
        ...(await getLibraryOverview({
          userId: user.id,
          limit: input.limit,
          offset: input.offset,
        })),
        masteryCriteria,
      };
    }

    if (input.view === "topic") {
      const [overview, progression, cards] = await Promise.all([
        getLibraryOverview({ userId: user.id, topic: input.topic, limit: 1, offset: 0 }),
        getTopicProgression(user.id, input.topic),
        findLibraryCards({
          userId: user.id,
          topic: input.topic,
          status: input.status,
          sort: input.sort,
          limit: input.limit,
          offset: input.offset,
        }),
      ]);
      return {
        view: input.view,
        topic: overview.topics[0] ?? null,
        weeklyProgression: progression,
        ...cards,
        masteryCriteria,
      };
    }

    return {
      view: input.view,
      ...(await findLibraryCards({
        userId: user.id,
        query: input.query,
        topic: input.topic,
        status: input.status,
        source: input.source,
        sort: input.sort,
        limit: input.limit,
        offset: input.offset,
      })),
    };
  },
});

const masteryCriteria = {
  distinctCardsReviewed: 10,
  matureCards: 5,
  attempts30d: 20,
  accuracy30d: 0.9,
  matureIntervalDays: 14,
};
