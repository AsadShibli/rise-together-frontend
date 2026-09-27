"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { accountFrom } from "../accountFrom";

// Same API address the home page uses.
const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  // True while the login request is running, so a second click cannot send it again.
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  // Null until we know whether this browser already has a token.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(sessionStorage.getItem("token")));
  }, []);

  // Signs in an account that already exists.
  async function logIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    // A stopped API throws here. Show a notice instead of an unhandled error.
    try {
      const res = await fetch(api + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountFrom(data)),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(body.error ?? "login failed");
        return;
      }
      sessionStorage.setItem("token", body.token);
      router.push("/");
    } catch {
      setNotice("Could not reach the server");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="banner">
        <span className="disc" aria-hidden="true"></span>
        <div>
          <h1>Rise Together</h1>
        </div>
      </header>
      {notice ? <p className="notice error" role="status">{notice}</p> : null}
      <section className="step">
        {signedIn === null ? null : signedIn ? (
          <h2>You are signed in</h2>
        ) : (
          <>
            <h2>Log in</h2>
            <form onSubmit={logIn}>
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
              <button type="submit" disabled={busy}>{busy ? "Please wait" : "Log in"}</button>
            </form>
            <p>
              No account? <a className="text-link" href="/register">Register</a>
            </p>
          </>
        )}
        {signedIn ? <a className="button-link" href="/">Home</a> : null}
      </section>
    </main>
  );
}
