import { createHash, randomUUID } from "node:crypto";

const hash = (source) => createHash("sha256").update(source, "utf8").digest("hex");
const supportedLocales = new Set(["ko", "en", "ja", "zh", "es", "fr", "de"]);

/** Copy only: original Post/Tag/TagOnPost rows remain intact. Nothing is auto-published. */
export async function importLegacy(client) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('archive:legacy-import',0))");
    const posts = (
      await client.query('SELECT to_jsonb(p) AS item FROM public."Post" p ORDER BY id')
    ).rows;
    const tagRows = (
      await client.query('SELECT to_jsonb(t) AS item FROM public."Tag" t ORDER BY id')
    ).rows;
    const links = (
      await client.query('SELECT to_jsonb(t) AS item FROM public."TagOnPost" t ORDER BY id')
    ).rows;
    const tagMap = new Map();
    for (const { item: tag } of tagRows) {
      const stableKey = `legacy-${hash(String(tag.id)).slice(0, 32)}`;
      const inserted = (
        await client.query(
          `INSERT INTO public.tags(stable_key,created_at) VALUES($1,$2)
        ON CONFLICT(stable_key) DO UPDATE SET stable_key=EXCLUDED.stable_key RETURNING id`,
          [stableKey, tag.createdAt],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO public.tag_labels(tag_id,locale,label) VALUES($1,'ko',$2)
        ON CONFLICT DO NOTHING`,
        [inserted.id, `${tag.emoji} ${tag.label}`],
      );
      tagMap.set(tag.id, inserted.id);
    }
    let imported = 0;
    let skipped = 0;
    for (const { item: post } of posts) {
      if (
        typeof post.id !== "string" ||
        typeof post.contentMd !== "string" ||
        typeof post.title !== "string"
      )
        throw new Error("UNSUPPORTED_LEGACY_POST_SHAPE");
      const canonicalKey = `legacy/${post.id}`;
      const sourceHash = hash(post.contentMd);
      const existing = (
        await client.query(
          `SELECT c.id,l.source_hash FROM public.contents c
        JOIN public.content_revisions r ON r.content_id=c.id AND r.revision_number=1
        JOIN public.localized_revisions l ON l.revision_id=r.id WHERE c.canonical_key=$1`,
          [canonicalKey],
        )
      ).rows;
      if (existing.length) {
        if (existing[0].source_hash !== sourceHash)
          throw new Error("LEGACY_SOURCE_CHANGED_REVIEW_REQUIRED");
        skipped += 1;
        continue;
      }
      const contentId = randomUUID();
      const revisionId = randomUUID();
      const localizedId = randomUUID();
      const language = String(post.language ?? "ko")
        .toLowerCase()
        .split(/[-_]/)[0];
      const locale = supportedLocales.has(language) ? language : "ko";
      const kind =
        post.category === "projects" ? "PROJECT" : post.category === "vlogs" ? "LOG_ENTRY" : "DOC";
      const slug =
        typeof post.slug === "string" && post.slug.length <= 240 ? post.slug : `legacy-${post.id}`;
      const legacyTags = links
        .filter(({ item }) => item.postId === post.id)
        .map(({ item }) => tagRows.find(({ item: tag }) => tag.id === item.tagId)?.item)
        .filter(Boolean);
      await client.query(
        `INSERT INTO public.contents(id,kind,canonical_key,visibility,created_at,updated_at)
        VALUES($1,$2,$3,'PRIVATE',$4,$5)`,
        [contentId, kind, canonicalKey, post.createdAt, post.updatedAt],
      );
      await client.query(
        `INSERT INTO public.content_revisions(id,content_id,revision_number,status,metadata,created_at)
        VALUES($1,$2,1,'DRAFT',$3,$4)`,
        [
          revisionId,
          contentId,
          JSON.stringify({
            legacy: { table: "Post", post, tags: legacyTags },
            importedAsDraft: true,
          }),
          post.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO public.localized_revisions(id,revision_id,locale,title,description,slug,source_markdown,source_hash,frontmatter,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          localizedId,
          revisionId,
          locale,
          post.title,
          post.description,
          slug,
          post.contentMd,
          sourceHash,
          JSON.stringify({
            subtitle: post.subtitle,
            coverUrl: post.coverUrl,
            legacyCategory: post.category,
          }),
          post.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO public.revision_status_events(revision_id,to_status,note) VALUES($1,'DRAFT','Preserved legacy import; review before publication')`,
        [revisionId],
      );
      await client.query(
        `INSERT INTO public.translation_status_events(localized_revision_id,to_status) VALUES($1,'DRAFT')`,
        [localizedId],
      );
      await client.query(`INSERT INTO public.jobs(type,payload) VALUES('COMPILE_DOCUMENT',$1)`, [
        JSON.stringify({ localizedRevisionId: localizedId, compilerVersion: "content-engine-v1" }),
      ]);
      for (const { item: link } of links.filter(({ item }) => item.postId === post.id)) {
        if (!tagMap.has(link.tagId)) throw new Error("LEGACY_TAG_LINK_MISSING");
        await client.query(`INSERT INTO public.content_tags(content_id,tag_id) VALUES($1,$2)`, [
          contentId,
          tagMap.get(link.tagId),
        ]);
      }
      const copied = (
        await client.query(
          "SELECT source_markdown,source_hash FROM public.localized_revisions WHERE id=$1",
          [localizedId],
        )
      ).rows[0];
      if (copied.source_markdown !== post.contentMd || copied.source_hash !== sourceHash)
        throw new Error("LEGACY_COPY_VERIFICATION_FAILED");
      imported += 1;
    }
    await client.query("COMMIT");
    return {
      imported,
      skipped,
      legacyPosts: posts.length,
      legacyTags: tagRows.length,
      legacyLinks: links.length,
      originalsDeleted: false,
      autoPublished: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
