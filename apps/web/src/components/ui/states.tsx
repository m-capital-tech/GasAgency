import { CloudOff, Inbox, type LucideIcon } from "lucide-react";
import { Button } from "./button";

export function EmptyState({ icon: Icon = Inbox, title, body, action, onAction }: { icon?: LucideIcon; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-5" />
      </div>
      <p className="font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action && onAction ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <CloudOff className="size-5" />
      </div>
      <p className="font-semibold">Couldn't load this</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message ?? "Is the mock API running on port 4000?"}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
