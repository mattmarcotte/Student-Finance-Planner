import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ children, workspace = false }: {
  children: React.ReactNode;
  workspace?: boolean;
}) {
  return (
    <header className={`site-header${workspace ? " workspace-header" : ""}`}>
      <div className="header-identity">
        <Brand />
        {!workspace && <span className="header-note"><span aria-hidden="true">/</span>FINANCE PLANNER</span>}
      </div>
      <div className="header-actions"><ThemeToggle />{children}</div>
    </header>
  );
}
