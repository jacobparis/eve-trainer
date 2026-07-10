import { defineTool } from "eve/tools";
import { z } from "zod";
import { getOrCreateUser, searchStudyReferences } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

export default defineTool({
  description:
    "Search retained textbook and user-provided reference material. Use before answering questions about studied material or generating grounded examples. Results include source labels and focused excerpts.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    query: z.string().min(1).max(500).optional(),
    topic: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(50).default(10),
    offset: z.number().int().min(0).default(0),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    return searchStudyReferences({
      userId: user.id,
      query: input.query,
      topic: input.topic,
      limit: input.limit,
      offset: input.offset,
    });
  },
});
