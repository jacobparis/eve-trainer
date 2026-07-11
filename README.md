# Eve Trainer

An opinionated single-user WhatsApp learning agent built with Eve. It turns questions, photos, and retained source material into personalized practice, scheduled reviews, and topic-level mastery.

1. Questions and photos become atomic review cards immediately.
2. A schedule starts review when a card is due.
3. Review continues for as long as the learner wants.
4. One generic Eve skill turns any topic or example into varied cards that enter the same SRS queue as every other card.

There are no fixed lesson batches, curriculum files, or confirmation queues. Every card has a stable topic slug for the pattern it tests and can link to retained textbook material. Neon stores references, cards, per-topic review attempts, progress, the active review, and Chat SDK delivery state. Eve handles the agent loop; the official Chat SDK WhatsApp Business Cloud adapter handles messages and authenticated media downloads directly from Meta.

## Setup

### Create a Git-backed deployment

Use this repository as a GitHub template, then import the resulting repository into Vercel and deploy from its production branch. This is required for durable Eve sessions to receive the current deployment's tools and instructions. Direct, branchless `vercel deploy` uploads can leave an existing WhatsApp session pinned to an older tool set.

1. Click **Use this template** on GitHub and create your own repository.
2. Import that repository into Vercel.
3. Confirm Vercel's production branch is `main` (or the branch you deploy from).
4. Make subsequent production deployments through the Git integration.

### Run the agent

1. Copy `.env.example` to `.env.local` and fill in the values described below.

2. Install and initialize the database:

   ```sh
   npm install
   psql "$DATABASE_URL" -f db/migrations/001_initial.sql
   npm run dev
   ```

### Minimal WhatsApp setup with Meta's test number

This is the smallest setup for one user. It uses Meta's supplied WhatsApp test number and allows only the personal phone number configured in `WHATSAPP_USER_NUMBER`. You do not need to register a business phone number, add payment, complete business verification, or publish the app to test this flow.

#### 1. Create the Meta app and test recipient

1. In [Meta for Developers](https://developers.facebook.com/apps/), create a Business app and add the WhatsApp product/use case.
2. Open **WhatsApp → API Setup** and claim the supplied test number.
3. Under **Recipient**, add your personal WhatsApp number and complete its verification. Test numbers can only message recipients added here.
4. Copy the **Phone Number ID** and **WhatsApp Business Account ID** shown beside the test number. They are different values; the application environment needs the Phone Number ID, while the WABA ID is used for the subscription check below.

You can ignore the production checklist items for registering a phone number, adding payment, testing a registered number, and business verification while using the test number.

#### 2. Collect the environment values

| Environment variable | Where it comes from |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | **WhatsApp → API Setup**, beside the Meta test number. Do not use the WABA ID here. |
| `WHATSAPP_ACCESS_TOKEN` | Click **Generate token** in **WhatsApp → API Setup** for a quick test, or create a system-user token as described below. |
| `WHATSAPP_APP_SECRET` | **App settings → Basic → App secret → Show**. Meta creates it with the app; there is no separate “create secret” step. The Client Token shown under Advanced settings is not the app secret. |
| `WHATSAPP_VERIFY_TOKEN` | A random secret string you invent. Enter the exact same value when configuring the webhook. |
| `WHATSAPP_USER_NUMBER` | Your personal recipient number in E.164 form, such as `+14165550123`. This is not Meta's test number. |

The token box in API Setup returning to **Not generated yet** after a refresh is normal. That page issues temporary tokens and does not redisplay them. A token already copied into Vercel remains there, but the temporary token itself eventually expires.

For a durable daily agent, create a permanent system-user token:

1. Open **Meta Business Settings → Users → System users**.
2. Add an Admin system user.
3. Assign the Meta app and WhatsApp Business Account to that system user with full control.
4. Choose **Generate new token**, select this app, and grant `whatsapp_business_messaging` and `whatsapp_business_management`.
5. Copy the token when it is shown; Meta will not show it again.

#### 3. Configure and subscribe the webhook

Deploy the app first, then use the stable production alias—not a unique preview/deployment URL—as the callback:

```text
https://your-domain.example/eve/v1/chat/whatsapp
```

In **WhatsApp → Configuration → Webhooks**:

1. Set the callback URL above.
2. Enter the exact value used for `WHATSAPP_VERIFY_TOKEN`.
3. Complete verification.
4. Subscribe the webhook to the `messages` field.

Webhook verification alone is not sufficient. The WABA must also be subscribed to the app. In Meta's Graph API Explorer, select the app, use an access token with `whatsapp_business_management`, and send:

```text
POST /<WHATSAPP_BUSINESS_ACCOUNT_ID>/subscribed_apps
```

The expected response is:

```json
{ "success": true }
```

You can confirm the subscription with:

```text
GET /<WHATSAPP_BUSINESS_ACCOUNT_ID>/subscribed_apps
```

The response should include this app. This subscription was the missing step when webhook test events appeared in Meta but inbound WhatsApp messages did not reach the agent.

#### 4. Leave incompatible Meta security settings off

Under **App settings → Advanced → Security**, leave **Require app secret** off. Version `4.32.x` of the WhatsApp Chat SDK adapter verifies inbound webhook signatures with `WHATSAPP_APP_SECRET`, but does not attach Meta's `appsecret_proof` to its outbound Graph API requests. Enabling that toggle causes outbound replies to fail.

Still set `WHATSAPP_APP_SECRET`; it is required for webhook signature verification. The Server IP allowlist should remain empty for a Vercel deployment, which does not have a single fixed outbound IP by default.

#### 5. Set Vercel variables and redeploy

In **Vercel → Project → Settings → Environment Variables**, set these for Production:

```text
AI_GATEWAY_API_KEY
DATABASE_URL
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_USER_NUMBER
```

Redeploy after adding or changing any environment variable. Updating project settings does not modify an already-running deployment.

#### 6. Test the complete inbound flow

1. Sending a template from Meta's API Setup page verifies outbound API access only.
2. From the whitelisted personal phone, reply to Meta's test number with a normal text message such as `review`.
3. In Meta's webhook activity, confirm the app received a `messages` event, not only delivery-status events.
4. Confirm the agent replies in WhatsApp. Then send an image to verify media delivery.

If the webhook receives the message but there is no reply, check these in order:

1. `WHATSAPP_USER_NUMBER` exactly matches the sender's personal number in E.164 form.
2. `WHATSAPP_PHONE_NUMBER_ID` is the test number's Phone Number ID, not the WABA ID.
3. The WABA's `subscribed_apps` response includes this app.
4. The access token is current and has both WhatsApp permissions.
5. The webhook is subscribed to `messages`.
6. **Require app secret** is off, while `WHATSAPP_APP_SECRET` is still configured.
7. The Vercel deployment was recreated after the latest environment-variable change.

## Core files

- `agent/channels/whatsapp.ts` — connects the Chat SDK WhatsApp adapter to Eve and forwards attachments.
- `agent/channels/whatsapp-verification.ts` — serves Meta's GET verification challenge through the same adapter.
- `agent/instructions.md` — the complete study behavior.
- `agent/tools/add_cards.ts` — grows the card library.
- `agent/tools/list_generated_cards.ts` — gives the generic generator recent material to avoid by topic.
- `agent/skills/generate-practice/SKILL.md` — generates fresh practice from any topic or example item.
- `agent/tools/review.ts` — starts, grades, skips, and continues review.
- `agent/tools/inspect_library.ts` — browses the full catalog and reports topic mastery, trends, and weak cards.
- `agent/tools/manage_cards.ts` — updates, retags, or deletes individual and active review cards.
- `agent/tools/save_reference.ts` — retains a faithful transcription of user-provided study material.
- `agent/tools/search_references.ts` / `get_reference.ts` — retrieve stored textbook knowledge for factual answers and grounded card generation.
- `agent/skills/textbook-reference/SKILL.md` — Eve-native ingestion and retrieval procedure.
- `agent/schedules/study_reminders.ts` — starts one due WhatsApp review per day.
- `agent/lib/db/store.ts` — card state and scheduling persistence.

WhatsApp only permits free-form outbound messages during its rolling customer-service window. The intended personal workflow assumes daily interaction; production deployments should add an approved template fallback for missed days.

## Card generators

`generate-practice` is one packaged Eve skill for every topic. It identifies the capability tested by a supplied example or existing card, reuses that card's topic, inspects previously generated questions for the topic, and varies the surface scenario without changing the learning target. It then saves the batch through `add_cards` with `source: "generator"`. The runtime derives generation provenance and duplicate scope from each card's topic, so forks do not need topic-specific generator code or frontmatter. Generated cards remain ordinary durable cards with their own SRS state.

## Topic mastery

`source` records whether a card was generated, while `topic` records the pattern it tests and scopes generated-card deduplication. Photo-derived, directly requested, and generated cards can therefore contribute evidence to the same topic. Each graded answer is appended to `review_attempts`. The initial mastery policy requires 10 distinct cards reviewed, 20 attempts in 30 days at 90% accuracy, and 5 cards retained at intervals of at least 14 days.

## Retained references

Textbook photos and pasted excerpts are stored separately from SRS cards. The `textbook-reference` skill directs the agent to preserve a faithful Markdown transcription with its title, topics, and visible page or section label, then link derived cards through `reference_id`. Factual questions search these references first with PostgreSQL full-text search. Static curriculum shipped with a fork can instead live under a skill's `references/` directory; runtime user uploads remain in Postgres so they survive sessions and deployments.
