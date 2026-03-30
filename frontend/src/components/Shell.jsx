import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getUserLabel, logout } from "../auth";

function Item({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "11px 12px",
        borderRadius: 14,
        fontWeight: 950,
        border: "1px solid transparent",
        color: "inherit",
        background: isActive ? "rgba(255,255,255,.10)" : "transparent",
        borderColor: isActive ? "rgba(255,255,255,.16)" : "transparent",
      })}
    >
      <span style={{ width: 22, opacity: 0.9 }}>{icon}</span>
      {label}
    </NavLink>
  );
}

export default function Shell() {
  const user = getUserLabel();
  const loc = useLocation();

  const title =
    loc.pathname.startsWith("/jobs") ? "Jobs" :
    loc.pathname.startsWith("/settings") ? "Settings" :
    "Analytics";

  return (
    <div className="container">
      <div className="row" style={{ alignItems: "stretch" }}>
        {/* Sidebar */}
        <div className="card pad" style={{ width: 280, minHeight: 560 }}>
          <div style={{ fontWeight: 1000, fontSize: 18 }}>PrintOps</div>
          <div style={{ color: "var(--muted)", fontWeight: 800, marginTop: 4 }}>
            Signed in as <span style={{ color: "var(--text)" }}>{user}</span>
          </div>

          <div className="hr" />

          <div style={{ display: "grid", gap: 8 }}>
            <Item to="/dashboard" label="Analytics" icon="📊" />
            <Item to="/jobs" label="Jobs" icon="🧾" />
            <Item to="/settings" label="Settings" icon="⚙️" />
          </div>

          <div style={{ flex: 1 }} />

          <div className="hr" />
          <button className="btn danger" onClick={logout} style={{ width: "100%" }}>
            Log out
          </button>
        </div>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div>
              <h1 className="h1">{title}</h1>
              <p className="sub">
                Clean dashboard, real metrics, and smooth job tracking.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
