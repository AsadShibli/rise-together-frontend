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
  name: "Name (নাম)",
  designation: "Designation (পদবি)",
  party: "Party (দল)",
  district: "District (জেলা)",
  headline: "Headline (শিরোনাম)",
};
// Example words a typical poster would use. The stored field names stay the same.
const fieldPlaceholders: Record<(typeof fields)[number], string> = {
  name: "করিম উদ্দিন",
  designation: "সদস্য",
  party: "স্থানীয় কমিটি",
  district: "ঢাকা",
  headline: "মহান বিজয় দিবস",
};
// API address. Localhost when NEXT_PUBLIC_API_URL is unset.
const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// A template color is shown only when it is a # and six hex digits.
const hexColor = /^#[0-9A-Fa-f]{6}$/;

// Words shown in the status column. The stored status stays the same.
function statusWord(status: string, busy: boolean) {
  if (busy || status === "generating") return "Building";
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "draft") return "Draft";
  return status;
}
// One slot says "1 photo". The design dropdown shows colors instead of this count.
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
  // The finished picture. Null until Make poster or Rebuild picture succeeds.
  const [readyPoster, setReadyPoster] = useState<{ png: string; jpg: string; pdf: string } | null>(null);
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
  // Occasion buttons repeated the design names, so that filter is not used.
  // const [occasion, setOccasion] = useState("");
  // Poster form, or the admin tools. Only an admin sees the Admin tab.
  const [tab, setTab] = useState("poster");
  // Click opens the profile menu. Hover used to show Log out only.
  const [menuOpen, setMenuOpen] = useState(false);
  // profileOpen used to show the password form in this menu. Profile is its own page now.
  // const [profileOpen, setProfileOpen] = useState(false);
  // Which poster row is showing the word fields.
  const [editingId, setEditingId] = useState("");
  // Text in the My posters name box. Blank keeps every row.
  const [nameQuery, setNameQuery] = useState("");
  // Status list on My posters. Blank means every status.
  const [statusQuery, setStatusQuery] = useState("");
  // The first persist run must not wipe a token saved by an earlier visit.
  const skipWipe = useRef(true);
  // False until this page has read the stored token. Then a missing token goes to /login.
  const [ready, setReady] = useState(false);
  // The click-open menu was replaced. Log out now appears when the profile icon is hovered.
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
    // The notice lists each stored name, so two lines do not look like one repeated name.
    const stored = Array.isArray(created)
      ? created.map((row: { formData?: { name?: string } }) => row.formData?.name || "").filter(Boolean)
      : [];
    const shown = stored.length ? stored : names;
    setSaved(shown.length + " drafts: " + shown.join(", "));
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
    // The font picker was removed. The poster keeps Noto Sans Bengali.
    // formData.font = String(data.get("font") ?? "");
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
    if (rendered.generatedImageUrl) {
      setReadyPoster({
        png: rendered.generatedImageUrl,
        jpg: rendered.jpgUrl ?? "",
        pdf: rendered.pdfUrl ?? "",
      });
    }
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
    setMenuOpen(false);
  }

  // The password form was removed from this menu. The old function is kept here, unused.
  // async function changePassword(event: FormEvent<HTMLFormElement>) {
  //   event.preventDefault();
  //   const data = new FormData(event.currentTarget);
  //   await fetch(api + "/api/auth/password", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
  //     body: JSON.stringify({
  //       currentPassword: data.get("currentPassword"),
  //       newPassword: data.get("newPassword"),
  //     }),
  //   });
  // }

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

  // Writes the design name, occasion, photo count, and two colors. Hide still uses its own button.
  async function updateTemplate(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const res = await fetch(api + "/api/admin/templates/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        title: data.get("title"),
        occasionType: data.get("occasion"),
        photoSlots: Number(data.get("photoSlots")),
        colors: [String(data.get("color1") ?? ""), String(data.get("color2") ?? "")],
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "template failed");
      return false;
    }
    setSaved(body.title ?? "template saved");
    await loadAdmin(token);
    return true;
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
    if (row.generatedImageUrl) {
      setReadyPoster({
        png: row.generatedImageUrl,
        jpg: row.jpgUrl ?? "",
        pdf: row.pdfUrl ?? "",
      });
    }
  }

  // Fetches a stored file and saves it under the given name. Cloudinary links have no file name.
  async function downloadFile(url: string, filename: string) {
    setError("");
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError("could not download " + filename);
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      setError("could not download " + filename);
    }
  }

  // Reads the stored file and saves it as poster.pdf. The link itself has no .pdf name.
  async function downloadPdf(url: string) {
    await downloadFile(url, "poster.pdf");
  }

  // The old downloadPdf body fetched the PDF itself. downloadFile does that for PNG, JPG, and PDF.

  // Deletes this user's poster and drops that row. The photo and PNG stay stored.
  async function removePoster(id: string) {
    if (!window.confirm("Delete this poster?")) return;
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
    const row = event.currentTarget.closest(".poster-row");
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

  // The occasion list and the filtered "shown" array went with those buttons.
  // Rows that match the name box and the status list. Both are optional.
  const shownPosters = posters.filter((row) => {
    const nameOk = (row.formData?.name || "").toLowerCase().includes(nameQuery.trim().toLowerCase());
    const statusOk = statusQuery === "" || row.status === statusQuery;
    return nameOk && statusOk;
  });
  // The drawn sample used the design colors. The real poster picture does not.
  // const guideColors = (picked?.layoutConfig?.colors ?? []).filter((color) => hexColor.test(color)).slice(0, 2);
  // const guideBg = guideColors[0] || "#006A4E";
  // const guideAccent = guideColors[1] || "#F42A41";

  // Logged-out visitors are sent to /login. The poster page stays for a stored token.
  if (!ready || !token) return null;

  return (
    <main>
      <header className="banner topbar">
        <h1>Rise Together</h1>
        <div className="top-account">
        <span className="role-name">{role === "admin" ? "admin" : "user"}</span>
        <div className="profile">
          <button
            type="button"
            className="profile-icon"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen ? (
            <div className="profile-menu">
              <a href="/profile">Profile</a>
              {/* The password form used to open here. Current password, New password, and Change password are gone. */}
              <button type="button" onClick={logOut}>Log out</button>
            </div>
          ) : null}
        </div>
        </div>
      </header>
      <nav className="tabs" aria-label="Sections">
        <button type="button" className={tab === "poster" ? "on" : ""} onClick={() => setTab("poster")}>
          Make a poster
        </button>
        <button type="button" className={tab === "posters" ? "on" : ""} onClick={() => setTab("posters")}>
          My posters
        </button>
        {role === "admin" ? (
          <button type="button" className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>
            Admin
          </button>
        ) : null}
      </nav>
      {error || saved ? (
        <div className="notices">
          {error ? <p className="notice error" role="status">{error}</p> : null}
          {saved ? <p className="notice ok" role="status">{saved}</p> : null}
        </div>
      ) : null}
      {tab === "poster" ? (
      <>
      {/* Empty list shows the three steps. A saved poster hides them. */}
      {posters.length === 0 ? (
        <ol className="first-steps">
          <li>Choose a design.</li>
          <li>Write the name.</li>
          <li>Press Make poster.</li>
        </ol>
      ) : null}
      <section className="step">
        <h2>Choose a design</h2>
        {/* Occasion buttons and the hex dropdown repeated this list. Colors are the squares. */}
        <p>Pick one design. The squares are its colors. An admin can add more.</p>
        <div className="design-list">
          {templates.map((row) => {
            const colors = (row.layoutConfig?.colors ?? []).filter((color) => hexColor.test(color)).slice(0, 2);
            return (
              <button
                key={row.id}
                type="button"
                className={picked?.id === row.id ? "design-pick on" : "design-pick"}
                onClick={() => setPicked(row)}
              >
                {colors.map((color) => (
                  <span key={color} className="swatch" style={{ background: color }} />
                ))}
                {row.title}
              </button>
            );
          })}
        </div>
      </section>
      <section className="step">
        <h2>Write the poster</h2>
      {picked ? (
        <div className="write-layout">
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
              <input name={key} placeholder={fieldPlaceholders[key]} />
            </label>
          ))}
          {/* Font choice was a stretch item. The headline stays on Noto Sans Bengali. */}
          <label>
            Photos (ছবি)
            {/* One field per leader photo. A missing slot count still shows one field. */}
            {Array.from({ length: Math.min(3, Math.max(1, picked.layoutConfig?.photoSlots ?? 1)) }, (_, index) => (
              <input key={index} name="photo" type="file" accept="image/*" />
            ))}
          </label>
          {/* Extra names and a name file are one optional group. The Name field above is the poster. */}
          <fieldset className="optional-group">
            <legend>Optional</legend>
            <label>
              Names (নাম)
              <textarea name="names" placeholder={"করিম উদ্দিন\nরহিম উদ্দিন"} rows={4} />
            </label>
            <label>
              Name file
              <input name="csv" type="file" accept=".csv,text/csv" onChange={readCsv} />
            </label>
            <button type="button" onClick={makeDrafts}>Save drafts</button>
          </fieldset>
          {/* The long line-by-line lesson is off. The requirement does not ask for that on the form. */}
          <button type="submit">Make poster</button>
          {/* My posters is a tab now. This button used to open the list under the form. */}
          {/* The same saved line is the notice above. It is not repeated here. */}
          {/* The small poster image now opens in the full-screen preview. */}
        </form>
        {/* The poster list moved to the My posters tab. */}
        {/* Admin now sits under the steps, so a design does not have to be picked first. */}
        {/* A drawing of the real poster. The words name the form fields. Typing does not change them. */}
        <aside className="poster-guide" aria-label="Where each field is printed">
          {/* The drawn sample is off. This picture is a real poster, large enough to read. */}
          <div className="guide-sheet">
            <img src="/sample-poster.png" alt="Sample poster: photos, headline, নমুনা, then the name band" />
            {/* Notes on the picture covered the name. They sit to the right again. */}
            {/* The list is inside the picture so each arrow uses the picture's own height. */}
            <ul className="guide-labels">
              <li className="at-photos">Photos (ছবি)</li>
              <li className="at-headline">Headline (শিরোনাম)</li>
              <li className="at-mark">Watermark (নমুনা)</li>
              <li className="at-name">Name (নাম)</li>
              <li className="at-role">Designation (পদবি)</li>
              <li className="at-place">Party · District (দল · জেলা)</li>
            </ul>
          </div>
          {/* The old drawing stayed here: flag, cutouts, portrait, headline, নমুনা, and the name band. */}
        </aside>
        </div>
      ) : (
        <p>Choose a design first.</p>
      )}
      </section>
      </>
      ) : null}
      {tab === "posters" ? (
        <section className="step poster-directory">
          <h2>My posters</h2>
          {/* "Yes means the poster still shows নমুনা." The line below names the Watermark column. */}
          <p>Watermark: Yes means নমুনা is still on the picture. No means that word is off.</p>
          {/* Filters the rows already loaded. It does not call the server again. */}
          <div className="poster-tools">
            <label className="poster-search">
              Search by name
              <input
                value={nameQuery}
                onChange={(event) => setNameQuery(event.target.value)}
                placeholder="Type a name"
              />
            </label>
            <label className="poster-search">
              Status
              <select value={statusQuery} onChange={(event) => setStatusQuery(event.target.value)}>
                <option value="">All</option>
                <option value="completed">Ready</option>
                <option value="draft">Draft</option>
                <option value="failed">Failed</option>
                <option value="generating">Building</option>
              </select>
            </label>
          </div>
          <p className="poster-count">{shownPosters.length} shown</p>
          {posters.length === 0 ? <p>No posters yet.</p> : shownPosters.length === 0 ? (
            /* "No name matches." became this line, because the status list can hide rows too. */
            <p>Nothing matches.</p>
          ) : (
            <div className="poster-table-wrap">
              <table className="poster-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Watermark</th>
                    <th>Rebuilds left</th>
                    <th>Files</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownPosters.map((row) => {
                    const rebuildsLeft = Math.max(0, 3 - (row.regenerateCount ?? 0));
                    return [
                      <tr key={row.id} className="poster-row">
                        <td>{row.formData?.name || "No name"}</td>
                        <td>{statusWord(row.status, busyId === row.id)}</td>
                        <td>{row.clean ? "No" : "Yes"}</td>
                        <td>{rebuildsLeft}</td>
                        <td>
                          <div className="poster-actions">
                            {row.generatedImageUrl ? (
                              <a className="view-picture" href={row.generatedImageUrl} target="_blank" rel="noreferrer">
                                View picture
                              </a>
                            ) : null}
                            {row.jpgUrl ? (
                              <a className="file-button" href={row.jpgUrl}>Download JPG</a>
                            ) : null}
                            {row.pdfUrl ? (
                              <button type="button" onClick={() => downloadPdf(row.pdfUrl ?? "")}>Download PDF</button>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="poster-actions">
                            <button type="button" onClick={() => setEditingId(editingId === row.id ? "" : row.id)}>
                              Change words
                            </button>
                            <button
                              type="button"
                              disabled={rebuildsLeft === 0 || busyId === row.id}
                              onClick={() => regenerate(row.id)}
                            >
                              Rebuild picture
                            </button>
                            {/* The old Preview button opened the HTML page. It stays only when there is no picture. */}
                            {row.generatedImageUrl ? null : (
                              <button type="button" onClick={() => preview(row.id)}>See layout</button>
                            )}
                            <button type="button" onClick={() => removePoster(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>,
                      editingId === row.id ? (
                        <tr key={row.id + "-words"} className="poster-row">
                          <td colSpan={6}>
                            <p>The picture changes only after Rebuild picture.</p>
                            <div className="word-edit">
                              {fields.map((key) => (
                                <label key={key}>
                                  {fieldLabels[key]}
                                  <input name={key} placeholder={key} defaultValue={String(row.formData?.[key] ?? "")} />
                                </label>
                              ))}
                              <button type="button" onClick={(event) => saveText(row.id, event)}>Save words</button>
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {/* Admin is its own tab, so it is not stacked under the poster form. */}
      {role === "admin" && tab === "admin" ? (
        <AdminPanel
          usage={usage}
          adminTemplates={adminTemplates}
          review={review}
          createTemplate={createTemplate}
          updateTemplate={updateTemplate}
          setTemplateActive={setTemplateActive}
          deleteTemplate={deleteTemplate}
          setBlocked={setBlocked}
          setFlagged={setFlagged}
          setClean={setClean}
        />
      ) : null}
      {readyPoster ? (
        <div className="poster-preview" role="dialog" aria-modal="true" aria-label="Finished poster">
          <div className="poster-preview-bar">
            <button type="button" onClick={() => downloadFile(readyPoster.png, "poster.png")}>Download PNG</button>
            {readyPoster.jpg ? (
              <button type="button" onClick={() => downloadFile(readyPoster.jpg, "poster.jpg")}>Download JPG</button>
            ) : null}
            {readyPoster.pdf ? (
              <button type="button" onClick={() => downloadPdf(readyPoster.pdf)}>Download PDF</button>
            ) : null}
            <button type="button" className="preview-close" onClick={() => setReadyPoster(null)} aria-label="Close">×</button>
          </div>
          <img src={readyPoster.png} alt="Finished poster" />
        </div>
      ) : null}
    </main>
  );
}
