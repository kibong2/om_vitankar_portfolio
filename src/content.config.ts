// Defines the shape of every content file, so a typo in a project file
// (e.g. status: "LANDDED") shows up as a clear error instead of a broken page.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per project in src/content/projects/
const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    flight: z.string().optional(), // code shown on the departure board, e.g. "OV101"
    category: z.enum(['Aerospace', 'Builds', 'Code']),
    status: z.enum(['BOARDING', 'IN FLIGHT', 'LANDED', 'DIVERTED']),
    date: z.coerce.date(),
    tools: z.array(z.string()).default([]),
    summary: z.string(),
    cover: z.string().optional(), // path under public/, e.g. /images/my-project/cover.jpg
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    featured: z.boolean().default(false), // true = shows on the homepage departure board
    order: z.number().default(100), // lower number = higher up
    draft: z.boolean().default(false), // true = hidden from the site
    demo: z.enum(['airfoil']).optional(), // shows an interactive 3D demo on the project page
  }),
});

// One Markdown file per activity in src/content/activities/.
// `tagline` is the one-liner on the homepage; the body is the long write-up on /activities/.
const activities = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/activities' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    period: z.string().default(''), // e.g. "2024 - now"
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

// Small content files: about, activities, skills, contact (src/content/site/)
const site = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/site' }),
  schema: z
    .object({
      title: z.string().optional(),
      items: z.array(z.string()).optional(), // lists (skills, activities)
    })
    .passthrough(), // allow extra fields such as email / github / linkedin
});

export const collections = { projects, activities, site };
