import { load } from "js-yaml";
// ?raw inlines the file at build time (a path read at runtime breaks once Astro bundles the page).
import raw from "../data/resume.yaml?raw";

export interface Entry { points?: string[]; dates: string; [key: string]: unknown }
export interface Resume {
  name: string; headline: string; location: string;
  links: { label: string; url: string }[];
  education: (Entry & { school: string; degree: string; place: string; details: string })[];
  projects: (Entry & { name: string; stack: string })[];
  experience: (Entry & { role: string; org: string; place: string })[];
  skills: { group: string; items: string }[];
  languages: string;
}

export function loadResume(): Resume {
  return load(raw) as Resume;
}
