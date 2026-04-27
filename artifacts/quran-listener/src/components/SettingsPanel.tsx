import { X } from "lucide-react";
import { useEffect } from "react";
import {
  TRANSITIONS,
  type TransitionMode,
} from "@/lib/transitions";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  transition: TransitionMode;
  onTransitionChange: (mode: TransitionMode) => void;
}

export function SettingsPanel({
  open,
  onClose,
  transition,
  onTransitionChange,
}: SettingsPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/* Slide-in panel */}
      <aside
        role="dialog"
        aria-label="Settings"
        aria-hidden={!open}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-neutral-950 text-white shadow-2xl transition-transform duration-300 ease-out"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <h2 className="text-xs uppercase tracking-[0.35em] text-neutral-400">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <section>
            <h3 className="text-sm font-medium text-neutral-200">
              Ayah transition
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              How verses fade from one to the next.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {TRANSITIONS.map((t) => {
                const selected = t.id === transition;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onTransitionChange(t.id)}
                    className="flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition"
                    style={{
                      borderColor: selected
                        ? "rgba(255,255,255,0.4)"
                        : "rgba(255,255,255,0.08)",
                      backgroundColor: selected
                        ? "rgba(255,255,255,0.06)"
                        : "transparent",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        borderColor: selected
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(255,255,255,0.25)",
                      }}
                    >
                      {selected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-neutral-100">
                        {t.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {t.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
