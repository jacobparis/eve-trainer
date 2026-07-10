import { defineTool } from "eve/tools";
import { z } from "zod";
import { getOrCreateUser, listGeneratedQuestions } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

export default defineTool({
  description:
    "List recent cards from a card-generator skill. Call this before generating more cards so new questions do not repeat existing material.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    generatorId: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    const questions = await listGeneratedQuestions({
      userId: user.id,
      generatorId: input.generatorId,
      limit: input.limit,
    });
    return { generatorId: input.generatorId, count: questions.length, questions };
  },
});
