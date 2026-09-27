import { useState, type FormEvent } from "react";
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
  updateTemplate: (event: FormEvent<HTMLFormElement>, id: string) => Promise<boolean>;
  setTemplateActive: (id: string, isActive: boolean) => void;
  deleteTemplate: (id: string) => void;
  setBlocked: (id: string, blocked: boolean) => void;
  setFlagged: (id: string, flagged: boolean) => void;
  setClean: (id: string, clean: boolean) => void;
};

export default function AdminPanel(props: AdminPanelProps) {
  const { usage, adminTemplates, review } = props;
  // Which of the three admin parts is open. They used to sit in one long column.
  const [part, setPart] = useState("usage");
  // Review page. 0 is the first page of posters.
  const [page, setPage] = useState(0);
  // How many review rows one page shows.
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.max(1, Math.ceil(review.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shownReview = review.slice(safePage * pageSize, safePage * pageSize + pageSize);
  // Template list page. Separate from the review page so the two lists do not share a place.
  const [templatePage, setTemplatePage] = useState(0);
  const [templatePageSize, setTemplatePageSize] = useState(10);
  const templatePageCount = Math.max(1, Math.ceil(adminTemplates.length / templatePageSize));
  const safeTemplatePage = Math.min(templatePage, templatePageCount - 1);
  const shownTemplates = adminTemplates.slice(
    safeTemplatePage * templatePageSize,
    safeTemplatePage * templatePageSize + templatePageSize,
  );
  // A new template cannot be created here. People choose a seeded design, so this form stays off.
  // const [making, setMaking] = useState(false);
  // Which design row is showing the edit form.
  const [editingId, setEditingId] = useState("");
  return (
    <section className="step">
      <h2>Admin</h2>
      <nav className="tabs" aria-label="Admin sections">
        <button type="button" className={part === "usage" ? "on" : ""} onClick={() => setPart("usage")}>Usage</button>
        <button type="button" className={part === "templates" ? "on" : ""} onClick={() => setPart("templates")}>Templates</button>
        <button type="button" className={part === "review" ? "on" : ""} onClick={() => setPart("review")}>Review</button>
      </nav>
      {part === "usage" ? (
      <div className="admin-block">
        <h3>Usage</h3>
        <p>How many posters and designs exist.</p>
        <div className="admin-counts">
          <span>{usage.posters} posters</span>
          <span>{usage.blocked} blocked</span>
          <span>{usage.flagged} flagged</span>
          <span>{usage.templates} templates</span>
        </div>
        {/* The requirement asks for these counts, not a Gemini worked or failed line, so this stays off.
        {usage.lastLog ? (
          <p>
            Newest poster build: Gemini's color suggestion worked or failed. This is the latest poster anyone built, not an admin action.
          </p>
        ) : null}
        */}
      </div>
      ) : null}
      {part === "templates" ? (
      <div className="admin-block">
        <h3>Templates</h3>
        <p>A design people can choose. Hide takes it off that list.</p>
        <p>A new template cannot be created. People choose an existing design.</p>
        {/* New design stayed off because a person does not invent an occasion. The seeded list is the library.
        <button type="button" onClick={() => setMaking((open) => !open)}>New design</button>
        {making ? (
          <form onSubmit={props.createTemplate}>
            <label>
              Design name
              <input name="title" placeholder="Design name" required />
            </label>
            <label>
              Occasion
              <input name="occasion" placeholder="Occasion" required />
            </label>
            <button type="submit">Add design</button>
          </form>
        ) : null}
        */}
        {adminTemplates.length === 0 ? <p>No designs yet.</p> : (
          <div className="poster-tools">
            <label className="poster-search">
              Per page
              <select
                value={templatePageSize}
                onChange={(event) => {
                  setTemplatePageSize(Number(event.target.value));
                  setTemplatePage(0);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button type="button" disabled={safeTemplatePage === 0} onClick={() => setTemplatePage(safeTemplatePage - 1)}>Previous</button>
            <button type="button" disabled={safeTemplatePage + 1 >= templatePageCount} onClick={() => setTemplatePage(safeTemplatePage + 1)}>Next</button>
          </div>
        )}
        {adminTemplates.length === 0 ? null : <p className="poster-count">Page {safeTemplatePage + 1} of {templatePageCount}</p>}
        <ul>
          {shownTemplates.map((row) => (
            <li key={row.id}>
              {/* The old line was "title. occasion. On the list." The state is its own word now. */}
              <span className="admin-main">
                <strong>{row.title}</strong>
                <span className="admin-meta">{row.occasionType}</span>
                <span className="admin-state">{row.isActive ? "On the list" : "Hidden"}</span>
              </span>
              <span className="admin-actions">
                <button type="button" onClick={() => setEditingId(editingId === row.id ? "" : row.id)}>
                  Edit
                </button>
                <button type="button" onClick={() => props.setTemplateActive(row.id, !row.isActive)}>
                  {row.isActive ? "Hide" : "Show"}
                </button>
                <button type="button" onClick={() => props.deleteTemplate(row.id)}>
                  Delete
                </button>
              </span>
              {editingId === row.id ? (
                <form
                  className="admin-edit"
                  onSubmit={async (event) => {
                    const ok = await props.updateTemplate(event, row.id);
                    if (ok) setEditingId("");
                  }}
                >
                  <label>
                    Design name
                    <input name="title" defaultValue={row.title} required />
                  </label>
                  <label>
                    Occasion
                    <input name="occasion" defaultValue={row.occasionType} required />
                  </label>
                  <label>
                    Photos
                    <select name="photoSlots" defaultValue={row.layoutConfig?.photoSlots ?? 1}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </label>
                  <label>
                    First color
                    <input name="color1" defaultValue={row.layoutConfig?.colors?.[0] ?? "#006A4E"} required />
                  </label>
                  <label>
                    Second color
                    <input name="color2" defaultValue={row.layoutConfig?.colors?.[1] ?? "#F42A41"} required />
                  </label>
                  <button type="submit">Save design</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      ) : null}
      {part === "review" ? (
      <div className="admin-block">
        <h3>Review</h3>
        {/* "Stop a poster, mark it, or take the watermark off." is the three lines below. */}
        <div className="admin-help">
          <p><strong>Watermark.</strong> The word নমুনা across the picture. Remove watermark drops it on the next rebuild. The picture already saved stays until then.</p>
          <p><strong>Flag.</strong> Marks the poster so you can find it. The person can still rebuild it.</p>
          <p><strong>Block.</strong> Stops a new picture. The picture already saved stays.</p>
        </div>
        {review.length === 0 ? <p>No posters to review.</p> : (
          <div className="poster-tools">
            <label className="poster-search">
              Per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button type="button" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
        {review.length === 0 ? null : <p className="poster-count">Page {safePage + 1} of {pageCount}</p>}
        <ul>
          {shownReview.map((row) => (
            <li key={row.id}>
              {/* The old line was "name. status." Blocked, flagged, and watermark sit beside the name. */}
              <span className="admin-main">
                {row.generatedImageUrl ? (
                  <img className="admin-thumb" src={row.generatedImageUrl} alt="" />
                ) : (
                  <span className="admin-meta">No picture yet</span>
                )}
                <strong>{row.formData?.name || "No name"}</strong>
                <span className="admin-meta">{row.status}</span>
                {row.blocked ? <span className="admin-state">Blocked</span> : null}
                {row.flagged ? <span className="admin-state">Flagged</span> : null}
                <span className="admin-state">{row.clean ? "No watermark" : "Watermark"}</span>
              </span>
              <span className="admin-actions">
                <button type="button" onClick={() => props.setBlocked(row.id, !row.blocked)}>
                  {row.blocked ? "Unblock" : "Block"}
                </button>
                <button type="button" onClick={() => props.setFlagged(row.id, !row.flagged)}>
                  {row.flagged ? "Unflag" : "Flag"}
                </button>
                <button type="button" onClick={() => props.setClean(row.id, !row.clean)}>
                  {row.clean ? "Add watermark" : "Remove watermark"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      ) : null}
    </section>
  );
}
