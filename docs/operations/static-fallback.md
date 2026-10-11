# Static fallback operations

The repository-backed portfolio in `docs/` is a continuity layer, not a second implementation of
the Archive application.

## Publishing

In the GitHub repository settings, select **Pages → Deploy from a branch → `main` → `/docs`**.
GitHub Pages then uses `docs/index.md` as the entry page. The Markdown files also remain readable
directly in the repository when Pages is disabled.

## How the pages are rendered

Branch-based GitHub Pages runs Jekyll over the selected `/docs` source. Jekyll converts Markdown
to static HTML and places that HTML inside the selected theme's `default` layout. In this
repository:

- `_config.yml` selects GitHub's supported Minimal theme and applies its layout to pages;
- YAML front matter at the top of a Markdown file supplies page metadata and optional permalinks;
- headings, lists, tables, code blocks, and links become ordinary static HTML; and
- no backend process, Python runtime, or client-side application is created.

The front matter resembles the metadata block in a Hugging Face Space README, but the fields and
runtime are unrelated. HF interprets fields such as `sdk` and `python_version` to configure a
Space. Jekyll interprets fields such as `layout`, `title`, and `permalink` only while generating a
static site.

Expected project-site routes for `m97j/archive` are:

| Source                                   | Public route                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `docs/index.md`                          | `https://m97j.github.io/archive/`                                    |
| `docs/ko/README.md`                      | `https://m97j.github.io/archive/ko/`                                 |
| `docs/en/README.md`                      | `https://m97j.github.io/archive/en/`                                 |
| `docs/ko/project-tags.md`                | `https://m97j.github.io/archive/ko/project-tags.html`                |
| `docs/architecture/platform-topology.md` | `https://m97j.github.io/archive/architecture/platform-topology.html` |

GitHub Pages does not automatically create a directory explorer, file list, application sidebar,
search box, breadcrumbs, or route menu from the source tree. The Minimal theme supplies the basic
responsive page shell and typography; navigation must be expressed as Markdown links or added
later with a custom Jekyll layout. The current fallback therefore includes explicit Home, locale,
and tag links and deliberately avoids JavaScript-dependent behavior.

## Scope

The fallback contains:

- a Korean and English professional summary;
- stable links to selected source repositories, model cards, and demos; and
- architecture and deployment records stored in this repository.

It intentionally excludes authentication, database-backed content, private drafts, search,
analytics, and runtime embeds. It is not a database or media backup.

## Maintenance

Review the fallback whenever a selected repository is renamed, archived, or materially changes
scope. Keep claims evidence-based, remove dead links, and update the review date in both locale
documents. Test the Pages URL after changing the Jekyll configuration.

If the primary application becomes unavailable, link the Pages URL from the GitHub profile and
relevant repository descriptions. A future custom domain can use a short DNS TTL and switch from
Vercel to Pages without changing the content layout.
