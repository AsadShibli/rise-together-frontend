"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Same API address the home page uses.
const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Fields this page may show. The password is not one of them.
type Me = { name?: string; email?: string; phone?: string; role?: string };

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("token") ?? "";
    if (!token) {
      router.push("/login");
      return;
    }
    // Reads the signed-in account. A bad token goes back to log in.
    fetch(api + "/api/auth/me", { headers: { Authorization: "Bearer " + token } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Me | null) => {
        if (!body) router.push("/login");
        else setMe(body);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  return (
    <main className="auth">
      <header className="banner">
        <div>
          <h1>Rise Together</h1>
        </div>
      </header>
      <section className="step">
        <h2>Profile</h2>
        {me ? (
          <>
            <p>{me.name || "No name"}</p>
            <p>{me.email || me.phone || "No email or phone"}</p>
            <p>{me.role === "admin" ? "admin" : "user"}</p>
          </>
        ) : (
          <p>Loading.</p>
        )}
        <a className="button-link" href="/">Home</a>
      </section>
    </main>
  );
}
