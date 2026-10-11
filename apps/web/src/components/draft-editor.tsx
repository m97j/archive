"use client";

import {
  CONTENT_KINDS,
  LOCALES,
  VISIBILITY_STATES,
  type Locale,
  type MediaUploadTicket,
  type AdminContentSummary,
  type AdminDraft,
} from "@archive/contracts";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { createDraftAction, type DraftActionState } from "@/app/[locale]/admin/actions";

const initialState: DraftActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="editor-submit" type="submit" disabled={pending}>
      {pending ? "Creating draft…" : "Create draft"}
    </button>
  );
}

export function DraftEditor({
  locale,
  content,
  draft,
}: {
  locale: Locale;
  content?: AdminContentSummary;
  draft?: AdminDraft;
}) {
  const [state, action] = useActionState(createDraftAction, initialState);
  const markdown = useRef<HTMLTextAreaElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<string>();

  const uploadMedia = async () => {
    const file = media.current?.files?.[0];
    if (!file) return setUploadStatus("Choose an image first.");
    setUploadStatus("Preparing upload…");
    try {
      const ticketResponse = await fetch("/api/admin/media-uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      if (!ticketResponse.ok) throw new Error("ticket");
      const ticket = (await ticketResponse.json()) as MediaUploadTicket;
      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("upload");

      const field = markdown.current;
      if (field) {
        const insertion = `\n![${file.name.replace(/\.[^.]+$/, "")}](${ticket.publicUrl})\n`;
        const start = field.selectionStart;
        field.setRangeText(insertion, start, field.selectionEnd, "end");
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      }
      if (media.current) media.current.value = "";
      setUploadStatus("Uploaded and inserted into Markdown.");
    } catch {
      setUploadStatus("Image upload failed. Check R2 configuration and CORS.");
    }
  };
  return (
    <form className="draft-editor" action={action}>
      {content ? <input type="hidden" name="contentId" value={content.id} /> : null}
      {draft ? <input type="hidden" name="sourceRevisionId" value={draft.revisionId} /> : null}
      <div className="editor-fields">
        <label>
          <span>Canonical key</span>
          <input
            name="canonicalKey"
            required
            pattern="[a-z0-9][a-z0-9._/-]*"
            placeholder="research.retrieval-evaluation"
            defaultValue={content?.canonicalKey}
            readOnly={Boolean(content)}
          />
        </label>
        <div className="editor-row">
          <label>
            <span>Kind</span>
            <select name="kind" defaultValue={content?.kind ?? "DOC"} disabled={Boolean(content)}>
              {CONTENT_KINDS.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select
              name="visibility"
              defaultValue={content?.visibility ?? "PRIVATE"}
              disabled={Boolean(content)}
            >
              {VISIBILITY_STATES.map((visibility) => (
                <option key={visibility}>{visibility}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Locale</span>
            <select name="locale" defaultValue={locale}>
              {LOCALES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>Title</span>
          <input
            name="title"
            required
            maxLength={500}
            placeholder="Transparent retrieval evaluation"
            defaultValue={draft?.title}
          />
        </label>
        <label>
          <span>Description</span>
          <textarea
            name="description"
            rows={2}
            maxLength={2000}
            defaultValue={draft?.description}
          />
        </label>
        <label>
          <span>Slug</span>
          <input
            name="slug"
            required
            maxLength={240}
            placeholder="research/transparent-retrieval-evaluation"
            defaultValue={draft?.slug}
          />
        </label>
        <label>
          <span>Change summary</span>
          <input name="changeSummary" maxLength={2000} placeholder="Initial draft" />
        </label>
      </div>
      <label className="markdown-field">
        <span>Markdown source</span>
        <span className="media-upload">
          <input
            ref={media}
            type="file"
            accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
          />
          <button type="button" onClick={uploadMedia}>
            Upload image to R2
          </button>
          <small aria-live="polite">{uploadStatus}</small>
        </span>
        <textarea
          ref={markdown}
          name="sourceMarkdown"
          required
          spellCheck
          defaultValue={
            draft?.sourceMarkdown ??
            `---\ntitle: New record\nlocale: ${locale}\n---\n\n# New record\n\nWrite the claim, evidence, and open questions here.\n`
          }
        />
      </label>
      <div className="editor-footer">
        <p className={`editor-message ${state.status}`} role="status">
          {state.message ?? "The draft stays private until review and publication."}
        </p>
        <SubmitButton />
      </div>
      {state.status === "success" ? (
        <dl className="draft-result">
          <div>
            <dt>Content</dt>
            <dd>{state.contentId}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{state.revisionId}</dd>
          </div>
        </dl>
      ) : null}
    </form>
  );
}
