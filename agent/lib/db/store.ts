import { createHash, randomUUID } from "node:crypto";
import { cardFingerprint } from "../cards/fingerprint.js";
import { getSql } from "./client.js";

export type Card = {
  id: string;
  userId: string;
  question: string;
  answer: string;
  topic: string;
  referenceId?: string;
  source: "question" | "image" | "generator";
  generatorId?: string;
  dueAt: Date;
  intervalDays: number;
  repetitions: number;
  lastReviewedAt?: Date;
};

export type UserProfile = {
  id: string;
  externalUserId: string;
  preferredWhatsAppThreadId?: string;
};

export async function getOrCreateUser(externalUserId: string): Promise<UserProfile> {
  const sql = getSql();
  const rows = await sql`
    insert into user_profiles (id, external_user_id)
    values (${randomUUID()}, ${externalUserId})
    on conflict (external_user_id) do update set external_user_id = excluded.external_user_id
    returning id, external_user_id, preferred_whatsapp_thread_id
  `;
  return toUser(rows[0]!);
}

export async function rememberWhatsAppThread(userId: string, threadId: string) {
  const sql = getSql();
  await sql`
    update user_profiles
    set preferred_whatsapp_thread_id = ${threadId}, updated_at = now()
    where id = ${userId}
  `;
}

export async function addCards(input: {
  userId: string;
  source: Card["source"];
  referenceId?: string;
  cards: Array<{ question: string; answer: string; topic: string }>;
}): Promise<number> {
  const sql = getSql();
  if (input.referenceId) {
    const references = await sql`
      select id from study_references
      where id = ${input.referenceId} and user_id = ${input.userId}
      limit 1
    `;
    if (references.length === 0) throw new Error("Reference not found for this user.");
  }
  let added = 0;
  for (const card of input.cards) {
    if (input.source === "generator") {
      const rows = await sql`
        insert into cards (
          id, user_id, question, answer, topic, reference_id, source, generator_id, fingerprint
        )
        values (
          ${randomUUID()}, ${input.userId}, ${card.question}, ${card.answer}, ${card.topic},
          ${input.referenceId ?? null}, ${input.source},
          ${card.topic}, ${cardFingerprint(card.question)}
        )
        on conflict do nothing
        returning id
      `;
      added += rows.length;
      continue;
    }

    await sql`
      insert into cards (id, user_id, question, answer, topic, reference_id, source)
      values (
        ${randomUUID()}, ${input.userId}, ${card.question}, ${card.answer}, ${card.topic},
        ${input.referenceId ?? null}, ${input.source}
      )
      on conflict (user_id, question) do update
      set answer = excluded.answer,
          topic = excluded.topic,
          reference_id = coalesce(excluded.reference_id, cards.reference_id),
          source = excluded.source,
          due_at = now()
    `;
    added += 1;
  }
  return added;
}

export async function listGeneratedQuestionsByTopic(input: {
  userId: string;
  topic: string;
  limit: number;
}): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    select question
    from cards
    where user_id = ${input.userId}
      and source = 'generator'
      and topic = ${input.topic}
    order by created_at desc
    limit ${input.limit}
  `;
  return rows.map((row) => String(row.question));
}

export type StudyReference = {
  id: string;
  title: string;
  topics: string[];
  content: string;
  sourceType: "image" | "text" | "seed";
  sourceLabel?: string;
  createdAt: string;
  updatedAt: string;
};

export async function saveStudyReference(input: {
  userId: string;
  title: string;
  topics: string[];
  content: string;
  sourceType: StudyReference["sourceType"];
  sourceLabel?: string;
}): Promise<{ reference: StudyReference; created: boolean }> {
  const sql = getSql();
  const contentHash = createHash("sha256")
    .update(input.content.normalize("NFKC").replace(/\s+/g, " ").trim())
    .digest("hex");
  const existing = await sql`
    select * from study_references
    where user_id = ${input.userId} and content_hash = ${contentHash}
    limit 1
  `;
  if (existing[0]) return { reference: toStudyReference(existing[0]), created: false };

  const rows = await sql`
    insert into study_references (
      id, user_id, title, topics, content, content_hash, source_type, source_label
    )
    values (
      ${randomUUID()}, ${input.userId}, ${input.title}, ${input.topics}, ${input.content},
      ${contentHash}, ${input.sourceType}, ${input.sourceLabel ?? null}
    )
    returning *
  `;
  return { reference: toStudyReference(rows[0]!), created: true };
}

export async function searchStudyReferences(input: {
  userId: string;
  query?: string;
  topic?: string;
  limit: number;
  offset: number;
}) {
  const sql = getSql();
  const rows = input.query
    ? await sql`
        with query as (
          select websearch_to_tsquery('simple', ${input.query}) as value
        )
        select r.id, r.title, r.topics, r.source_type, r.source_label,
               ts_headline(
                 'simple', r.content, query.value,
                 'MaxWords=100, MinWords=30, StartSel=**, StopSel=**'
               ) as excerpt,
               (
                 ts_rank(r.search_vector, query.value)
                 + 0.05 * (
                   select count(*)
                   from regexp_split_to_table(lower(${input.query}), '[^[:alnum:]À-ÿ]+') token
                   where length(token) >= 3
                     and (r.title || ' ' || r.content) ilike '%' || token || '%'
                 )
               )::float as rank,
               count(*) over()::int as match_count,
               r.created_at, r.updated_at
        from study_references r, query
        where r.user_id = ${input.userId}
          and (${input.topic ?? null}::text is null or ${input.topic ?? null} = any(r.topics))
          and (
            r.search_vector @@ query.value
            or r.title ilike '%' || ${input.query} || '%'
            or r.content ilike '%' || ${input.query} || '%'
            or exists (
              select 1
              from regexp_split_to_table(lower(${input.query}), '[^[:alnum:]À-ÿ]+') token
              where length(token) >= 3
                and (r.title || ' ' || r.content) ilike '%' || token || '%'
            )
          )
        order by rank desc, r.updated_at desc
        limit ${input.limit}
        offset ${input.offset}
      `
    : await sql`
        select r.id, r.title, r.topics, r.source_type, r.source_label,
               left(r.content, 1200) as excerpt,
               null::float as rank,
               count(*) over()::int as match_count,
               r.created_at, r.updated_at
        from study_references r
        where r.user_id = ${input.userId}
          and (${input.topic ?? null}::text is null or ${input.topic ?? null} = any(r.topics))
        order by r.updated_at desc
        limit ${input.limit}
        offset ${input.offset}
      `;
  const references = rows.map((row) => ({
    referenceId: String(row.id),
    title: String(row.title),
    topics: toStringArray(row.topics),
    sourceType: String(row.source_type),
    sourceLabel: row.source_label ? String(row.source_label) : null,
    excerpt: String(row.excerpt),
    relevance: row.rank === null ? null : Number(row.rank),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
  const total = rows[0] ? Number(rows[0].match_count) : 0;
  return {
    references,
    pagination: {
      total,
      limit: input.limit,
      offset: input.offset,
      hasMore: input.offset + references.length < total,
    },
  };
}

export async function getStudyReference(
  userId: string,
  referenceId: string,
): Promise<(StudyReference & { linkedCards: number }) | null> {
  const sql = getSql();
  const rows = await sql`
    select r.*, count(c.id)::int as linked_cards
    from study_references r
    left join cards c on c.reference_id = r.id
    where r.id = ${referenceId} and r.user_id = ${userId}
    group by r.id
    limit 1
  `;
  return rows[0]
    ? { ...toStudyReference(rows[0]), linkedCards: Number(rows[0].linked_cards) }
    : null;
}

export async function getActiveCard(channel: string, threadKey: string): Promise<Card | null> {
  const sql = getSql();
  const rows = await sql`
    select c.*
    from active_reviews r
    join cards c on c.id = r.card_id
    where r.channel = ${channel} and r.thread_key = ${threadKey}
    limit 1
  `;
  return rows[0] ? toCard(rows[0]) : null;
}

export async function setActiveCard(input: {
  userId: string;
  channel: string;
  threadKey: string;
  cardId: string;
}) {
  const sql = getSql();
  await sql`
    insert into active_reviews (user_id, channel, thread_key, card_id)
    values (${input.userId}, ${input.channel}, ${input.threadKey}, ${input.cardId})
    on conflict (channel, thread_key) do update
    set user_id = excluded.user_id, card_id = excluded.card_id, asked_at = now()
  `;
}

export async function clearActiveCard(channel: string, threadKey: string) {
  const sql = getSql();
  await sql`delete from active_reviews where channel = ${channel} and thread_key = ${threadKey}`;
}

export async function updateCard(input: {
  userId: string;
  cardId: string;
  question?: string;
  answer?: string;
  topic?: string;
}): Promise<{ card: Card; progressReset: boolean } | null> {
  const sql = getSql();
  const existingRows = await sql`
    select * from cards
    where id = ${input.cardId} and user_id = ${input.userId}
    limit 1
  `;
  if (!existingRows[0]) return null;

  const existing = toCard(existingRows[0]);
  const question = input.question ?? existing.question;
  const answer = input.answer ?? existing.answer;
  const topic = input.topic ?? existing.topic;
  const progressReset = question !== existing.question || answer !== existing.answer;

  const operations = [
    sql`
      update cards
      set question = ${question},
          answer = ${answer},
          topic = ${topic},
          due_at = case when ${progressReset} then now() else due_at end,
          interval_days = case when ${progressReset} then 0 else interval_days end,
          repetitions = case when ${progressReset} then 0 else repetitions end,
          last_reviewed_at = case when ${progressReset} then null else last_reviewed_at end,
          updated_at = now()
      where id = ${input.cardId} and user_id = ${input.userId}
      returning *
    `,
  ];
  if (progressReset) {
    operations.push(sql`delete from review_attempts where card_id = ${input.cardId}`);
  } else if (topic !== existing.topic) {
    operations.push(sql`
      update review_attempts
      set topic = ${topic}
      where card_id = ${input.cardId} and user_id = ${input.userId}
    `);
  }
  const results = await sql.transaction(operations);
  const updated = results[0]?.[0];
  return updated ? { card: toCard(updated), progressReset } : null;
}

export async function deleteCards(input: {
  userId: string;
  cardIds: string[];
}): Promise<number> {
  const sql = getSql();
  if (input.cardIds.length === 0) return 0;
  const rows = await sql`
    delete from cards
    where user_id = ${input.userId}
      and id = any(${input.cardIds}::uuid[])
    returning id
  `;
  return rows.length;
}

export async function chooseNextCard(userId: string, excludeCardId?: string): Promise<Card | null> {
  const sql = getSql();
  const rows = await sql`
    select *
    from cards
    where user_id = ${userId}
    order by
      case when id is distinct from ${excludeCardId ?? null}::uuid then 0 else 1 end,
      case when due_at <= now() then 0 else 1 end,
      due_at,
      last_reviewed_at nulls first
    limit 1
  `;
  return rows[0] ? toCard(rows[0]) : null;
}

export async function recordAnswer(card: Card, correct: boolean) {
  const intervalDays = correct ? Math.min(60, card.intervalDays === 0 ? 1 : card.intervalDays * 2) : 0;
  const dueAt = new Date(
    Date.now() + (correct ? intervalDays * 86_400_000 : 10 * 60_000),
  );
  const sql = getSql();
  await sql.transaction((tx) => [
    tx`
      update cards
      set interval_days = ${intervalDays},
          repetitions = ${correct ? card.repetitions + 1 : 0},
          due_at = ${dueAt.toISOString()},
          last_reviewed_at = now(),
          updated_at = now()
      where id = ${card.id}
    `,
    tx`
      insert into review_attempts (id, user_id, card_id, topic, correct)
      values (${randomUUID()}, ${card.userId}, ${card.id}, ${card.topic}, ${correct})
    `,
  ]);
}

export type TopicSummary = {
  topic: string;
  totalCards: number;
  dueCards: number;
  newCards: number;
  learningCards: number;
  distinctCardsReviewed: number;
  matureCards: number;
  totalAttempts: number;
  overallAccuracy: number | null;
  attempts30d: number;
  accuracy30d: number | null;
  attempts7d: number;
  accuracy7d: number | null;
  previousAttempts7d: number;
  previousAccuracy7d: number | null;
  accuracyTrend7d: number | null;
  lastReviewedAt: string | null;
  demonstrated: boolean;
};

export type LibraryCardStatus = "new" | "learning" | "mature" | "due";
export type LibraryCardSort = "weakest" | "due" | "recent";

export async function getLibraryOverview(input: {
  userId: string;
  topic?: string;
  limit: number;
  offset: number;
}) {
  const sql = getSql();
  const rows = await sql`
    with card_stats as (
      select topic,
             count(*)::int as total_cards,
             count(*) filter (where due_at <= now())::int as due_cards,
             count(*) filter (where repetitions = 0)::int as new_cards,
             count(*) filter (where repetitions > 0 and interval_days < 14)::int as learning_cards,
             count(*) filter (where interval_days >= 14)::int as mature_cards
      from cards
      where user_id = ${input.userId}
        and (${input.topic ?? null}::text is null or topic = ${input.topic ?? null})
      group by topic
    ),
    attempt_stats as (
      select topic,
             count(*)::int as total_attempts,
             count(distinct card_id)::int as distinct_cards_reviewed,
             count(*) filter (where correct)::int as total_correct,
             count(*) filter (where reviewed_at >= now() - interval '30 days')::int as attempts_30d,
             count(*) filter (
               where reviewed_at >= now() - interval '30 days' and correct
             )::int as correct_30d,
             count(*) filter (where reviewed_at >= now() - interval '7 days')::int as attempts_7d,
             count(*) filter (
               where reviewed_at >= now() - interval '7 days' and correct
             )::int as correct_7d,
             count(*) filter (
               where reviewed_at >= now() - interval '14 days'
                 and reviewed_at < now() - interval '7 days'
             )::int as previous_attempts_7d,
             count(*) filter (
               where reviewed_at >= now() - interval '14 days'
                 and reviewed_at < now() - interval '7 days'
                 and correct
             )::int as previous_correct_7d,
             max(reviewed_at) as last_reviewed_at
      from review_attempts
      where user_id = ${input.userId}
        and (${input.topic ?? null}::text is null or topic = ${input.topic ?? null})
      group by topic
    )
    select c.topic,
           c.total_cards,
           c.due_cards,
           c.new_cards,
           c.learning_cards,
           c.mature_cards,
           coalesce(a.total_attempts, 0)::int as total_attempts,
           coalesce(a.distinct_cards_reviewed, 0)::int as distinct_cards_reviewed,
           case when coalesce(a.total_attempts, 0) = 0 then null
                else a.total_correct::float / a.total_attempts end as overall_accuracy,
           coalesce(a.attempts_30d, 0)::int as attempts_30d,
           case when coalesce(a.attempts_30d, 0) = 0 then null
                else a.correct_30d::float / a.attempts_30d end as accuracy_30d,
           coalesce(a.attempts_7d, 0)::int as attempts_7d,
           case when coalesce(a.attempts_7d, 0) = 0 then null
                else a.correct_7d::float / a.attempts_7d end as accuracy_7d,
           coalesce(a.previous_attempts_7d, 0)::int as previous_attempts_7d,
           case when coalesce(a.previous_attempts_7d, 0) = 0 then null
                else a.previous_correct_7d::float / a.previous_attempts_7d end as previous_accuracy_7d,
           a.last_reviewed_at,
           count(*) over()::int as topic_count
    from card_stats c
    left join attempt_stats a using (topic)
    order by
      case when coalesce(a.attempts_30d, 0) = 0 then 0 else 1 end,
      case when coalesce(a.attempts_30d, 0) = 0 then null
           else a.correct_30d::float / a.attempts_30d end nulls first,
      c.due_cards desc,
      c.topic
    limit ${input.limit}
    offset ${input.offset}
  `;

  const globalRows = await sql`
    select count(*)::int as total_cards,
           count(distinct topic)::int as total_topics,
           count(*) filter (where due_at <= now())::int as due_cards,
           count(*) filter (where repetitions = 0)::int as new_cards,
           count(*) filter (where interval_days >= 14)::int as mature_cards
    from cards
    where user_id = ${input.userId}
  `;
  const attemptRows = await sql`
    select count(*)::int as total_attempts,
           count(*) filter (where correct)::int as correct_attempts
    from review_attempts
    where user_id = ${input.userId}
  `;

  const totalTopics = rows[0] ? Number(rows[0].topic_count) : 0;
  const topics = rows.map(toTopicSummary);
  const global = globalRows[0]!;
  const attempts = attemptRows[0]!;
  const totalAttempts = Number(attempts.total_attempts);
  return {
    library: {
      totalCards: Number(global.total_cards),
      totalTopics: Number(global.total_topics),
      dueCards: Number(global.due_cards),
      newCards: Number(global.new_cards),
      matureCards: Number(global.mature_cards),
      totalAttempts,
      overallAccuracy:
        totalAttempts === 0 ? null : Number(attempts.correct_attempts) / totalAttempts,
    },
    topics,
    pagination: {
      total: totalTopics,
      limit: input.limit,
      offset: input.offset,
      hasMore: input.offset + topics.length < totalTopics,
    },
  };
}

export async function getTopicProgression(userId: string, topic: string) {
  const sql = getSql();
  const rows = await sql`
    select date_trunc('week', reviewed_at) as week,
           count(*)::int as attempts,
           count(distinct card_id)::int as distinct_cards,
           avg(correct::int)::float as accuracy
    from review_attempts
    where user_id = ${userId}
      and topic = ${topic}
      and reviewed_at >= now() - interval '12 weeks'
    group by date_trunc('week', reviewed_at)
    order by week
  `;
  return rows.map((row) => ({
    week: new Date(String(row.week)).toISOString().slice(0, 10),
    attempts: Number(row.attempts),
    distinctCards: Number(row.distinct_cards),
    accuracy: Number(row.accuracy),
  }));
}

export async function findLibraryCards(input: {
  userId: string;
  topic?: string;
  query?: string;
  status?: LibraryCardStatus;
  source?: Card["source"];
  sort: LibraryCardSort;
  limit: number;
  offset: number;
}) {
  const sql = getSql();
  const rows = await sql`
    select c.id,
           c.question,
           c.answer,
           c.topic,
           c.source,
           c.generator_id,
           c.reference_id,
           c.due_at,
           c.interval_days,
           c.repetitions,
           c.last_reviewed_at,
           c.created_at,
           count(a.id)::int as attempts,
           count(a.id) filter (where not a.correct)::int as incorrect_attempts,
           case when count(a.id) = 0 then null else avg(a.correct::int)::float end as accuracy,
           (array_agg(a.correct order by a.reviewed_at desc)
             filter (where a.id is not null))[1] as last_attempt_correct,
           count(*) over()::int as match_count
    from cards c
    left join review_attempts a on a.card_id = c.id
    where c.user_id = ${input.userId}
      and (${input.topic ?? null}::text is null or c.topic = ${input.topic ?? null})
      and (${input.source ?? null}::text is null or c.source = ${input.source ?? null})
      and (
        ${input.query ?? null}::text is null
        or c.question ilike '%' || ${input.query ?? null} || '%'
        or c.answer ilike '%' || ${input.query ?? null} || '%'
      )
      and (
        ${input.status ?? null}::text is null
        or (${input.status ?? null} = 'new' and c.repetitions = 0)
        or (${input.status ?? null} = 'learning' and c.repetitions > 0 and c.interval_days < 14)
        or (${input.status ?? null} = 'mature' and c.interval_days >= 14)
        or (${input.status ?? null} = 'due' and c.due_at <= now())
      )
    group by c.id
    order by
      case when ${input.sort} = 'weakest'
        then count(a.id) filter (where not a.correct) end desc,
      case when ${input.sort} = 'weakest'
        then case when count(a.id) = 0 then null else avg(a.correct::int)::float end end asc nulls last,
      case when ${input.sort} = 'due' then c.due_at end asc,
      case when ${input.sort} = 'recent' then c.created_at end desc,
      c.due_at,
      c.created_at
    limit ${input.limit}
    offset ${input.offset}
  `;
  const cards = rows.map((row) => ({
    cardId: String(row.id),
    question: String(row.question),
    answer: String(row.answer),
    topic: String(row.topic),
    source: row.source as Card["source"],
    generatorId: row.generator_id ? String(row.generator_id) : null,
    referenceId: row.reference_id ? String(row.reference_id) : null,
    due: new Date(String(row.due_at)).toISOString(),
    intervalDays: Number(row.interval_days),
    repetitions: Number(row.repetitions),
    lastReviewedAt: row.last_reviewed_at ? new Date(String(row.last_reviewed_at)).toISOString() : null,
    attempts: Number(row.attempts),
    incorrectAttempts: Number(row.incorrect_attempts),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
    lastAttemptCorrect: row.last_attempt_correct === null ? null : Boolean(row.last_attempt_correct),
  }));
  const total = rows[0] ? Number(rows[0].match_count) : 0;
  return {
    cards,
    pagination: {
      total,
      limit: input.limit,
      offset: input.offset,
      hasMore: input.offset + cards.length < total,
    },
  };
}

export async function listUsersDueForScheduledReview(now = new Date()): Promise<UserProfile[]> {
  const sql = getSql();
  const today = now.toISOString().slice(0, 10);
  const rows = await sql`
    select distinct p.id, p.external_user_id, p.preferred_whatsapp_thread_id
    from user_profiles p
    join cards c on c.user_id = p.id
    where p.preferred_whatsapp_thread_id is not null
      and c.due_at <= ${now.toISOString()}
      and (p.last_scheduled_review_on is null or p.last_scheduled_review_on < ${today}::date)
  `;
  return rows.map(toUser);
}

export async function markScheduledReviewStarted(userId: string, now = new Date()) {
  const sql = getSql();
  await sql`
    update user_profiles
    set last_scheduled_review_on = ${now.toISOString().slice(0, 10)}::date, updated_at = now()
    where id = ${userId}
  `;
}

function toUser(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    externalUserId: String(row.external_user_id),
    preferredWhatsAppThreadId: row.preferred_whatsapp_thread_id
      ? String(row.preferred_whatsapp_thread_id)
      : undefined,
  };
}

function toTopicSummary(row: Record<string, unknown>): TopicSummary {
  const accuracy30d = nullableNumber(row.accuracy_30d);
  const accuracy7d = nullableNumber(row.accuracy_7d);
  const previousAccuracy7d = nullableNumber(row.previous_accuracy_7d);
  const stats = {
    topic: String(row.topic),
    totalCards: Number(row.total_cards),
    dueCards: Number(row.due_cards),
    newCards: Number(row.new_cards),
    learningCards: Number(row.learning_cards),
    distinctCardsReviewed: Number(row.distinct_cards_reviewed),
    matureCards: Number(row.mature_cards),
    totalAttempts: Number(row.total_attempts),
    overallAccuracy: nullableNumber(row.overall_accuracy),
    attempts30d: Number(row.attempts_30d),
    accuracy30d,
    attempts7d: Number(row.attempts_7d),
    accuracy7d,
    previousAttempts7d: Number(row.previous_attempts_7d),
    previousAccuracy7d,
    accuracyTrend7d:
      accuracy7d === null || previousAccuracy7d === null
        ? null
        : accuracy7d - previousAccuracy7d,
    lastReviewedAt: row.last_reviewed_at
      ? new Date(String(row.last_reviewed_at)).toISOString()
      : null,
  };
  return {
    ...stats,
    demonstrated:
      stats.distinctCardsReviewed >= 10 &&
      stats.matureCards >= 5 &&
      stats.attempts30d >= 20 &&
      accuracy30d !== null &&
      accuracy30d >= 0.9,
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toCard(row: Record<string, unknown>): Card {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    question: String(row.question),
    answer: String(row.answer),
    topic: String(row.topic),
    referenceId: row.reference_id ? String(row.reference_id) : undefined,
    source: row.source as Card["source"],
    generatorId: row.generator_id ? String(row.generator_id) : undefined,
    dueAt: new Date(String(row.due_at)),
    intervalDays: Number(row.interval_days),
    repetitions: Number(row.repetitions),
    lastReviewedAt: row.last_reviewed_at ? new Date(String(row.last_reviewed_at)) : undefined,
  };
}

function toStudyReference(row: Record<string, unknown>): StudyReference {
  return {
    id: String(row.id),
    title: String(row.title),
    topics: toStringArray(row.topics),
    content: String(row.content),
    sourceType: row.source_type as StudyReference["sourceType"],
    sourceLabel: row.source_label ? String(row.source_label) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
