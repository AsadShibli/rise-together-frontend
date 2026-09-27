"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
// Template, PosterRow, ReviewRow, AdminTemplate, and CostLog now live in posterTypes.ts.
import type { AdminTemplate, CostLog, PosterRow, ReviewRow, Template } from "./posterTypes";
import AdminPanel from "./AdminPanel";
import { accountFrom } from "./accountFrom";

// Text fields stored on the poster. Photo fields follow the template slot count.
const fields = ["name", "designation", "party", "district", "headline"] as const;
// Words shown above those fields. The input names stay the same.
const fieldLabels: Record<(typeof fields)[number], string> = {
  name: "Name",
  designation: "Designation",
  party: "Party",
  district: "District",
  headline: "Headline",
};
// API address. Localhost when NEXT_PUBLIC_API_URL is unset.
const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// A template color is shown only when it is a # and six hex digits.
const hexColor = /^#[0-9A-Fa-f]{6}$/;

// One slot says "1 photo". Two or three say "2 photos" or "3 photos".
function photoLabel(slots?: number) {
  const count = Math.min(3, Math.max(1, slots ?? 1));
  return count === 1 ? "1 photo" : count + " photos";
}

// accountFrom now lives in accountFrom.ts. Email still wins over phone.

// Replaced the create-next-app starter page. That demo only linked to the Next.js docs.
// Lists templates, then saves a text draft for the one you click.
export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picked, setPicked] = useState<Template | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [posters, setPosters] = useState<PosterRow[]>([]);
  const [token, setToken] = useState("");
  // Empty until My posters finds an admin account.
  const [role, setRole] = useState("");
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [adminTemplates, setAdminTemplates] = useState<AdminTemplate[]>([]);
  const [usage, setUsage] = useState<{
    posters: number;
    blocked: number;
    flagged: number;
    templates: number;
    lastLog: CostLog | null;
  }>({ posters: 0, blocked: 0, flagged: 0, templates: 0, lastLog: null });
  const [busyId, setBusyId] = useState("");
  // Empty string means every occasion. A name shows only that occasion.
  const [occasion, setOccasion] = useState("");
  // The first persist run must not wipe a token saved by an earlier visit.
  const skipWipe = useRef(true);
  // False until this page has read the stored token. Then a missing token goes to /login.
  const [ready, setReady] = useState(false);
  // True while the profile menu on the top right is open.
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch(api + "/api/templates")
      .then((res) => res.json())
      .then((rows: Template[]) => setTemplates(rows))
      .catch(() => setError("Could not load templates"));
    const saved = sessionStorage.getItem("token") ?? "";
    if (saved) {
      setToken(saved);
      void restore(saved);
    }
    setReady(true);
  }, []);

  // A signed-out visit, including after Log out, opens the login page.
  useEffect(() => {
    if (!ready || token) return;
    router.replace("/login");
  }, [ready, token, router]);

  // Writes the token after login or register. Log out removes it.
  useEffect(() => {
    if (skipWipe.current) {
      skipWipe.current = false;
      return;
    }
    if (token) sessionStorage.setItem("token", token);
    else sessionStorage.removeItem("token");
  }, [token]);

  // Loads posters, and the admin lists when this token belongs to an admin.
  async function restore(authToken: string) {
    const listRes = await fetch(api + "/api/posters", {
      headers: { Authorization: "Bearer " + authToken },
    });
    const rows = await listRes.json();
    if (!listRes.ok) {
      sessionStorage.removeItem("token");
      setToken("");
      setError(rows.error ?? "could not load posters");
      return;
    }
    setPosters(rows);
    const meRes = await fetch(api + "/api/auth/me", {
      headers: { Authorization: "Bearer " + authToken },
    });
    const me = await meRes.json();
    if (!meRes.ok || me.role !== "admin") {
      setRole("");
      setReview([]);
      setAdminTemplates([]);
      setUsage({ posters: 0, blocked: 0, flagged: 0, templates: 0, lastLog: null });
      return;
    }
    setRole("admin");
    await loadAdmin(authToken);
  }

  // Uses the sign-in already on this page. Otherwise reads email or phone from the form.
  async function sessionToken(data: FormData) {
    if (token) return token;
    const loginRes = await fetch(api + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountFrom(data)),
    });
    const login = await loginRes.json();
    if (!loginRes.ok) {
      setError(login.error ?? "login failed");
      return "";
    }
    setToken(login.token);
    return login.token as string;
  }

  // Logs in and saves one draft per name. The images are not built yet.
  async function saveNameDrafts(form: HTMLFormElement, names: string[]) {
    setError("");
    setSaved("");
    const data = new FormData(form);
    const auth = await sessionToken(data);
    if (!auth) return;
    const bulkRes = await fetch(api + "/api/posters/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify({ templateId: picked?.id, names }),
    });
    const created = await bulkRes.json();
    if (!bulkRes.ok) {
      setError(created.error ?? "drafts failed");
      return;
    }
    setToken(auth);
    const listRes = await fetch(api + "/api/posters", {
      headers: { Authorization: "Bearer " + auth },
    });
    const rows = await listRes.json();
    if (!listRes.ok) {
      setError(rows.error ?? "could not load posters");
      return;
    }
    setPosters(rows);
    setSaved(created.length + " drafts");
  }

  // One name per line in the text box.
  async function makeDrafts(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const names = String(new FormData(form).get("names") ?? "")
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    await saveNameDrafts(form, names);
  }

  // First cell of each CSV row. A header named name is skipped.
  async function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.closest("form");
    if (!file || !form) return;
    const text = await file.text();
    let names = text
      .split(/\r?\n/)
      .map((line) => line.split(",")[0]?.trim() ?? "")
      .filter(Boolean);
    if (names[0]?.toLowerCase() === "name") names = names.slice(1);
    await saveNameDrafts(form, names);
  }

  // Logs in, saves the draft, then renders that poster to a PNG.
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    setImageUrl("");
    const data = new FormData(event.currentTarget);
    const auth = await sessionToken(data);
    if (!auth) return;

    // Empty file inputs are skipped, so a text-only draft still saves.
    const uploadedPhotoUrls: string[] = [];
    const files = data.getAll("photo").filter((file): file is File => file instanceof File && file.size > 0);
    for (const file of files) {
      const body = new FormData();
      body.append("photo", file);
      const uploadRes = await fetch(api + "/api/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + auth },
        body,
      });
      const uploaded = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploaded.error ?? "upload failed");
        return;
      }
      uploadedPhotoUrls.push(uploaded.url);
    }

    const formData: Record<string, string> = {};
    for (const key of fields) formData[key] = String(data.get(key) ?? "");
    formData.font = String(data.get("font") ?? "");
    const posterRes = await fetch(api + "/api/posters", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify({ templateId: picked?.id, formData, uploadedPhotoUrls }),
    });
    const poster = await posterRes.json();
    if (!posterRes.ok) {
      setError(poster.error ?? "save failed");
      return;
    }
    // Draft id used to be shown here. Rendering replaces that with the PNG.
    setSaved("rendering");
    // Reads status once a second so the page can say generating while the image is built.
    let polling = true;
    const poll = window.setInterval(() => {
      void fetch(api + "/api/posters/" + poster.id, {
        headers: { Authorization: "Bearer " + auth },
      })
        .then((res) => res.json())
        .then((body: { status?: string }) => {
          if (polling && body.status === "generating") setSaved("generating");
        })
        .catch(() => {});
    }, 1000);
    let renderRes: Response;
    try {
      renderRes = await fetch(api + "/api/posters/" + poster.id + "/render", {
        method: "POST",
        headers: { Authorization: "Bearer " + auth },
      });
    } finally {
      polling = false;
      window.clearInterval(poll);
    }
    const rendered = await renderRes.json();
    setSaved("");
    if (!renderRes.ok) {
      setError(rendered.error ?? "render failed");
      return;
    }
    setImageUrl(rendered.generatedImageUrl ?? "");
  }

  // Uses the email or phone on the form, then lists this user's posters.
  async function loadPosters(event: MouseEvent<HTMLButtonElement>) {
    setError("");
    const form = event.currentTarget.form;
    if (!form) return;
    const data = new FormData(form);
    // The form login lives in sessionToken, so a stored sign-in can skip it.
    const auth = await sessionToken(data);
    if (!auth) return;
    const listRes = await fetch(api + "/api/posters", {
      headers: { Authorization: "Bearer " + auth },
    });
    const rows = await listRes.json();
    if (!listRes.ok) {
      setError(rows.error ?? "could not load posters");
      return;
    }
    setToken(auth);
    setPosters(rows);
    const meRes = await fetch(api + "/api/auth/me", {
      headers: { Authorization: "Bearer " + auth },
    });
    const me = await meRes.json();
    if (!meRes.ok || me.role !== "admin") {
      setRole("");
      setReview([]);
      setAdminTemplates([]);
      setUsage({ posters: 0, blocked: 0, flagged: 0, templates: 0, lastLog: null });
      return;
    }
    setRole("admin");
    await loadAdmin(auth);
  }

  // Loads the review list and every template, including hidden ones.
  async function loadAdmin(authToken: string) {
    const headers = { Authorization: "Bearer " + authToken };
    const reviewRes = await fetch(api + "/api/admin/posters", { headers });
    const reviewRows = await reviewRes.json();
    if (!reviewRes.ok) {
      setError(reviewRows.error ?? "could not load review");
      return;
    }
    const templateRes = await fetch(api + "/api/admin/templates", { headers });
    const templateRows = await templateRes.json();
    if (!templateRes.ok) {
      setError(templateRows.error ?? "could not load templates");
      return;
    }
    setReview(reviewRows);
    setAdminTemplates(templateRows);
    const usageRes = await fetch(api + "/api/admin/usage", { headers });
    const usageBody = await usageRes.json();
    if (!usageRes.ok) {
      setError(usageBody.error ?? "could not load usage");
      return;
    }
    setUsage(usageBody);
  }

  // register and logIn moved to /register and /login. The forms are not removed from the project.

  // Drops the sign-in on this page. The account stays in the database.
  function logOut() {
    setToken("");
    setPosters([]);
    setRole("");
    setReview([]);
    setAdminTemplates([]);
    setUsage({ posters: 0, blocked: 0, flagged: 0, templates: 0, lastLog: null });
    setSaved("");
    setError("");
  }

  // Saves a hidden template. It stays off the public list.
  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const res = await fetch(api + "/api/admin/templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        title: data.get("title"),
        occasionType: data.get("occasion"),
        isActive: false,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "template failed");
      return;
    }
    setSaved(body.title ?? "template created");
    await loadAdmin(token);
  }

  // Stops or allows another rebuild. The saved image stays.
  async function setBlocked(id: string, blocked: boolean) {
    setError("");
    const res = await fetch(api + "/api/admin/posters/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ blocked }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "block failed");
      return;
    }
    setReview((rows) => rows.map((item) => (item.id === id ? { ...item, blocked } : item)));
  }

  // Marks a poster for review. A rebuild is still allowed.
  async function setFlagged(id: string, flagged: boolean) {
    setError("");
    const res = await fetch(api + "/api/admin/posters/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ flagged }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "flag failed");
      return;
    }
    setReview((rows) => rows.map((item) => (item.id === id ? { ...item, flagged } : item)));
  }

  // Drops or restores the sample watermark. The saved image stays until the next rebuild.
  async function setClean(id: string, clean: boolean) {
    setError("");
    const res = await fetch(api + "/api/admin/posters/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ clean }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "clean failed");
      return;
    }
    setReview((rows) => rows.map((item) => (item.id === id ? { ...item, clean } : item)));
  }

  // Hides or shows a template on the public list.
  async function setTemplateActive(id: string, isActive: boolean) {
    setError("");
    const res = await fetch(api + "/api/admin/templates/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ isActive }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "update failed");
      return;
    }
    setAdminTemplates((rows) => rows.map((item) => (item.id === id ? { ...item, isActive } : item)));
  }

  // Removes one template. The three public layouts should be left in place.
  async function deleteTemplate(id: string) {
    setError("");
    const res = await fetch(api + "/api/admin/templates/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "delete failed");
      return;
    }
    setAdminTemplates((rows) => rows.filter((item) => item.id !== id));
  }

  // Opens the poster HTML in a new tab. Chrome on the server does not start.
  async function preview(id: string) {
    setError("");
    const res = await fetch(api + "/api/posters/" + id + "/preview", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "preview failed");
      return;
    }
    const tab = window.open("");
    if (!tab) {
      setError("preview failed");
      return;
    }
    tab.document.write(await res.text());
    tab.document.close();
  }

  // Rebuilds one poster and replaces that row with the new PNG link.
  async function regenerate(id: string) {
    setError("");
    setBusyId(id);
    const res = await fetch(api + "/api/posters/" + id + "/regenerate", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const row = await res.json();
    setBusyId("");
    if (!res.ok) {
      setError(row.error ?? "render failed");
      return;
    }
    setPosters((rows) => rows.map((item) => (item.id === id ? row : item)));
  }

  // Deletes this user's poster and drops that row. The photo and PNG stay stored.
  async function removePoster(id: string) {
    setError("");
    try {
      const res = await fetch(api + "/api/posters/" + id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "delete failed");
        return;
      }
      setPosters((rows) => rows.filter((item) => item.id !== id));
    } catch {
      setError("delete failed");
    }
  }

  // Saves the five text fields on this row. The image stays until Regenerate.
  async function saveText(id: string, event: MouseEvent<HTMLButtonElement>) {
    setError("");
    const row = event.currentTarget.closest("li");
    if (!row) return;
    const formData: Record<string, string> = {};
    for (const key of fields) {
      const input = row.querySelector(`input[name="${key}"]`);
      formData[key] = input instanceof HTMLInputElement ? input.value : "";
    }
    const res = await fetch(api + "/api/posters/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ formData }),
    });
    const savedRow = await res.json();
    if (!res.ok) {
      setError(savedRow.error ?? "save failed");
      return;
    }
    setPosters((rows) => rows.map((item) => (item.id === id ? savedRow : item)));
  }

  const occasions = [...new Set(templates.map((row) => row.occasionType))];
  const shown = occasion ? templates.filter((row) => row.occasionType === occasion) : templates;

  // Logged-out visitors are sent to /login. The poster page stays for a stored token.
  if (!ready || !token) return null;

  return (
    <main>
      <header className="topbar">
        <button type="button" className="profile" onClick={() => setMenuOpen((open) => !open)}>
          {role === "admin" ? "admin" : "user"}
        </button>
        {menuOpen ? (
          <div className="profile-menu">
            <button type="button" onClick={logOut}>Log out</button>
          </div>
        ) : null}
      </header>
      {error || saved ? (
        <div className="notices">
          {error ? <p className="notice error" role="status">{error}</p> : null}
          {saved ? <p className="notice ok" role="status">{saved}</p> : null}
        </div>
      ) : null}
      <section className="step">
        <h2>{token ? "You are signed in" : "You are not signed in"}</h2>
        {/* Register and Log in now live on /register and /login. */}
        {token ? null : (
          <>
            <a className="button-link" href="/register">Register</a>
            <a className="button-link" href="/login">Log in</a>
          </>
        )}
        {/* Log out moved into the profile menu on the top right. */}
        {token && posters.length === 0 ? <p>No posters yet</p> : null}
      </section>
      <section className="step">
        <h2>2. Choose a design</h2>
      <div className="choices">
        <button type="button" onClick={() => setOccasion("")}>
          All
        </button>
        {occasions.map((name) => (
          <button key={name} type="button" onClick={() => setOccasion(name)}>
            {name}
          </button>
        ))}
      </div>
      <ul>
        {shown.map((row) => (
          <li key={row.id}>
            {(row.layoutConfig?.colors ?? [])
              .filter((color) => hexColor.test(color))
              .slice(0, 2)
              .map((color) => (
                <span
                  key={color}
                  style={{ display: "inline-block", width: 16, height: 16, background: color, marginRight: 4 }}
                />
              ))}
            <button type="button" onClick={() => setPicked(row)}>
              {row.title} — {row.occasionType} — {photoLabel(row.layoutConfig?.photoSlots)}
            </button>
          </li>
        ))}
      </ul>
      </section>
      <section className="step">
        <h2>3. Write the poster</h2>
      {picked ? (
        <>
        <form className="poster-form" onSubmit={onSubmit}>
          <p>{picked.title}</p>
          {token ? null : (
            <>
              <label>
                Email
                <input name="email" type="email" placeholder="email" />
              </label>
              <label>
                Phone
                <input name="phone" placeholder="phone" />
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="password" required />
              </label>
            </>
          )}
          {fields.map((key) => (
            <label key={key}>
              {fieldLabels[key]}
              <input name={key} placeholder={key} />
            </label>
          ))}
          <label>
            Font
            <select name="font" defaultValue="nirmala">
              <option value="nirmala">Nirmala</option>
              <option value="noto">Noto Sans Bengali</option>
            </select>
          </label>
          <label>
            Photos
            {/* One field per leader photo. A missing slot count still shows one field. */}
            {Array.from({ length: Math.min(3, Math.max(1, picked.layoutConfig?.photoSlots ?? 1)) }, (_, index) => (
              <input key={index} name="photo" type="file" accept="image/*" />
            ))}
          </label>
          <label>
            Names
            <textarea name="names" placeholder="one name per line" rows={4} />
          </label>
          <label>
            CSV
            <input name="csv" type="file" accept=".csv,text/csv" onChange={readCsv} />
          </label>
          <button type="button" onClick={makeDrafts}>Save names only</button>
          <button type="submit">Make poster</button>
          <button type="button" onClick={loadPosters}>My posters</button>
          {/* The same saved line is the notice above. It is not repeated here. */}
          {imageUrl ? <img src={imageUrl} alt="poster" width={300} /> : null}
        </form>
        {/* The list is outside the draft form so these fields are not saved as a new poster. */}
        <ul className="poster-list">
          {posters.map((row) => (
            <li key={row.id}>
              {busyId === row.id ? "rendering" : row.status}{" "}
              {row.clean ? "" : "sample copy "}
              {/* Three rebuilds are allowed. The first saved image does not count. */}
              {Math.max(0, 3 - (row.regenerateCount ?? 0))} rebuilds left{" "}
              <button type="button" onClick={() => regenerate(row.id)}>
                Regenerate
              </button>{" "}
              <button type="button" onClick={() => removePoster(row.id)}>
                Delete
              </button>{" "}
              <button type="button" onClick={() => preview(row.id)}>
                Preview
              </button>
              {row.generatedImageUrl ? (
                <>
                  {" "}
                  <a href={row.generatedImageUrl}>open</a>
                </>
              ) : null}
              {row.jpgUrl ? (
                <>
                  {" "}
                  <a href={row.jpgUrl}>jpg</a>
                </>
              ) : null}
              {row.pdfUrl ? (
                <>
                  {" "}
                  <a href={row.pdfUrl}>pdf</a>
                </>
              ) : null}
              {fields.map((key) => (
                <label key={key}>
                  {fieldLabels[key]}
                  <input name={key} placeholder={key} defaultValue={String(row.formData?.[key] ?? "")} />
                </label>
              ))}
              <button type="button" onClick={(event) => saveText(row.id, event)}>
                Save text
              </button>
            </li>
          ))}
        </ul>
        {/* Admin now sits under the steps, so a design does not have to be picked first. */}
        </>
      ) : (
        <p>Choose a design first.</p>
      )}
      </section>
      {/* The admin markup lives in AdminPanel.tsx. It shows as soon as this account is an admin. */}
      {role === "admin" ? (
        <AdminPanel
          usage={usage}
          adminTemplates={adminTemplates}
          review={review}
          createTemplate={createTemplate}
          setTemplateActive={setTemplateActive}
          deleteTemplate={deleteTemplate}
          setBlocked={setBlocked}
          setFlagged={setFlagged}
          setClean={setClean}
        />
      ) : null}
    </main>
  );
}
