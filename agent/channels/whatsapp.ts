import { createPostgresState } from "@chat-adapter/state-pg";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { normalizeWhatsAppUserId } from "../lib/identity.js";

type WhatsAppThread = {
  id: string;
};

type WhatsAppMessage = {
  text: string;
  author: { userId: string };
  attachments: Array<{
    data?: Buffer | Blob;
    fetchData?: () => Promise<Buffer>;
    mimeType?: string;
    name?: string;
  }>;
};

const bridge = chatSdkChannel({
  userName: "eve-trainer",
  adapters: {
    whatsapp: createWhatsAppAdapter(),
  },
  state: createPostgresState({ keyPrefix: "eve-trainer-chat" }),
  concurrency: "queue",
});

export const handleWhatsAppWebhook = (request: Request) =>
  bridge.bot.webhooks.whatsapp(request);

bridge.bot.onDirectMessage(async (thread: WhatsAppThread, message: WhatsAppMessage) => {
  const allowedUser = process.env.WHATSAPP_USER_NUMBER;
  if (allowedUser && normalizeWhatsAppUserId(message.author.userId) !== normalizeWhatsAppUserId(allowedUser)) {
    return;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string; filename?: string }
  > = [];
  if (message.text.trim()) content.push({ type: "text", text: message.text });

  for (const attachment of message.attachments) {
    const data = attachment.data ?? (await attachment.fetchData?.());
    if (!data) continue;
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
    content.push({
      type: "file",
      data: bytes,
      mediaType: attachment.mimeType ?? "application/octet-stream",
      filename: attachment.name,
    });
  }

  if (content.length === 0) return;
  if (!content.some((part) => part.type === "text")) {
    content.unshift({ type: "text", text: "The user sent this attachment." });
  }

  await bridge.send(content, {
    thread,
    auth: {
      authenticator: "whatsapp",
      principalId: message.author.userId,
      principalType: "user",
      attributes: {
        channel: "whatsapp",
        thread_id: thread.id,
      },
    },
  });
});

export const whatsapp = bridge.channel;
export default bridge.channel;
