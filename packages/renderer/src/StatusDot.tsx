import React from "react";

type Tone = "idle" | "running" | "success" | "error" | "warn" | "pending";

const toneClass: Record<Tone, string> = {
  idle: "bg-slate-500",
  running: "bg-nyven-400 ns-pulse",
  success: "bg-emerald-400",
  error: "bg-red-400",
  warn: "bg-amber-400",
  pending: "bg-slate-600",
};

export function StatusDot({
  tone,
  className = "",
  label,
}: {
  tone: Tone;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${toneClass[tone]} ${className}`}
      role="img"
      aria-label={label || tone}
    />
  );
}

export function statusToTone(
  status?: string | null
): Tone {
  switch (status) {
    case "running":
    case "active":
    case "starting":
      return "running";
    case "completed":
    case "success":
      return "success";
    case "failed":
    case "error":
      return "error";
    case "cancelled":
      return "warn";
    case "pending":
      return "pending";
    default:
      return "idle";
  }
}
