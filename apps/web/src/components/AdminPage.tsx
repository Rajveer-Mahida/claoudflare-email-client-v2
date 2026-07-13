import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, setActingOwner } from "@/api/client";
import { useUI } from "@/lib/store";
import { Spinner } from "@/components/primitives";

export function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const actingAs = useUI((s) => s.actingAs);
  const setActingAs = useUI((s) => s.setActingAs);
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: api.adminUsers, retry: false });

  function actAs(u: { id: string; email: string | null }) {
    setActingOwner(u.id);
    setActingAs(u);
    void qc.invalidateQueries();
    toast.success(`Viewing ${u.email ?? u.id}`);
    navigate({ to: "/" });
  }

  function stop() {
    setActingOwner(null);
    setActingAs(null);
    void qc.invalidateQueries();
  }

  if (users.isLoading) {
    return (
      <div className="grid h-full w-full place-items-center">
        <Spinner className="text-accent" />
      </div>
    );
  }

  if (users.error) {
    return (
      <div className="grid h-full w-full place-items-center text-sm text-muted">
        Not authorized.
      </div>
    );
  }

  const rows = users.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted">{rows.length} users</p>
        </div>
        {actingAs && (
          <button
            onClick={stop}
            className="rounded-[var(--radius-lg)] border border-border px-3 py-1.5 text-sm font-medium text-muted hover:border-accent-ring hover:text-fg"
          >
            Stop viewing {actingAs.email ?? actingAs.id}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-inset text-left text-xs uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Aliases</th>
              <th className="px-4 py-2.5 font-semibold">Mail</th>
              <th className="px-4 py-2.5 font-semibold">Unread</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.email ?? "—"}</div>
                  <div className="text-xs text-faint">{u.id}</div>
                </td>
                <td className="px-4 py-3 tabular-nums">{u.alias_count}</td>
                <td className="px-4 py-3 tabular-nums">{u.mail_count}</td>
                <td className="px-4 py-3 tabular-nums">{u.unread_count}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => actAs({ id: u.id, email: u.email })}
                    className="rounded-[var(--radius)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    Open inbox
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
