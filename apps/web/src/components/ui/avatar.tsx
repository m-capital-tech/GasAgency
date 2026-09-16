import { cn } from "@/lib/utils";

export function Avatar({ name, color = "#A31E21", size = 32, className }: { name: string; color?: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold", className)} style={{ width: size, height: size, backgroundColor: color + "22", color, fontSize: size * 0.38 }} aria-label={name}>
      {initials || "?"}
    </span>
  );
}
