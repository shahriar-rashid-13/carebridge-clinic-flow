-- Keyword-only fallback: when the caller has no query embedding (for example the embedding quota
-- is exhausted), keep full-text matches instead of dropping every row without a strong trigram hit.
-- With an embedding the similarity cutoff is unchanged.
create or replace function public.match_rag_documents(
  query_text text,
  query_embedding extensions.vector(768),
  match_count integer default 5,
  filter_record_type text default null,
  filter_specialization text default null,
  min_similarity double precision default 0.55,
  include_noise boolean default false,
  include_hidden boolean default false
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
      replace(plainto_tsquery('english', coalesce(query_text, ''))::text, '&', '|') as or_query
  ),
  candidates as (
    select d.doc_id, d.embedding, d.search_text, d.content
    from public.rag_documents d
    where (filter_record_type is null or d.record_type = filter_record_type)
      and (filter_specialization is null or d.specialization = filter_specialization)
      and (include_noise or not d.is_noise)
      and (include_hidden or d.rag_visible)
  ),
  semantic as (
    select c.doc_id,
           1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity,
           row_number() over (order by c.embedding operator(extensions.<=>) query_embedding) as rank
    from candidates c
    where c.embedding is not null and query_embedding is not null
    order by c.embedding operator(extensions.<=>) query_embedding
    limit (select k * 4 from params)
  ),
  fulltext as (
    select c.doc_id,
           ts_rank_cd(c.search_text, q.tsq)::double precision as keyword_rank,
           row_number() over (order by ts_rank_cd(c.search_text, q.tsq) desc) as rank
    from candidates c
    cross join (
      select case when p.or_query = '' then null else to_tsquery('english', p.or_query) end as tsq
      from params p
    ) q
    where q.tsq is not null and c.search_text @@ q.tsq
    order by keyword_rank desc
    limit (select k * 4 from params)
  ),
  fuzzy as (
    select c.doc_id,
           extensions.word_similarity(query_text, c.content)::double precision as fuzzy_score,
           row_number() over (order by extensions.word_similarity(query_text, c.content) desc) as rank
    from candidates c
    where length(coalesce(query_text, '')) >= 3
      and query_text operator(extensions.<%) c.content
    order by fuzzy_score desc
    limit (select k * 4 from params)
  ),
  fused as (
    select u.doc_id, sum(1.0 / (60 + u.rank))::double precision as score
    from (
      select s.doc_id, s.rank from semantic s
      union all select f.doc_id, f.rank from fulltext f
      union all select z.doc_id, z.rank from fuzzy z
    ) u
    group by u.doc_id
  )
  select d.doc_id,
         d.record_type,
         d.content,
         d.specialization,
         d.diagnosis,
         d.faq_topic,
         case when d.embedding is null or query_embedding is null then null
              else 1 - (d.embedding operator(extensions.<=>) query_embedding) end as similarity,
         f.keyword_rank,
         z.fuzzy_score,
         fu.score
  from fused fu
  join public.rag_documents d on d.doc_id = fu.doc_id
  left join fulltext f on f.doc_id = fu.doc_id
  left join fuzzy z on z.doc_id = fu.doc_id
  where (d.embedding is not null and query_embedding is not null
         and 1 - (d.embedding operator(extensions.<=>) query_embedding) >= min_similarity)
     or coalesce(z.fuzzy_score, 0) >= 0.6
     or (query_embedding is null and f.doc_id is not null)
  order by fu.score desc
  limit (select k from params);
$$;
