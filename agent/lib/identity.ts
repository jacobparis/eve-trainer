import type { ToolContext } from "eve/tools";

export function resolveIdentity(
  input: { externalUserId?: string; channel?: string; threadKey?: string },
  ctx: ToolContext,
) {
  const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
  const attributes = auth?.attributes ?? {};
  const channel = readAttribute(attributes, "channel") ?? input.channel ?? "eve";
  const threadKey = readAttribute(attributes, "thread_id") ?? input.threadKey ?? ctx.session.id;
  return {
    externalUserId: input.externalUserId ?? auth?.principalId ?? ctx.session.id,
    channel,
    threadKey,
    whatsappThreadId: channel === "whatsapp" ? threadKey : undefined,
  };
}

export function normalizeWhatsAppUserId(value: string): string {
  return value.replace(/\D/g, "");
}

function readAttribute(
  attributes: Readonly<Record<string, string | readonly string[]>>,
  key: string,
): string | undefined {
  const value = attributes[key];
  return typeof value === "string" ? value : value?.[0];
}
