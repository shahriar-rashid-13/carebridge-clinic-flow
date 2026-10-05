-- Speed fix for match_rag_documents at 20,000+ rows. The previous version read every filtered row
-- into a shared candidates CTE, which Postgres materialises, so the HNSW, full-text GIN, and
-- trigram GIN indexes were never used and one search took about 4 seconds. Each ranking now
-- queries rag_documents directly with the same filters. Inputs, outputs, and ranking are unchanged.
create or replace function public.match_rag_documents(
  query_text text,
  query_embedding extensions.vector(768) default null,
  match_count integer default 5,
  filter_record_type text default null,
  filter_specialization text default null,
  min_similarity double precision default 0.55,
  include_noise boolean default false,
  include_hidden boolean default false,
  query_embedding_gte extensions.vector(384) default null,
  min_similarity_gte double precision default 0.80
)
returns table (
  doc_id text,
  record_type text,
  content text,
  specialization text,
  diagnosis text,
  faq_topic text,
  similarity double precision,
  keyword_rank double precision,
  fuzzy_score double precision,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      least(greatest(coalesce(match_count, 5), 1), 20) as k,
      replace(plainto_tsquery('english', coalesce(query_text, ''))::text, '&', '|') as or_query,
      query_embedding_gte is not null as use_gte,
      query_embedding_gte is not null or query_embedding is not null as has_embedding
  ),
  semantic_gte as (
    select d.doc_id,
           row_number() over (order by d.embedding_gte operator(extensions.<=>) query_embedding_gte) as rank
    from (
      select d.doc_id, d.embedding_gte
      from public.rag_documents d
      where query_embedding_gte is not null
        and d.embedding_gte is not null
        and (filter_record_type is null or d.record_type = filter_record_type)
        and (filter_specialization is null or d.specialization = filter_specialization)
        and (include_noise or not d.is_noise)
        and (include_hidden or d.rag_visible)
      order by d.embedding_gte operator(extensions.<=>) query_embedding_gte
      limit (select k * 4 from params)
    ) d
  ),
  semantic_gemini as (
    select d.doc_id,
           row_number() over (order by d.embedding operator(extensions.<=>) query_embedding) as rank
    from (
      select d.doc_id, d.embedding
      from public.rag_documents d
      where query_embedding_gte is null
        and query_embedding is not null
        and d.embedding is not null
        and (filter_record_type is null or d.record_type = filter_record_type)
        and (filter_specialization is null or d.specialization = filter_specialization)
        and (include_noise or not d.is_noise)
        and (include_hidden or d.rag_visible)
      order by d.embedding operator(extensions.<=>) query_embedding
      limit (select k * 4 from params)
    ) d
  ),
  tsq as (
    select case when p.or_query = '' then null else to_tsquery('english', p.or_query) end as q
    from params p
  ),
  fulltext as (
    select d.doc_id,
           ts_rank_cd(d.search_text, t.q)::double precision as keyword_rank,
           row_number() over (order by ts_rank_cd(d.search_text, t.q) desc) as rank
    from public.rag_documents d
    cross join tsq t
    where t.q is not null
      and d.search_text @@ t.q
      and (filter_record_type is null or d.record_type = filter_record_type)
      and (filter_specialization is null or d.specialization = filter_specialization)
      and (include_noise or not d.is_noise)
      and (include_hidden or d.rag_visible)
    order by keyword_rank desc
    limit (select k * 4 from params)
  ),
  fuzzy as (
    select d.doc_id,
           extensions.word_similarity(query_text, d.content)::double precision as fuzzy_score,
           row_number() over (order by extensions.word_similarity(query_text, d.content) desc) as rank
    from public.rag_documents d
    where length(coalesce(query_text, '')) >= 3
      and query_text operator(extensions.<%) d.content
      and (filter_record_type is null or d.record_type = filter_record_type)
      and (filter_specialization is null or d.specialization = filter_specialization)
      and (include_noise or not d.is_noise)
      and (include_hidden or d.rag_visible)
    order by fuzzy_score desc
    limit (select k * 4 from params)
  ),
  fused as (
    select u.doc_id, sum(1.0 / (60 + u.rank))::double precision as score
    from (
      select s.doc_id, s.rank from semantic_gte s
      union all select g.doc_id, g.rank from semantic_gemini g
      union all select f.doc_id, f.rank from fulltext f
      union all select z.doc_id, z.rank from fuzzy z
    ) u
    group by u.doc_id
  ),
  scored as (
    select fu.doc_id,
           fu.score,
           case
             when p.use_gte and d.embedding_gte is not null
               then 1 - (d.embedding_gte operator(extensions.<=>) query_embedding_gte)
             when not p.use_gte and query_embedding is not null and d.embedding is not null
               then 1 - (d.embedding operator(extensions.<=>) query_embedding)
           end as similarity,
           case when p.use_gte then min_similarity_gte else min_similarity end as cutoff,
           p.has_embedding
    from fused fu
    cross join params p
    join public.rag_documents d on d.doc_id = fu.doc_id
  )
  select d.doc_id,
         d.record_type,
         d.content,
         d.specialization,
         d.diagnosis,
         d.faq_topic,
         s.similarity,
         f.keyword_rank,
         z.fuzzy_score,
         s.score
  from scored s
  join public.rag_documents d on d.doc_id = s.doc_id
  left join fulltext f on f.doc_id = s.doc_id
  left join fuzzy z on z.doc_id = s.doc_id
  where coalesce(s.similarity, 0) >= s.cutoff
     or coalesce(z.fuzzy_score, 0) >= 0.6
     or (not s.has_embedding and f.doc_id is not null)
  order by s.score desc
  limit (select k from params);
$$;
