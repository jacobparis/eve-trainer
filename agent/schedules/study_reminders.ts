import { defineSchedule } from "eve/schedules";
import {
  listUsersDueForScheduledReview,
  markScheduledReviewStarted,
} from "../lib/db/store.js";
import whatsapp from "../channels/whatsapp.js";

export default defineSchedule({
  cron: "*/15 * * * *",
  async run({ receive, waitUntil, appAuth }) {
    waitUntil(
      (async () => {
        const users = await listUsersDueForScheduledReview();
        await Promise.all(
          users.map(async (user) => {
            if (!user.preferredWhatsAppThreadId) return;
            await markScheduledReviewStarted(user.id);
            await receive(whatsapp, {
              message: `Start a scheduled review. Call review with externalUserId "${user.externalUserId}", channel "whatsapp", and threadKey "${user.preferredWhatsAppThreadId}", then ask the prompt.`,
              target: {
                adapterName: "whatsapp",
                threadId: user.preferredWhatsAppThreadId,
              },
              auth: appAuth,
            });
          }),
        );
      })(),
    );
  },
});
