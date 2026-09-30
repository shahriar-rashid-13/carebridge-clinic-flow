-- Covers the self-referencing foreign key so cascading deletes of source documents stay fast.
create index if not exists rag_documents_source_doc_id_idx
  on public.rag_documents (source_doc_id)
  where source_doc_id is not null;
