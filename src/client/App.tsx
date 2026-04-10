import { Routes, Route, Link, useLocation } from "react-router-dom";
import Search from "./pages/Search";
import SessionDetail from "./pages/SessionDetail";
import Analytics from "./pages/Analytics";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-slate-700 text-white"
          : "text-slate-300 hover:text-white hover:bg-slate-700/50"
      }`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                chat-browser
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <NavLink to="/">Search</NavLink>
              <NavLink to="/analytics">Analytics</NavLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </main>
    </div>
  );
}
