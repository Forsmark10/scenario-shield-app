import { useState, type ReactNode } from "react";

// Endre dette passordet til det du vil dele med utvalgte
const ACCESS_PASSWORD = "LTP2026";

const STORAGE_KEY = "ltp_access_granted";

export function PasswordGate({ children }: { children: ReactNode }) {
  const [granted, setGranted] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  if (granted) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() === ACCESS_PASSWORD) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {}
      setGranted(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: "40px 36px",
          boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
          border: "1px solid #e2e8f0",
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>🔒</span>
        </div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 4px",
          }}
        >
          Kostnadssenter LTP
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            margin: "0 0 24px",
          }}
        >
          Skriv inn tilgangskode for å fortsette
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder="Tilgangskode"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: `1px solid ${error ? "#ef4444" : "#cbd5e1"}`,
              outline: "none",
              fontFamily: "'Inter', system-ui, sans-serif",
              boxSizing: "border-box",
              marginBottom: 12,
            }}
          />
          {error && (
            <p
              style={{
                fontSize: 12,
                color: "#ef4444",
                margin: "-6px 0 10px",
              }}
            >
              Feil tilgangskode
            </p>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: "#1a3353",
              color: "#ffffff",
              cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            Logg inn
          </button>
        </form>
      </div>
    </div>
  );
}
