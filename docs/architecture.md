# Architecture

The learning loop is:

`question or image -> add_cards -> cards -> review -> update due date -> next card`

Generator skills add a second intake path without changing the SRS atom:

`load generator skill -> list existing cards -> add_cards -> cards`

Generator skills own pedagogical instructions and examples. Typed tools own database access, provenance, and fingerprint-based duplicate prevention.

The delivery loop is:

`WhatsApp Cloud -> Chat SDK adapter -> Eve Chat SDK channel -> agent -> WhatsApp Cloud`

The WhatsApp adapter downloads authenticated media before the channel passes it to Eve. `active_reviews` holds only the card currently visible in a conversation. There is no session object or fixed queue. `review` chooses due cards first and otherwise chooses the least recently reviewed card, so explicit requests to continue always work.

The schedule checks every 15 minutes for users with due cards and starts at most one WhatsApp review per user per UTC day. The persisted WhatsApp thread ID lets scheduled and user-initiated reviews resume the same conversation. Chat SDK uses PostgreSQL state for webhook deduplication and distributed locking.
