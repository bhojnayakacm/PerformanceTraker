import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Employee } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ── Cascading employee search ─────────────────────────────────────────────
 *
 * Single-pass O(n) filter: typing "Alice" returns Alice plus every employee
 * whose `reporting_manager_id` points at Alice. The cascade is one level
 * deep — that's the contract of the 2-tier hierarchy enforced by migration
 * 0016 (and its trigger), so we don't need a recursive walk.
 *
 * Why two passes:
 *   1. Find the IDs of every employee whose name/emp_id matches the query.
 *   2. Build the result by including (a) those direct matches and (b) any
 *      employee whose reporting_manager_id is in the matched set.
 *
 * The two passes share the same employees array — no Map is needed for
 * lookup because membership in pass 2 is checked against the matched-id Set
 * (O(1) hits). The original sort order is preserved, so callers don't have
 * to re-sort after filtering.
 *
 * This helper is the single source of truth for the search rule. The
 * server-side cascading in `getEmployeesForUser` reproduces the same
 * semantics in SQL (a `.in()` over direct matches plus an IN over their
 * reports) — keep them in sync if the rule ever evolves.
 * ────────────────────────────────────────────────────────────────────────── */
export function filterEmployeesWithReports(
  employees: Employee[],
  searchTerm: string,
): Employee[] {
  const trimmed = searchTerm.trim().toLowerCase()
  if (!trimmed) return employees

  // Pass 1: direct text matches against name + emp_id.
  const matchedIds = new Set<string>()
  for (const emp of employees) {
    if (
      emp.name.toLowerCase().includes(trimmed) ||
      emp.emp_id.toLowerCase().includes(trimmed)
    ) {
      matchedIds.add(emp.id)
    }
  }

  if (matchedIds.size === 0) return []

  // Pass 2: include direct matches + employees whose manager is a direct match.
  return employees.filter(
    (emp) =>
      matchedIds.has(emp.id) ||
      (emp.reporting_manager_id != null &&
        matchedIds.has(emp.reporting_manager_id)),
  )
}

/* ── Initials Avatars ── */

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
]

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"
}

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/* ── Date of Joining formatter ────────────────────────────────────────────
 * Postgres DATE wires as "YYYY-MM-DD". The UI wants Indian "dd/mm/yyyy".
 *
 * String-level reformat ONLY — no `new Date()`. A `new Date("2026-04-15")`
 * is parsed as UTC midnight and `.getDate()` in IST (+05:30) silently shifts
 * to "2026-04-14"; that's the same off-by-one trap the import pipeline
 * already documents. Pulling apart the wire format with a regex bypasses
 * it entirely.
 *
 * Returns null on anything we can't render confidently. Callers fall back
 * to the emp_id, which is always present.
 * ────────────────────────────────────────────────────────────────────────── */
export function formatDoj(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, y, mo, d] = m
  const mn = +mo, dn = +d
  // Defensive cap: the DB CHECK is `date`, not a regex, but a manual SQL
  // INSERT with a junk string isn't impossible. We'd rather fall back than
  // render "13/45/2026" and look broken.
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null
  return `${d}/${mo}/${y}`
}
