/**
 * The chapters announced on the landing but not shipped: labels only, no content (Kiroween ships one chapter). They are
 * shown as locked tiles on the Comix page. Numbers, not chapter ids: a real chapter lives in `chapters/`.
 */
export const ROADMAP_CHAPTER_NUMBERS: readonly number[] = [2, 3, 4, 5];

export const roadmapLabel = (n: number): string => `CHAPTER ${n}`;
