import { defineTool } from "eve/tools";
import { z } from "zod";
import { getOrCreateUser, listGeneratedQuestionsByTopic } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

export default defineTool({
  description:
    "List recent generated cards for a topic. Call this before generating more practice so new questions do not repeat existing material.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    topic: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    const questions = await listGeneratedQuestionsByTopic({
      userId: user.id,
      topic: input.topic,
      limit: input.limit,
    });
    return { topic: input.topic, count: questions.length, questions };
  },
});
