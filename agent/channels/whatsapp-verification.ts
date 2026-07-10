import { defineChannel, GET } from "eve/channels";
import { handleWhatsAppWebhook } from "./whatsapp.js";

export default defineChannel({
  routes: [
    GET("/eve/v1/chat/whatsapp", async (request) =>
      handleWhatsAppWebhook(request),
    ),
  ],
});
