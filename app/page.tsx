"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Solve = { id: string; time: number; createdAt: number };
type Profile = { id: string; name: string; color: string; solves: Solve[] };
type View = "timer" | "comparison";

const PROFILE_COLORS = ["#9b5cff", "#c084fc", "#7c3aed", "#d946ef", "#6366f1"];
const SCRAMBLE_MOVES = ["R", "L", "U", "D", "F", "B"];
const SCRAMBLE_SUFFIXES = ["", "'", "2"];
const STORAGE_KEY = "duo-timer-state-v1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REMOTE_ROOM = process.env.NEXT_PUBLIC_DUO_ROOM;
const supabase = SUPABASE_URL && SUPABASE_KEY && REMOTE_ROOM
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const demoProfiles: Profile[] = [
  {
    id: "bartek",
    name: "Bartek",
    color: PROFILE_COLORS[0],
    solves: [10.41, 9.82, 11.06, 9.37, 10.12, 8.742, 10.03].map((time, index) => ({
      id: `b-${index}`,
      time,
      createdAt: Date.now() - (7 - index) * 60000,
    })),
  },
  {
    id: "kolega",
    name: "Kolega",
    color: PROFILE_COLORS[1],
    solves: [11.2, 10.46, 9.104, 10.91, 10.18, 9.87].map((time, index) => ({
      id: `k-${index}`,
      time,
      createdAt: Date.now() - (6 - index) * 60000,
    })),
  },
];

function formatTime(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function averageOfLast(solves: Solve[], amount: number) {
  if (solves.length < amount) return undefined;
  const values = solves.slice(-amount).map((solve) => solve.time).sort((a, b) => a - b);
  const trimmed = amount >= 5 ? values.slice(1, -1) : values;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

function stats(profile?: Profile) {
  if (!profile || profile.solves.length === 0) return { pb: undefined, ao5: undefined, ao12: undefined };
  return {
    pb: Math.min(...profile.solves.map((solve) => solve.time)),
    ao5: averageOfLast(profile.solves, 5),
    ao12: averageOfLast(profile.solves, 12),
  };
}

function createScramble() {
  const result: string[] = [];
  let previous = "";
  while (result.length < 20) {
    const move = SCRAMBLE_MOVES[Math.floor(Math.random() * SCRAMBLE_MOVES.length)];
    if (move === previous) continue;
    result.push(move + SCRAMBLE_SUFFIXES[Math.floor(Math.random() * SCRAMBLE_SUFFIXES.length)]);
    previous = move;
  }
  return result.join(" ");
}

async function loadRemoteProfiles(): Promise<Profile[]> {
  if (!supabase || !REMOTE_ROOM) return [];
  const [{ data: profileRows, error: profileError }, { data: solveRows, error: solveError }] = await Promise.all([
    supabase.from("profiles").select("id,name,color,created_at").eq("room_code", REMOTE_ROOM).order("created_at"),
    supabase.from("solves").select("id,profile_id,time_seconds,created_at_ms").eq("room_code", REMOTE_ROOM).order("created_at_ms"),
  ]);
  if (profileError || solveError) throw profileError ?? solveError;
  return (profileRows ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    color: profile.color,
    solves: (solveRows ?? [])
      .filter((solve) => solve.profile_id === profile.id)
      .map((solve) => ({ id: solve.id, time: Number(solve.time_seconds), createdAt: Number(solve.created_at_ms) })),
  }));
}

function ProfileAvatar({ profile, large = false }: { profile: Profile; large?: boolean }) {
  return (
    <span className={`profile-avatar ${large ? "profile-avatar--large" : ""}`} style={{ "--profile-color": profile.color } as React.CSSProperties}>
      <span>{profile.name.slice(0, 1).toUpperCase()}</span>
      <i />
    </span>
  );
}

export default function Home() {
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(true);
  const [managing, setManaging] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [view, setView] = useState<View>("timer");
  const [scramble, setScramble] = useState("R U R' U' F2 D L2 B' U2 R2 F D' L B2 U' R F' D2 L' U");
  const [timerState, setTimerState] = useState<"idle" | "ready" | "running">("idle");
  const [displayTime, setDisplayTime] = useState(8.742);
  const [newProfileName, setNewProfileName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "online" | "error">(supabase ? "syncing" : "local");
  const startTimeRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (supabase) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { profiles: Profile[]; activeProfileId?: string };
      if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
        const timeout = window.setTimeout(() => {
          setProfiles(parsed.profiles);
          if (parsed.activeProfileId && parsed.profiles.some((p) => p.id === parsed.activeProfileId)) {
            setActiveProfileId(parsed.activeProfileId);
          }
        }, 0);
        return () => window.clearTimeout(timeout);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles, activeProfileId }));
  }, [profiles, activeProfileId]);

  useEffect(() => {
    if (!supabase || !REMOTE_ROOM) return;
    let cancelled = false;
    const connect = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionRoom = data.session?.user.user_metadata?.room_code;
        if (!data.session || sessionRoom !== REMOTE_ROOM) {
          if (data.session) await supabase.auth.signOut();
          const { error } = await supabase.auth.signInAnonymously({ options: { data: { room_code: REMOTE_ROOM } } });
          if (error) throw error;
        }
        const remoteProfiles = await loadRemoteProfiles();
        if (cancelled) return;
        setProfiles(remoteProfiles);
        setActiveProfileId((current) => remoteProfiles.some((profile) => profile.id === current) ? current : null);
        setRemoteReady(true);
        setSyncStatus("online");
      } catch {
        if (!cancelled) setSyncStatus("error");
      }
    };
    void connect();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!supabase || !REMOTE_ROOM || !remoteReady) return;
    const timeout = window.setTimeout(async () => {
      setSyncStatus("syncing");
      const profileRows = profiles.map((profile, index) => ({
        id: profile.id,
        room_code: REMOTE_ROOM,
        name: profile.name,
        color: profile.color,
        position: index,
      }));
      const solveRows = profiles.flatMap((profile) => profile.solves.map((solve) => ({
        id: solve.id,
        room_code: REMOTE_ROOM,
        profile_id: profile.id,
        time_seconds: solve.time,
        created_at_ms: solve.createdAt,
      })));
      const profileResult = profileRows.length ? await supabase.from("profiles").upsert(profileRows) : { error: null };
      const solveResult = solveRows.length ? await supabase.from("solves").upsert(solveRows) : { error: null };
      setSyncStatus(profileResult.error || solveResult.error ? "error" : "online");
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [profiles, remoteReady]);

  useEffect(() => {
    if (!supabase || !remoteReady) return;
    const interval = window.setInterval(async () => {
      try {
        const remoteProfiles = await loadRemoteProfiles();
        setProfiles(remoteProfiles);
        setSyncStatus("online");
      } catch {
        setSyncStatus("error");
      }
    }, 8000);
    return () => window.clearInterval(interval);
  }, [remoteReady]);

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const rival = profiles.find((profile) => profile.id !== activeProfile?.id);
  const activeStats = useMemo(() => stats(activeProfile), [activeProfile]);
  const rivalStats = useMemo(() => stats(rival), [rival]);

  const stopTimer = useCallback(() => {
    if (timerState !== "running") return;
    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const finalTime = Math.max(0.001, Math.round(elapsed * 1000) / 1000);
    setDisplayTime(finalTime);
    setTimerState("idle");
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === activeProfile.id
          ? { ...profile, solves: [...profile.solves, { id: generateId(), time: finalTime, createdAt: Date.now() }] }
          : profile,
      ),
    );
    setScramble(createScramble());
  }, [activeProfile.id, timerState]);

  const startTimer = useCallback(() => {
    startTimeRef.current = performance.now();
    setDisplayTime(0);
    setTimerState("running");
    const tick = () => {
      setDisplayTime((performance.now() - startTimeRef.current) / 1000);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || profilesOpen || modalOpen) return;
      event.preventDefault();
      if (timerState === "running") stopTimer();
      else setTimerState("ready");
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || profilesOpen || modalOpen) return;
      event.preventDefault();
      if (timerState === "ready") startTimer();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [modalOpen, profilesOpen, startTimer, stopTimer, timerState]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  function selectProfile(id: string) {
    setActiveProfileId(id);
    setProfilesOpen(false);
    setManaging(false);
  }

  function addProfile() {
    const name = newProfileName.trim();
    if (!name || profiles.length >= 5) return;
    const profile: Profile = {
      id: generateId(),
      name: name.slice(0, 16),
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
      solves: [],
    };
    setProfiles((current) => [...current, profile]);
    setNewProfileName("");
    setModalOpen(false);
    selectProfile(profile.id);
  }

  function renameProfile(profile: Profile) {
    const name = window.prompt("Nowa nazwa profilu", profile.name)?.trim();
    if (!name) return;
    setProfiles((current) => current.map((item) => (item.id === profile.id ? { ...item, name: name.slice(0, 16) } : item)));
  }

  function deleteLastSolve() {
    const removed = activeProfile.solves.at(-1);
    setProfiles((current) => current.map((profile) => profile.id === activeProfile.id ? { ...profile, solves: profile.solves.slice(0, -1) } : profile));
    if (removed && supabase && REMOTE_ROOM) {
      void supabase.from("solves").delete().eq("room_code", REMOTE_ROOM).eq("id", removed.id);
    }
  }

  if (profilesOpen) {
    return (
      <main className="profiles-screen">
        <div className="profiles-brand"><span className="cube-mark"><i /><i /><i /><i /></span> DUO TIMER</div>
        <section className="profiles-content">
          <p className="eyebrow">PROFILE GRACZY</p>
          <h1>{managing ? "Zarządzaj profilami" : "Kto dzisiaj układa?"}</h1>
          <p className="profiles-subtitle">Wybierz swój profil, żeby zapisać czas i porównać go z kolegą.</p>
          <div className="profile-grid">
            {profiles.map((profile) => (
              <button className="profile-card" key={profile.id} onClick={() => managing ? renameProfile(profile) : selectProfile(profile.id)}>
                <span className="profile-avatar-wrap">
                  <ProfileAvatar profile={profile} large />
                  {managing && <span className="edit-badge">✎</span>}
                </span>
                <strong>{profile.name}</strong>
                <small>{profile.solves.length} ułożeń</small>
              </button>
            ))}
            {profiles.length < 5 && (
              <button className="profile-card profile-card--add" onClick={() => setModalOpen(true)}>
                <span className="add-avatar">+</span>
                <strong>Dodaj profil</strong>
                <small>Nowy gracz</small>
              </button>
            )}
          </div>
          <button className="manage-button" onClick={() => setManaging((value) => !value)}>
            {managing ? "Gotowe" : "Zarządzaj profilami"}
          </button>
          <p className={`sync-status sync-status--${syncStatus}`}><i />{syncStatus === "local" ? "Zapis na tym urządzeniu" : syncStatus === "online" ? "Profile zsynchronizowane" : syncStatus === "syncing" ? "Synchronizacja…" : "Brak połączenia z bazą"}</p>
        </section>

        {modalOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Zamknij">×</button>
              <p className="eyebrow">NOWY GRACZ</p>
              <h2 id="profile-title">Dodaj profil</h2>
              <label htmlFor="profile-name">Nazwa</label>
              <input id="profile-name" autoFocus maxLength={16} value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addProfile()} placeholder="np. Kuba" />
              <button className="primary-button" onClick={addProfile}>Utwórz profil</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  const activeWins = rival && activeStats.pb !== undefined && rivalStats.pb !== undefined && activeStats.pb < rivalStats.pb ? 1 : 0;
  const difference = activeStats.pb !== undefined && rivalStats.pb !== undefined ? rivalStats.pb - activeStats.pb : undefined;

  return (
    <main className={`app-shell timer-${timerState}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("timer")}><span className="cube-mark"><i /><i /><i /><i /></span> DUO TIMER</button>
        <nav aria-label="Główna nawigacja">
          <button className={view === "timer" ? "active" : ""} onClick={() => setView("timer")}>Timer</button>
          <button className={view === "comparison" ? "active" : ""} onClick={() => setView("comparison")}>Porównanie</button>
        </nav>
        <div className="profile-menu-wrap">
          <button className="profile-chip" onClick={() => setProfileMenuOpen((value) => !value)} aria-expanded={profileMenuOpen}>
            <ProfileAvatar profile={activeProfile} />
            <span>{activeProfile.name}</span>
            <b>⌄</b>
          </button>
          {profileMenuOpen && (
            <div className="profile-menu">
              <p>Aktualny profil</p>
              {profiles.filter((profile) => profile.id !== activeProfile.id).map((profile) => (
                <button key={profile.id} onClick={() => { selectProfile(profile.id); setProfileMenuOpen(false); }}><ProfileAvatar profile={profile} /> Zmień na {profile.name}</button>
              ))}
              <button onClick={() => { setProfilesOpen(true); setProfileMenuOpen(false); }}>◫ Wybierz inny profil</button>
              <button onClick={() => { setProfilesOpen(true); setManaging(true); setProfileMenuOpen(false); }}>✎ Zarządzaj profilami</button>
            </div>
          )}
        </div>
      </header>

      {view === "timer" ? (
        <section className="timer-layout">
          <div className="timer-stage">
            <div className="scramble-row">
              <span>SCRAMBLE 3×3</span>
              <button onClick={() => setScramble(createScramble())} aria-label="Nowy scramble">↻</button>
            </div>
            <p className="scramble">{scramble}</p>
            <div className="time-wrap">
              <div className="time" aria-live="off">{formatTime(displayTime)}</div>
              <p>{timerState === "ready" ? <><b>GOTOWY</b> — puść spację</> : timerState === "running" ? "SPACJA — zatrzymaj" : <><b>SPACJA</b> — przytrzymaj, aby rozpocząć</>}</p>
            </div>
            <button className="timer-button" onPointerDown={() => timerState === "running" ? stopTimer() : setTimerState("ready")} onPointerUp={() => timerState === "ready" && startTimer()}>
              {timerState === "running" ? "STOP" : "SPACJA"}
            </button>
            <div className="last-solves">
              <span>OSTATNIE</span>
              {activeProfile.solves.slice(-5).reverse().map((solve) => <b key={solve.id}>{formatTime(solve.time)}</b>)}
              <button onClick={deleteLastSolve} disabled={!activeProfile.solves.length}>Usuń ostatni</button>
            </div>
          </div>

          <aside className="versus-card">
            <p className="eyebrow">PORÓWNANIE 3×3</p>
            <h2><span>{activeProfile.name}</span><em>VS</em><span>{rival?.name ?? "—"}</span></h2>
            <div className="versus-legend"><i style={{ background: activeProfile.color }} /> TY <i style={{ background: rival?.color }} /> KOLEGA</div>
            <div className="stat-row"><strong>PB</strong><b>{formatTime(activeStats.pb)}</b><b>{formatTime(rivalStats.pb)}</b></div>
            <div className="stat-row"><strong>ao5</strong><b>{formatTime(activeStats.ao5)}</b><b>{formatTime(rivalStats.ao5)}</b></div>
            <div className="stat-row"><strong>ao12</strong><b>{formatTime(activeStats.ao12)}</b><b>{formatTime(rivalStats.ao12)}</b></div>
            <div className="stat-row"><strong>Ułożenia</strong><b>{activeProfile.solves.length}</b><b>{rival?.solves.length ?? 0}</b></div>
            <div className={`lead-box ${difference !== undefined && difference < 0 ? "lead-box--behind" : ""}`}>
              <span>{activeWins ? "♛" : "◇"}</span>
              <div><small>{difference === undefined ? "BRAK DANYCH" : difference >= 0 ? "PROWADZISZ" : "TRACISZ"}</small><strong>{difference === undefined ? "—" : `${difference >= 0 ? "+" : ""}${difference.toFixed(3)} s`}</strong></div>
            </div>
            <button className="comparison-link" onClick={() => setView("comparison")}>Pełne porównanie <span>→</span></button>
          </aside>
        </section>
      ) : (
        <section className="comparison-view">
          <div className="comparison-heading"><p className="eyebrow">WASZ POJEDYNEK</p><h1>{activeProfile.name} <span>vs</span> {rival?.name ?? "Kolega"}</h1><p>Każdy zapisany czas od razu aktualizuje wspólne porównanie.</p></div>
          <div className="score-grid">
            {[{ label: "Najlepszy czas", a: activeStats.pb, b: rivalStats.pb }, { label: "Średnia z 5", a: activeStats.ao5, b: rivalStats.ao5 }, { label: "Średnia z 12", a: activeStats.ao12, b: rivalStats.ao12 }].map((item) => (
              <article key={item.label}><p>{item.label}</p><div><strong>{formatTime(item.a)}</strong><em>VS</em><strong>{formatTime(item.b)}</strong></div><small>{item.a !== undefined && item.b !== undefined ? `${Math.abs(item.a - item.b).toFixed(3)} s różnicy` : "Potrzeba więcej ułożeń"}</small></article>
            ))}
          </div>
          <button className="primary-button back-to-timer" onClick={() => setView("timer")}>Wróć do timera</button>
        </section>
      )}
    </main>
  );
}
