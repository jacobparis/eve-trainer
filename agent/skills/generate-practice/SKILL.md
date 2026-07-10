---
description: Generate fresh atomic SRS cards for any topic when the learner asks for more examples, varied practice, a unique sentence, or new cards like an existing item.
metadata:
  kind: card-generator
---

# Objective

Create new cards that test the same underlying knowledge or skill as a requested topic or example without copying its surface wording.

# Find the learning target

The request may identify the target through a topic, an existing card, a source reference, or one example. Determine what a correct answer proves the learner can do.

- Preserve the practical learning target, answer format, and approximate difficulty.
- Do not test names for classifications, rule numbers, or academic labels unless knowing the label is itself useful.
- If the request points to an existing card, use `inspect_library` to recover its topic and full item when needed.
- Reuse the existing stable topic slug. Create a new specific slug only when the target is genuinely new.
- If the input combines independent targets, generate separate topic batches instead of compound cards.

# Generation procedure

1. Call `list_generated_cards` with the target topic and inspect the existing generated questions.
2. Generate the number of cards requested, or five when no count was given.
3. Change the scenario, entities, wording, or values while preserving the exact capability being tested.
4. Make every question atomic, self-contained, and answerable with one short unambiguous answer. Put concise accepted alternatives in the answer separated by `|`.
5. Do not repeat, lightly rephrase, or leak the answer from an existing card.
6. Give every card the target topic slug.
7. Call `add_cards` once with `source: "generator"` and the complete batch. Link a retained `referenceId` when the generated material depends on that source.
8. Briefly report how many cards were added and how many duplicates were skipped.

# Quality checks

Before adding each card, confirm that:

- success on the new item is evidence for the same topic as the example;
- the question is natural and factually correct;
- no unrelated knowledge is required;
- the expected answer is complete but minimal;
- the item tests useful recall or application rather than wording trivia;
- it is meaningfully different from the generated cards already listed.
