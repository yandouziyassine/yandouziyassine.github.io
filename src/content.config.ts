import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(["cv", "software"]),          // CV library project or other software project
    number: z.string().optional(),              // "05" for CV library projects
    area: z.string(),
    depth: z.number().int().min(1).max(3).optional(),
    featured: z.boolean().default(false),
    order: z.number().default(100),
    metric: z.object({ value: z.string(), unit: z.string() }).optional(),
    summary: z.string(),
    stack: z.array(z.string()).default([]),
    cover: z.string().optional(),               // path under /public, e.g. /images/cv-13.png
    links: z.object({
      code: z.string().url().optional(),
      demo: z.string().optional(), // absolute URL or a site path like /demos/
      huggingface: z.string().url().optional(),
    }).default({}),
  }),
});

export const collections = { projects };
