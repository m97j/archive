import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PageError from "../../src/app/[locale]/error";
import { DocumentToc } from "../../src/components/document-toc";
import { CatalogNotice } from "../../src/components/catalog-notice";
import { SelectedProjects } from "../../src/components/portfolio-overview";
import { parseArchiveSearch, searchQuery } from "../../src/lib/archive-search";
import { siteCopy } from "../../src/lib/site-copy";

afterEach(cleanup);
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "ko" }) }));

describe("public archive interface", () => {
  it("re-fetches through the framework retry callback instead of just clearing error state", () => {
    const retry = vi.fn();
    render(<PageError retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("uses Korean labels without translating content identifiers", () => {
    expect(siteCopy("ko").spaces.RESEARCH).toBe("연구");
    expect(siteCopy("en").spaces.RESEARCH).toBe("Research");
    expect(parseArchiveSearch({ space: "research", kind: "DOC" })).toMatchObject({
      space: "RESEARCH",
      kind: "DOC",
    });
  });
  it("rejects invalid enums and array parameters and bounds query inputs", () => {
    expect(
      parseArchiveSearch({ space: "invalid", kind: "anything", q: ["one", "two"] }),
    ).toMatchObject({ space: undefined, kind: undefined, q: undefined });
    expect(parseArchiveSearch({ q: "x".repeat(201) }).q).toHaveLength(200);
  });
  it("retains filters when adding pagination or removing one filter", () => {
    const query = searchQuery({ q: "추론 & 계획", kind: "DOC", tag: undefined, cursor: "next" });
    expect(new URLSearchParams(query).get("q")).toBe("추론 & 계획");
    expect(new URLSearchParams(query).has("tag")).toBe(false);
    expect(new URLSearchParams(query).get("cursor")).toBe("next");
  });
  it("renders nested and encoded heading anchors without executing heading text", () => {
    render(
      <DocumentToc
        locale="ko"
        headings={[
          {
            id: "방법",
            depth: 2,
            text: "방법",
            children: [{ id: "a&b", depth: 3, text: "<script>unsafe</script>", children: [] }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "방법" })).toHaveAttribute(
      "href",
      "#%EB%B0%A9%EB%B2%95",
    );
    expect(screen.getByRole("link", { name: "<script>unsafe</script>" })).toHaveAttribute(
      "href",
      "#a%26b",
    );
    expect(document.querySelector("script")).toBeNull();
  });
  it("omits an empty table of contents", () => {
    const { container } = render(<DocumentToc locale="en" headings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("distinguishes an unavailable service from unreviewed writing", () => {
    const { rerender } = render(<CatalogNotice locale="ko" state="unavailable" />);
    expect(screen.getByText(siteCopy("ko").unavailable)).toBeInTheDocument();
    rerender(<CatalogNotice locale="ko" state="empty" />);
    expect(screen.getByText(siteCopy("ko").empty)).toBeInTheDocument();
    expect(screen.queryByText(siteCopy("ko").unavailable)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub 포트폴리오/ })).toHaveAttribute(
      "href",
      "https://github.com/m97j/archive/blob/main/docs/ko/README.md",
    );
  });
  it("keeps Axiom World as the lead and all four supporting repositories discoverable", () => {
    render(<SelectedProjects locale="ko" />);
    expect(screen.getByRole("link", { name: /Axiom World/ })).toHaveAttribute(
      "href",
      "https://github.com/m97j/axiom-world",
    );
    for (const name of ["Uni-HAR", "CWIE", "Pragmatic Agent", "ATC"])
      expect(screen.getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
  });
});
