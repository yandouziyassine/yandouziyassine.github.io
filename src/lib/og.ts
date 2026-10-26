// Open Graph preview cards (1200x630): what LinkedIn, Slack and others show when a page is shared.
// src/pages/og/[...slug].astro renders one HTML card per entry; scripts/build-og.mjs screenshots them to
// dist/og/<slug>.jpg and removes the HTML. Base.astro points og:image at the card for the current page.
import type { CollectionEntry } from "astro:content";

export interface OgCard { slug: string; eyebrow: string; title: string; metric?: { value: string; unit: string }; sub?: string; image?: string; }

/** Page path ("/", "/projects/x/") -> card slug ("home", "projects/x"). Pages without a card share the home card. */
export function ogSlug(pathname: string, known: Set<string>): string {
  const slug = pathname.replace(/^\/+|\/+$/g, "") || "home";
  return known.has(slug) ? slug : "home";
}

export function ogCards(projects: CollectionEntry<"projects">[]): OgCard[] {
  const cv = projects.filter((p) => p.data.kind === "cv").length;
  const cover = (id: string) => projects.find((p) => p.id === id)?.data.cover;
  return [
    { slug: "home", eyebrow: "Computer vision · ML · uOttawa", title: "I build computer vision you can try.",
      metric: { value: String(cv), unit: "measured projects · 2 live demos" },
      image: "/images/cv-01.svg" },
    { slug: "demos", eyebrow: "Live demos", title: "Computer vision running in your browser",
      sub: "Virtual painter (webcam hand tracking) · Hard-hat safety check (YOLO11n)", image: "/images/cv-01.svg" },
    { slug: "projects", eyebrow: "Projects", title: `${projects.length} projects, each with its benchmark number`,
      sub: "Classical CV · detection · segmentation · 3D · foundation models · software" },
    { slug: "resume", eyebrow: "Resume", title: "Computer engineering student, uOttawa",
      sub: "Open to computer vision and ML internships · PDF available" },
    { slug: "contact", eyebrow: "Contact", title: "Let's talk computer vision", sub: "LinkedIn · GitHub" },
    ...projects.map((p) => ({
      slug: `projects/${p.id}`,
      eyebrow: [p.data.number && `Project ${p.data.number}`, p.data.area].filter(Boolean).join(" · "),
      title: p.data.title,
      metric: p.data.metric,
      sub: p.data.metric ? undefined : p.data.summary,
      image: p.data.cover,
    })),
  ];
}
