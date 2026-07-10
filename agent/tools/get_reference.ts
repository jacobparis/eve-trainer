import { defineTool } from "eve/tools";
import { z } from "zod";
import { getOrCreateUser, getStudyReference } from "../lib/db/store.js";
import { resolveIdentity } from "../lib/identity.js";

export default defineTool({
  description:
    "Load the complete retained content for one reference returned by search_references.",
  inputSchema: z.object({
    externalUserId: z.string().optional(),
    referenceId: z.string().uuid(),
  }),
  async execute(input, ctx) {
    const identity = resolveIdentity(input, ctx);
    const user = await getOrCreateUser(identity.externalUserId);
    const reference = await getStudyReference(user.id, input.referenceId);
    return reference ?? { message: "Reference not found." };
  },
});
