import { defineTool } from "eve/tools";
import { z } from "zod";
import { getOrCreateUser, rememberWhatsAppThread, saveStudyReference } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

const topic = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export default defineTool({
  description:
    "Persist a faithful, structured reference extracted from user-provided textbook material. Returns a reference ID to link to cards. Do not use this for unsupported model-generated facts.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    title: z.string().min(1).max(200),
    topics: z.array(topic).min(1).max(20),
    content: z.string().min(1).max(100_000),
    sourceType: z.enum(["image", "text", "seed"]),
    sourceLabel: z.string().min(1).max(200).optional(),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    if (identity.whatsappThreadId) await rememberWhatsAppThread(user.id, identity.whatsappThreadId);
    const result = await saveStudyReference({
      userId: user.id,
      title: input.title,
      topics: [...new Set(input.topics)],
      content: input.content,
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
    });
    return {
      referenceId: result.reference.id,
      created: result.created,
      title: result.reference.title,
      topics: result.reference.topics,
      message: result.created
        ? "Reference saved. Link its referenceId when adding cards from this source."
        : "This reference was already saved. Reuse its referenceId for cards.",
    };
  },
});
