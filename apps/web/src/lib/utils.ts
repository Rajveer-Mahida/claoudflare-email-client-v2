import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(n?: number | null): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function initials(name?: string | null, fallback?: string): string {
  const src = (name && name.trim()) || fallback || "?";
  return (
    src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Deterministic warm hue from a string, for avatar tints. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function displayName(from_name: string | null, from_addr: string): string {
  return (from_name && from_name.trim()) || from_addr.split("@")[0] || from_addr;
}
