import "@testing-library/jest-dom/vitest";

import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentEnhancer } from "../../src/components/document-enhancer";

afterEach(() => {
  document.body.replaceChildren();
});

describe("DocumentEnhancer", () => {
  it("upgrades sanitized YouTube placeholders to privacy-enhanced embeds", async () => {
    document.body.innerHTML = `<div data-compiled-document><div data-render-block="youtube" data-video-id="dQw4w9WgXcQ" data-title="Demo"></div></div>`;
    render(createElement(DocumentEnhancer));

    await waitFor(() => expect(document.querySelector("iframe")).toBeInTheDocument());
    const iframe = document.querySelector("iframe");
    expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe).toHaveAttribute("title", "Demo");
  });

  it("sandboxes Hugging Face demo embeds", async () => {
    document.body.innerHTML = `<div data-compiled-document><div data-render-block="hf-demo" data-space="owner/demo"></div></div>`;
    render(createElement(DocumentEnhancer));

    await waitFor(() => expect(document.querySelector("iframe")).toBeInTheDocument());
    const iframe = document.querySelector("iframe");
    expect(iframe).toHaveAttribute("src", "https://owner-demo.hf.space");
    expect(iframe).toHaveAttribute("sandbox", "allow-forms allow-same-origin allow-scripts");
  });

  it("leaves invalid embed identifiers inert", () => {
    document.body.innerHTML = `<div data-compiled-document><div data-render-block="youtube" data-video-id="javascript:alert(1)"></div></div>`;
    render(createElement(DocumentEnhancer));
    expect(document.querySelector("iframe")).not.toBeInTheDocument();
  });
  it("makes wide tables keyboard focusable with a localized label", () => {
    document.body.innerHTML = `<div data-compiled-document><table><tbody><tr><td>cell</td></tr></tbody></table></div>`;
    render(createElement(DocumentEnhancer, { locale: "ko" }));
    expect(document.querySelector("table")).toHaveAttribute("tabindex", "0");
    expect(document.querySelector("table")).toHaveAttribute("aria-label", "가로 스크롤 가능한 표");
  });
});
