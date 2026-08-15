import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { CalendarCheck, LineChart, Sparkles, Bookmark } from "lucide-react";

export const Route = createRootRoute({
  component: RootLayout,
});

const tabs = [
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/dashboard", label: "Dashboard", icon: LineChart },
  { to: "/insights", label: "Insights", icon: Sparkles },
  { to: "/wall", label: "Wall", icon: Bookmark },
] as const;

function RootLayout() {
  return (
    <div className="min-h-full pb-20">
      <Outlet />

      <nav className="fixed inset-x-0 bottom-0 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--color-ink-soft)] transition"
              activeProps={{
                className:
                  "flex flex-1 flex-col items-center gap-1 py-3 text-[var(--color-teal)] transition",
              }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon size={20} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
