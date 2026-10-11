"use client";

import { useEffect } from "react";

const blockSelector =
  '[data-render-block="mermaid"], [data-render-block="youtube"], [data-render-block="hf-demo"]';

function enhanceYouTube(block: HTMLElement): void {
  const videoId = block.dataset.videoId;
  if (!videoId || !/^[A-Za-z0-9_-]{6,15}$/.test(videoId)) return;
  const title = block.dataset.title || "YouTube video";
  const start = block.dataset.startSeconds;
  const query = start && /^\d+$/.test(start) ? `?start=${start}` : "";
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}${query}`;
  iframe.title = title;
  iframe.loading = "lazy";
  iframe.allow =
    "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allowFullscreen = true;
  block.replaceChildren(iframe);
  block.dataset.enhanced = "true";
}

function enhanceHuggingFace(block: HTMLElement): void {
  const space = block.dataset.space;
  if (!space || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(space)) return;
  const iframe = document.createElement("iframe");
  iframe.src = `https://${space.replace("/", "-").toLowerCase()}.hf.space`;
  iframe.title = block.dataset.title || `${space} demo`;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer";
  iframe.setAttribute("sandbox", "allow-forms allow-same-origin allow-scripts");
  block.replaceChildren(iframe);
  block.dataset.enhanced = "true";
}

export function DocumentEnhancer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-compiled-document]");
    if (!root) return;
    const blocks = [...root.querySelectorAll<HTMLElement>(blockSelector)].filter(
      (block) => block.dataset.enhanced !== "true",
    );
    for (const block of blocks) {
      if (block.dataset.renderBlock === "youtube") enhanceYouTube(block);
      if (block.dataset.renderBlock === "hf-demo") enhanceHuggingFace(block);
    }
    const diagrams = blocks.filter((block) => block.dataset.renderBlock === "mermaid");
    if (diagrams.length === 0) return;
    let cancelled = false;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark" });
      for (const [index, block] of diagrams.entries()) {
        if (cancelled) return;
        const source = block.textContent?.trim();
        if (!source) continue;
        try {
          const { svg, bindFunctions } = await mermaid.render(
            `archive-mermaid-${index}-${Math.random().toString(36).slice(2)}`,
            source,
          );
          if (cancelled) return;
          block.innerHTML = svg;
          bindFunctions?.(block);
          block.dataset.enhanced = "true";
        } catch {
          block.classList.add("render-block-error");
          block.setAttribute("role", "img");
          block.setAttribute("aria-label", "Diagram source could not be rendered");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
