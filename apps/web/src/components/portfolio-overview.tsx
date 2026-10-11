import type { Locale } from "@archive/contracts";
import Image from "next/image";
import Link from "next/link";
import { siteCopy } from "@/lib/site-copy";
import { ProjectArt } from "./project-art";

const projects = [
  {
    name: "Uni-HAR",
    repo: "uni-har",
    area: "Perception",
    ko: "움직임을 이해하는 멀티모달 행동 인식.",
    en: "Multimodal recognition of human movement.",
  },
  {
    name: "Pragmatic Agent",
    repo: "pragmatic-agent",
    area: "Retrieval",
    ko: "검색에서 근거 있는 답변까지.",
    en: "From retrieval to source-grounded answers.",
  },
  {
    name: "CWIE",
    repo: "cwie",
    area: "Interaction",
    ko: "언어와 상태가 만나는 상호작용 엔진.",
    en: "An interaction engine where language meets state.",
  },
  {
    name: "ATC",
    repo: "atc",
    area: "Action",
    ko: "규칙과 학습을 연결하는 게임 AI.",
    en: "Game AI connecting rules and learning.",
  },
] as const;

function WorldStudy() {
  const levels = [28, 56, 40, 76, 36, 100, 64, 44, 82];
  return (
    <svg className="world-study" viewBox="0 0 620 380" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="world-light"
          x1="130"
          y1="40"
          x2="510"
          y2="340"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ecc4b9" />
          <stop offset="1" stopColor="#8c8aa8" />
        </linearGradient>
        <radialGradient id="world-glow">
          <stop stopColor="#c8a09c" stopOpacity=".17" />
          <stop offset="1" stopColor="#c8a09c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="310" cy="223" rx="280" ry="152" fill="url(#world-glow)" />
      <g className="world-grid" stroke="#777683" strokeWidth=".6" opacity=".35">
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <path d={"M" + (116 + i * 24) + " " + (168 - i * 13) + "l240 132"} />
            <path d={"M" + (116 + i * 30) + " " + (168 + i * 16.5) + "l192 -104"} />
          </g>
        ))}
      </g>
      <g className="world-architecture" stroke="url(#world-light)" strokeWidth="1.1">
        {levels.map((height, index) => {
          const row = Math.floor(index / 3);
          const column = index % 3;
          const x = 218 + column * 54 - row * 40;
          const y = 169 + column * 29 + row * 23;
          return (
            <g key={index}>
              <path
                d={"M" + x + " " + (y - height) + "l36 -19 36 19 -36 19 -36 -19Z"}
                fill="#282833"
                fillOpacity=".82"
              />
              <path
                d={
                  "M" +
                  x +
                  " " +
                  (y - height) +
                  "v" +
                  height +
                  "l36 19 36 -19v-" +
                  height +
                  "M" +
                  (x + 36) +
                  " " +
                  (y - height + 19) +
                  "v" +
                  height +
                  "M" +
                  x +
                  " " +
                  y +
                  "l36 -19 36 19"
                }
              />
              <circle cx={x + 36} cy={y - height - 1} r="2.7" fill="#e9b8a5" stroke="none" />
            </g>
          );
        })}
      </g>
      <path
        className="world-orbit"
        d="M132 263c11 40 172 39 287-23s118-119 57-130"
        stroke="#c8a09c"
        strokeOpacity=".6"
        strokeDasharray="3 6"
      />
      <circle cx="474" cy="110" r="4" fill="#ecc4b9" />
    </svg>
  );
}

export function ProfileIntro({ locale }: { locale: Locale }) {
  const copy = siteCopy(locale);
  return (
    <aside className="profile-panel" aria-label={copy.profile}>
      <Image
        src="/brand/signature.png"
        alt={locale === "ko" ? "민재의 서명" : "Minjae’s signature"}
        width={100}
        height={100}
        unoptimized
      />
      <p className="eyebrow">Minjae / m97j</p>
      <h2>{copy.profile}</h2>
      <p>{copy.profileText}</p>
      <ul>
        {copy.profileTopics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>
      <div className="profile-links">
        <a href="https://github.com/m97j">
          GitHub <span aria-hidden="true">↗</span>
        </a>
        <a href="https://huggingface.co/m97j">
          Hugging Face <span aria-hidden="true">↗</span>
        </a>
      </div>
    </aside>
  );
}

export function SelectedProjects({
  locale,
  compact = false,
}: {
  locale: Locale;
  compact?: boolean;
}) {
  const copy = siteCopy(locale);
  const visibleProjects = compact ? projects.slice(0, 2) : projects;
  return (
    <section
      className="selected-projects"
      id="selected-projects"
      aria-labelledby="projects-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.projectsEyebrow}</p>
          <h2 id="projects-heading">{copy.projects}</h2>
        </div>
        {compact ? (
          <Link className="text-link" href={"/" + locale + "/spaces/work"}>
            {locale === "ko" ? "모든 작업" : "All work"} <span aria-hidden="true">↗</span>
          </Link>
        ) : null}
      </div>
      <div className={"project-gallery" + (compact ? " is-compact" : "")}>
        <article className="lead-project">
          <div className="lead-art">
            <WorldStudy />
            <span className="art-label">A STUDY OF WORLDS</span>
          </div>
          <div className="lead-copy">
            <div className="content-meta">
              <span>{copy.lead}</span>
              <span>01</span>
            </div>
            <h3>
              <a href="https://github.com/m97j/axiom-world">
                Axiom World <span aria-hidden="true">↗</span>
              </a>
            </h3>
            <p>
              {compact
                ? locale === "ko"
                  ? "규칙과 행동 사이, 지능을 탐구하는 실험."
                  : "Intelligence, between rules and action."
                : copy.leadDescription}
            </p>
            {!compact ? (
              <div className="project-links">
                <a href="https://github.com/m97j/axiom-world/blob/main/docs/reports/v1/axiom-world-tech-report-v1.md">
                  {copy.report} ↗
                </a>
                <a href="https://huggingface.co/collections/m97j/axiom-world">{copy.models} ↗</a>
              </div>
            ) : null}
          </div>
        </article>
        <div className="project-grid" aria-label={copy.supporting}>
          {visibleProjects.map((project) => (
            <article className="project-card" key={project.repo}>
              <div className="project-picture" aria-hidden="true">
                <ProjectArt area={project.area} />
                <span className="picture-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
              <div className="project-caption">
                <span className="eyebrow">{project.area}</span>
                <h3>
                  <a href={"https://github.com/m97j/" + project.repo}>
                    {project.name} <span aria-hidden="true">↗</span>
                  </a>
                </h3>
                {!compact ? <p>{locale === "ko" ? project.ko : project.en}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      {compact ? (
        <nav className="project-directory" aria-label={copy.supporting}>
          <span>{locale === "ko" ? "더 살펴보기" : "Also exploring"}</span>
          {projects.slice(2).map((project) => (
            <a key={project.repo} href={"https://github.com/m97j/" + project.repo}>
              {project.name} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
