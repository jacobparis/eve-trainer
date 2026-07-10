---
description: Generate new Spanish adjective-agreement SRS cards when the learner asks for more adjective-agreement material or varied sentence practice.
metadata:
  kind: card-generator
  generator-id: spanish.adjective-agreement
  topic: spanish.adjective-agreement
---

# Objective

Create atomic cards that test whether a Spanish adjective agrees with its noun in gender and number.

# Example

Question:

> Complete: La casa es ___. (rojo)

Answer:

> roja

# Generation procedure

1. Call `list_generated_cards` with generator ID `spanish.adjective-agreement` and review its existing questions.
2. Generate the number of new cards the learner requested, or five cards when no count was given.
3. Vary masculine and feminine nouns, singular and plural nouns, adjectives, and sentence contexts.
4. Each question must test only adjective agreement and have one short, unambiguous answer.
5. Do not repeat or lightly rephrase an existing question.
6. Give every card the topic `spanish.adjective-agreement`.
7. Call `add_cards` once with `source: "generator"`, `generatorId: "spanish.adjective-agreement"`, and the complete batch.
8. Briefly report how many cards were added and how many duplicates were skipped.

# Quality checks

Before adding each card, confirm that:

- the sentence is natural Spanish;
- the supplied answer is grammatically correct;
- gender and number are clear from the sentence;
- no unrelated grammar knowledge is required;
- the answer is not revealed elsewhere in the question.
