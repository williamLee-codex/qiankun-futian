BEGIN;

CREATE TABLE IF NOT EXISTS platform.knowledge_articles (
  id uuid DEFAULT gen_random_uuid(),
  knowledge_key text NOT NULL,
  title text NOT NULL,
  knowledge_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'internal',
  current_version_id uuid,
  owner_domain text NOT NULL,
  source_of_truth boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT knowledge_articles_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_articles_knowledge_key_key UNIQUE (knowledge_key),
  CONSTRAINT knowledge_articles_knowledge_key_check
    CHECK (knowledge_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT knowledge_articles_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT knowledge_articles_knowledge_type_check
    CHECK (knowledge_type IN ('bible', 'whitepaper', 'constitution', 'encyclopedia', 'official_article', 'policy', 'specification')),
  CONSTRAINT knowledge_articles_status_check
    CHECK (status IN ('draft', 'review', 'official', 'deprecated', 'archived')),
  CONSTRAINT knowledge_articles_visibility_check
    CHECK (visibility IN ('public', 'internal', 'restricted')),
  CONSTRAINT knowledge_articles_owner_domain_check
    CHECK (owner_domain ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT knowledge_articles_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.knowledge_articles IS
'Knowledge aggregate root for governed official Knowledge resources and current version references.';
COMMENT ON COLUMN platform.knowledge_articles.id IS
'Knowledge Article aggregate UUID.';
COMMENT ON COLUMN platform.knowledge_articles.knowledge_key IS
'Stable canonical Knowledge key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.knowledge_articles.title IS
'Human-readable Knowledge title.';
COMMENT ON COLUMN platform.knowledge_articles.knowledge_type IS
'Knowledge category. Allowed values are bible, whitepaper, constitution, encyclopedia, official_article, policy, and specification.';
COMMENT ON COLUMN platform.knowledge_articles.status IS
'Knowledge lifecycle status. Allowed values are draft, review, official, deprecated, and archived.';
COMMENT ON COLUMN platform.knowledge_articles.visibility IS
'Knowledge visibility. Allowed values are public, internal, and restricted.';
COMMENT ON COLUMN platform.knowledge_articles.current_version_id IS
'Nullable current Knowledge Version reference. Deleting a version clears this pointer without deleting the article.';
COMMENT ON COLUMN platform.knowledge_articles.owner_domain IS
'Canonical owner domain responsible for this Knowledge resource.';
COMMENT ON COLUMN platform.knowledge_articles.source_of_truth IS
'Indicates whether this Knowledge article is authoritative for its owner domain.';
COMMENT ON COLUMN platform.knowledge_articles.created_at IS
'Timestamp when the Knowledge Article aggregate was created.';
COMMENT ON COLUMN platform.knowledge_articles.updated_at IS
'Timestamp when the Knowledge Article aggregate was last updated.';
COMMENT ON COLUMN platform.knowledge_articles.archived_at IS
'Timestamp when the Knowledge Article aggregate was archived.';
COMMENT ON COLUMN platform.knowledge_articles.deleted_at IS
'Timestamp when the Knowledge Article aggregate was soft deleted.';

CREATE INDEX IF NOT EXISTS knowledge_articles_knowledge_type_idx
  ON platform.knowledge_articles (knowledge_type);

CREATE INDEX IF NOT EXISTS knowledge_articles_status_idx
  ON platform.knowledge_articles (status);

CREATE INDEX IF NOT EXISTS knowledge_articles_visibility_idx
  ON platform.knowledge_articles (visibility);

CREATE INDEX IF NOT EXISTS knowledge_articles_owner_domain_idx
  ON platform.knowledge_articles (owner_domain);

CREATE TABLE IF NOT EXISTS platform.knowledge_versions (
  id uuid DEFAULT gen_random_uuid(),
  knowledge_article_id uuid NOT NULL,
  version_number integer NOT NULL,
  content_hash text NOT NULL,
  content_reference text NOT NULL,
  change_summary text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_versions_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_versions_knowledge_article_id_fkey
    FOREIGN KEY (knowledge_article_id) REFERENCES platform.knowledge_articles(id) ON DELETE RESTRICT,
  CONSTRAINT knowledge_versions_article_version_key
    UNIQUE (knowledge_article_id, version_number),
  CONSTRAINT knowledge_versions_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT knowledge_versions_content_hash_check
    CHECK (content_hash ~ '^[A-Za-z0-9:_-]{16,256}$'),
  CONSTRAINT knowledge_versions_content_reference_check
    CHECK (btrim(content_reference) <> ''),
  CONSTRAINT knowledge_versions_change_summary_check
    CHECK (change_summary IS NULL OR btrim(change_summary) <> ''),
  CONSTRAINT knowledge_versions_status_check
    CHECK (status IN ('draft', 'review', 'official', 'superseded', 'withdrawn')),
  CONSTRAINT knowledge_versions_official_published_check
    CHECK (status <> 'official' OR published_at IS NOT NULL)
);

COMMENT ON TABLE platform.knowledge_versions IS
'Append-only Knowledge version metadata. This table stores repository or storage references and hashes only.';
COMMENT ON COLUMN platform.knowledge_versions.id IS
'Knowledge Version UUID.';
COMMENT ON COLUMN platform.knowledge_versions.knowledge_article_id IS
'Owning Knowledge Article aggregate reference.';
COMMENT ON COLUMN platform.knowledge_versions.version_number IS
'Monotonic Knowledge version number scoped to the owning Knowledge Article.';
COMMENT ON COLUMN platform.knowledge_versions.content_hash IS
'Hash or structured digest for the referenced Knowledge version.';
COMMENT ON COLUMN platform.knowledge_versions.content_reference IS
'Storage or repository reference for the Knowledge version.';
COMMENT ON COLUMN platform.knowledge_versions.change_summary IS
'Optional summary of the version change.';
COMMENT ON COLUMN platform.knowledge_versions.status IS
'Knowledge version status. Allowed values are draft, review, official, superseded, and withdrawn.';
COMMENT ON COLUMN platform.knowledge_versions.published_at IS
'Timestamp when this Knowledge version became official.';
COMMENT ON COLUMN platform.knowledge_versions.created_at IS
'Timestamp when this Knowledge version record was created.';

CREATE INDEX IF NOT EXISTS knowledge_versions_knowledge_article_id_idx
  ON platform.knowledge_versions (knowledge_article_id);

CREATE INDEX IF NOT EXISTS knowledge_versions_status_idx
  ON platform.knowledge_versions (status);

CREATE INDEX IF NOT EXISTS knowledge_versions_published_at_idx
  ON platform.knowledge_versions (published_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_articles_current_version_id_fkey'
      AND conrelid = 'platform.knowledge_articles'::regclass
  ) THEN
    ALTER TABLE platform.knowledge_articles
      ADD CONSTRAINT knowledge_articles_current_version_id_fkey
      FOREIGN KEY (current_version_id) REFERENCES platform.knowledge_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS platform.knowledge_citations (
  id uuid DEFAULT gen_random_uuid(),
  knowledge_version_id uuid NOT NULL,
  citation_type text NOT NULL,
  source_title text NOT NULL,
  source_reference text NOT NULL,
  source_hash text,
  publisher text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_citations_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_citations_knowledge_version_id_fkey
    FOREIGN KEY (knowledge_version_id) REFERENCES platform.knowledge_versions(id) ON DELETE RESTRICT,
  CONSTRAINT knowledge_citations_version_source_reference_key
    UNIQUE (knowledge_version_id, source_reference),
  CONSTRAINT knowledge_citations_citation_type_check
    CHECK (citation_type IN ('official_source', 'book', 'paper', 'website', 'internal_canon', 'historical_source')),
  CONSTRAINT knowledge_citations_source_title_check
    CHECK (btrim(source_title) <> ''),
  CONSTRAINT knowledge_citations_source_reference_check
    CHECK (btrim(source_reference) <> ''),
  CONSTRAINT knowledge_citations_source_hash_check
    CHECK (source_hash IS NULL OR source_hash ~ '^[A-Za-z0-9:_-]{16,256}$'),
  CONSTRAINT knowledge_citations_publisher_check
    CHECK (publisher IS NULL OR btrim(publisher) <> '')
);

COMMENT ON TABLE platform.knowledge_citations IS
'Append-only official source references for Knowledge versions.';
COMMENT ON COLUMN platform.knowledge_citations.id IS
'Knowledge Citation UUID.';
COMMENT ON COLUMN platform.knowledge_citations.knowledge_version_id IS
'Owning Knowledge Version reference.';
COMMENT ON COLUMN platform.knowledge_citations.citation_type IS
'Citation type. Allowed values are official_source, book, paper, website, internal_canon, and historical_source.';
COMMENT ON COLUMN platform.knowledge_citations.source_title IS
'Citation source title.';
COMMENT ON COLUMN platform.knowledge_citations.source_reference IS
'Citation source reference such as repository path, storage path, DOI, ISBN, URL, or approved internal canon key.';
COMMENT ON COLUMN platform.knowledge_citations.source_hash IS
'Optional source digest for citation integrity verification.';
COMMENT ON COLUMN platform.knowledge_citations.publisher IS
'Optional publisher or issuing authority for the citation.';
COMMENT ON COLUMN platform.knowledge_citations.published_at IS
'Optional timestamp or date when the cited source was published.';
COMMENT ON COLUMN platform.knowledge_citations.created_at IS
'Timestamp when this Knowledge citation record was created.';

CREATE INDEX IF NOT EXISTS knowledge_citations_knowledge_version_id_idx
  ON platform.knowledge_citations (knowledge_version_id);

CREATE INDEX IF NOT EXISTS knowledge_citations_citation_type_idx
  ON platform.knowledge_citations (citation_type);

CREATE INDEX IF NOT EXISTS knowledge_citations_publisher_idx
  ON platform.knowledge_citations (publisher);

DROP TRIGGER IF EXISTS trg_knowledge_articles_set_updated_at ON platform.knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_set_updated_at
  BEFORE UPDATE ON platform.knowledge_articles
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_knowledge_articles_set_updated_at ON platform.knowledge_articles IS
'Maintains platform.knowledge_articles.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_knowledge_versions_reject_update ON platform.knowledge_versions;
CREATE TRIGGER trg_knowledge_versions_reject_update
  BEFORE UPDATE ON platform.knowledge_versions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_knowledge_versions_reject_update ON platform.knowledge_versions IS
'Rejects all UPDATE attempts on append-only Knowledge Version records.';

DROP TRIGGER IF EXISTS trg_knowledge_versions_reject_delete ON platform.knowledge_versions;
CREATE TRIGGER trg_knowledge_versions_reject_delete
  BEFORE DELETE ON platform.knowledge_versions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_knowledge_versions_reject_delete ON platform.knowledge_versions IS
'Rejects all DELETE attempts on append-only Knowledge Version records.';

DROP TRIGGER IF EXISTS trg_knowledge_citations_reject_update ON platform.knowledge_citations;
CREATE TRIGGER trg_knowledge_citations_reject_update
  BEFORE UPDATE ON platform.knowledge_citations
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_knowledge_citations_reject_update ON platform.knowledge_citations IS
'Rejects all UPDATE attempts on append-only Knowledge Citation records.';

DROP TRIGGER IF EXISTS trg_knowledge_citations_reject_delete ON platform.knowledge_citations;
CREATE TRIGGER trg_knowledge_citations_reject_delete
  BEFORE DELETE ON platform.knowledge_citations
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_knowledge_citations_reject_delete ON platform.knowledge_citations IS
'Rejects all DELETE attempts on append-only Knowledge Citation records.';

ALTER TABLE platform.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.knowledge_citations ENABLE ROW LEVEL SECURITY;

COMMIT;
