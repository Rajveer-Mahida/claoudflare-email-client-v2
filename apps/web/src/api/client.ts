import type {
  MessageListItem,
  MessageDetail,
  CountsResponse,
  LabelRow,
  SettingsResponse,
  ViewName,
  FlagField,
} from "@email/shared";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (res.status === 401) {
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const body = (data: unknown) => ({ method: "POST", body: JSON.stringify(data) });

export const api = {
  // auth
  me: () => req<{ ok: true }>("/api/auth/me"),
  login: (password: string) => req<{ ok: true }>("/api/auth/login", body({ password })),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // reads
  counts: () => req<CountsResponse>("/api/counts"),
  listLabels: () => req<LabelRow[]>("/api/labels"),
  settings: () => req<SettingsResponse>("/api/settings"),
  messages: (params: { view: ViewName; q?: string; label?: string | null; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    qs.set("view", params.view);
    if (params.q) qs.set("q", params.q);
    if (params.label) qs.set("label", params.label);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return req<MessageListItem[]>(`/api/messages?${qs.toString()}`);
  },
  message: (id: string) => req<MessageDetail>(`/api/messages/${id}`),

  // mutations
  flag: (ids: string[], field: FlagField, value: 0 | 1) =>
    req<{ ok: true }>("/api/messages/flag", body({ ids, field, value })),
  markRead: (id: string, read: boolean) =>
    req<{ ok: true }>("/api/messages/mark-read", body({ id, read })),
  markAllRead: (view: ViewName, labelId?: string | null) =>
    req<{ ok: true }>("/api/messages/mark-all-read", body({ view, labelId })),
  softDelete: (id: string) => req<{ ok: true }>("/api/messages/delete", body({ id })),
  permanentDelete: (ids: string[]) =>
    req<{ ok: true }>("/api/messages/permanent-delete", body({ ids })),
  snooze: (ids: string[], until: number | null) =>
    req<{ ok: true }>("/api/messages/snooze", body({ ids, until })),
  applyLabels: (messageIds: string[], labelIds: string[]) =>
    req<{ ok: true }>("/api/messages/labels", body({ messageIds, labelIds })),
  removeLabel: (messageId: string, labelId: string) =>
    req<{ ok: true }>("/api/messages/labels", { method: "DELETE", body: JSON.stringify({ messageId, labelId }) }),
  cancelSend: (id: string) => req<{ ok: true; cancelled: boolean }>("/api/messages/cancel-send", body({ id })),
  sendNow: (id: string) => req<{ ok: true }>("/api/messages/send-now", body({ id })),

  createLabel: (name: string, color: string) =>
    req<LabelRow>("/api/labels", body({ name, color })),
  deleteLabel: (id: string) => req<{ ok: true }>("/api/labels", { method: "DELETE", body: JSON.stringify({ id }) }),

  reply: (data: {
    messageId: string;
    to: string;
    subject: string;
    html?: string | null;
    text: string;
    sendAfter?: number;
  }) => req<{ ok: true; id: string; pending?: boolean }>("/api/reply", body(data)),

  setSettings: (data: { reply_enabled?: boolean; primary_alias_domain?: string }) =>
    req<{ ok: true }>("/api/settings", body(data)),
};
