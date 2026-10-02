// Shared helpers so every page lists projects the same way.
import { getCollection } from 'astro:content';

/** All non-draft projects, lowest `order` number first. */
export async function getProjects() {
  const all = await getCollection('projects', (p) => !p.data.draft);
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** "IN FLIGHT" -> "in-flight" (used as a CSS class for the status tag). */
export const tagClass = (status: string) => status.toLowerCase().replace(' ', '-');

/** All non-draft activities, lowest `order` first. */
export async function getActivities() {
  const all = await getCollection('activities', (a) => !a.data.draft);
  return all.sort((a, b) => a.data.order - b.data.order);
}
