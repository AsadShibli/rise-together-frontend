import type { FormEvent } from "react";
import type { AdminTemplate, CostLog, ReviewRow } from "./posterTypes";

// Counts and the newest Gemini attempt. The page still loads these.
type Usage = {
  posters: number;
  blocked: number;
  flagged: number;
  templates: number;
  lastLog: CostLog | null;
};

// The click actions stay in page.tsx. This file only draws the admin block.
type AdminPanelProps = {
  usage: Usage;
  adminTemplates: AdminTemplate[];
  review: ReviewRow[];
  createTemplate: (event: FormEvent<HTMLFormElement>) => void;
  setTemplateActive: (id: string, isActive: boolean) => void;
  deleteTemplate: (id: string) => void;
  setBlocked: (id: string, blocked: boolean) => void;
  setFlagged: (id: string, flagged: boolean) => void;
  setClean: (id: string, clean: boolean) => void;
};

export default function AdminPanel(props: AdminPanelProps) {
  const { usage, adminTemplates, review } = props;
  return (
    <section className="step">
      <h2>Admin</h2>
      <p>
        {usage.posters} posters, {usage.blocked} blocked, {usage.flagged} flagged, {usage.templates} templates
        {usage.lastLog
          ? ` ${usage.lastLog.geminiPromptUsed} ${usage.lastLog.success ? "ok" : "miss"} ${usage.lastLog.latencyMs}ms${typeof usage.lastLog.tokensUsed === "number" ? " " + usage.lastLog.tokensUsed + " tokens" : ""}`
          : ""}
      </p>
      <form onSubmit={props.createTemplate}>
        <input name="title" placeholder="template title" required />
        <input name="occasion" placeholder="occasion" required />
        <button type="submit">Create template</button>
      </form>
      <ul>
        {adminTemplates.map((row) => (
          <li key={row.id}>
            {row.title} — {row.occasionType}{" "}
            <button type="button" onClick={() => props.setTemplateActive(row.id, !row.isActive)}>
              {row.isActive ? "Hide" : "Show"}
            </button>{" "}
            <button type="button" onClick={() => props.deleteTemplate(row.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <ul>
        {review.map((row) => (
          <li key={row.id}>
            {row.status} {row.formData?.name ?? ""} {row.formData?.headline ?? ""}{" "}
            <button type="button" onClick={() => props.setBlocked(row.id, !row.blocked)}>
              {row.blocked ? "Unblock" : "Block"}
            </button>{" "}
            <button type="button" onClick={() => props.setFlagged(row.id, !row.flagged)}>
              {row.flagged ? "Unflag" : "Flag"}
            </button>{" "}
            <button type="button" onClick={() => props.setClean(row.id, !row.clean)}>
              {row.clean ? "Watermark" : "Clean"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
