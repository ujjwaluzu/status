import { StatusDashboard } from "@/components/status-dashboard";

export default function Home() {
  return (
    <div className="page">
      <header className="site-header">
        <div className="site-header__inner">
          <a
            className="brand"
            href="https://ujjwaluzu.in"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="brand__name">ujjwaluzu</span>
          </a>
          <span className="site-header__host">status.ujjwaluzu.in</span>
        </div>
      </header>

      <main className="site-main" id="main">
        <StatusDashboard />
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>© 2026 Ujjwaluzu</span>
          <span className="site-footer__links">
            <a
              href="https://ujjwaluzu.in"
              target="_blank"
              rel="noopener noreferrer"
            >
              ujjwaluzu.in
            </a>
            <span className="site-footer__sep" aria-hidden="true">
              ·
            </span>
            <a
              href="https://blog.ujjwaluzu.in"
              target="_blank"
              rel="noopener noreferrer"
            >
              blog.ujjwaluzu.in
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}