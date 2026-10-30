"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PawPrint, ArrowRight, Sun, Moon } from "lucide-react";
import { login } from "../app/actions";

export default function Login({ orgName = "Rejestr schroniska" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  };

  const submit = async () => {
    if (!code.trim()) return setErr("Wpisz kod, aby wejść.");
    setBusy(true);
    setErr(null);
    const res = await login(code);
    if (res?.error) {
      setErr(res.error);
      setBusy(false);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          aria-label="Zmień motyw"
          className="h-9 w-9 grid place-items-center rounded-xl text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="min-h-screen grid place-items-center px-6">
        <div className="w-full max-w-sm rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8">
          <div className="flex flex-col items-center text-center">
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-teal-600 text-white mb-4">
              <PawPrint size={26} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">{orgName}</h1>
            <p className="text-sm mt-1 text-stone-500 dark:text-stone-400">
              Ewidencja zwierząt w schronisku
            </p>
          </div>

          <div className="mt-7">
            <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
              Kod dostępu
            </label>
            <input
              autoFocus
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(null); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Kod..."
              className="mt-1.5 w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 text-center text-lg tracking-[0.3em] uppercase outline-none focus:ring-2 focus:ring-teal-500 transition"
            />
            {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white py-3 font-medium flex items-center justify-center gap-2 transition active:scale-[.99]"
            >
              {busy ? "Sprawdzanie…" : <>Wejdź <ArrowRight size={18} /></>}
            </button>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-stone-400 dark:text-stone-500">
            Każda gmina ma własny kod i widzi tylko swoje zwierzęta. W razie pytań proszę skontaktować się z administratorem.
          </p>
        </div>
      </div>
    </div>
  );
}
