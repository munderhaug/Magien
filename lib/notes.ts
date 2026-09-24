/** Notater fra crew per post og fag. Nøkkel: `${postId}:${fag}`. */
export type NoteDept = "lyd" | "lys" | "av" | "regi";
export const NOTE_DEPTS: { id: NoteDept; label: string }[] = [
  { id: "lyd", label: "Lyd" },
  { id: "lys", label: "Lys" },
  { id: "av", label: "AV" },
  { id: "regi", label: "Regi" },
];
export type Note = { text: string; by: string; at: number };
export type Notes = Record<string, Note>;

export const noteKey = (id: string, dept: NoteDept) => `${id}:${dept}`;
export const isNoteDept = (d: unknown): d is NoteDept => NOTE_DEPTS.some((x) => x.id === d);
