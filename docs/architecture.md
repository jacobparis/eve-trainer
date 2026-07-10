# Architecture

The learning loop is:

`question or image -> add_cards -> cards -> review -> update due date -> next card`

The generic practice skill adds a second intake path without changing the SRS atom:

`example or topic -> load generate-practice -> list generated topic cards -> add_cards -> cards`

The skill identifies the capability tested by an example and varies its surface form. Topic data stays on ordinary cards rather than in topic-specific code. Typed tools own database access, provenance, and topic-scoped fingerprint duplicate prevention.

The delivery loop is:

`WhatsApp Cloud -> Chat SDK adapter -> Eve Chat SDK channel -> agent -> WhatsApp Cloud`

The WhatsApp adapter downloads authenticated media before the channel passes it to Eve. `active_reviews` holds only the card currently visible in a conversation. There is no session object or fixed queue. `review` chooses due cards first and otherwise chooses the least recently reviewed card, so explicit requests to continue always work.

The schedule checks every 15 minutes for users with due cards and starts at most one WhatsApp review per user per UTC day. The persisted WhatsApp thread ID lets scheduled and user-initiated reviews resume the same conversation. Chat SDK uses PostgreSQL state for webhook deduplication and distributed locking.
