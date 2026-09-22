import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { WorldCanvas } from "./WorldCanvas";
import { BottomNav, DebugPanel, Hud, MenuSheet, OfflineModal, Sheet, TitleScreen, Toasts, TutorialCoach } from "./ui";
import { useGame } from "./store";
import { sfx } from "./audio";

class BootError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_e: Error, _info: ErrorInfo) {
    /* overlay handles it */
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center bg-paper px-6 text-center text-ink">
          <div>
            <p className="font-display text-2xl tracking-widest">仙途中断</p>
            <button
              type="button"
              className="ink-btn ink-btn-solid mt-5 min-h-12 px-8"
              onClick={() => {
                try {
                  localStorage.removeItem("xian-clicker-v1");
                  localStorage.removeItem("xian-clicker-v1:bak");
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
            >
              重新开启
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GameShell() {
  useEffect(() => {
    useGame.getState().hydrate();
    const onFirst = () => sfx.unlock();
    window.addEventListener("pointerdown", onFirst, { once: true });
    const lock = (e: TouchEvent) => {
      const t = e.target;
      if (t instanceof Element) {
        // Let Sheet / panels with overflow-y-auto scroll
        if (t.closest(".overflow-y-auto")) return;
        // Only lock rubber-band on canvas / game world (and non-scroll UI)
        const onCanvas = !!t.closest("canvas");
        if (!onCanvas && t.closest("[data-allow-touch-scroll]")) return;
      }
      e.preventDefault();
    };
    document.addEventListener("touchmove", lock, { passive: false });
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      document.removeEventListener("touchmove", lock);
    };
  }, []);

  return (
    <BootError>
      <Play />
    </BootError>
  );
}

function Play() {
  const started = useGame((s) => s.started);

  return (
    <main
      className="absolute inset-0 flex justify-center overflow-hidden bg-void text-ink"
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.preventDefault()}
    >
      <div
        className="relative h-full w-full max-w-phone overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}
      >
        <WorldCanvas />
        {started && <Hud />}
        {started && <TutorialCoach />}
        {started && <Sheet />}
        {started && <BottomNav />}
        {started && <Toasts />}
        {started && <DebugPanel />}
        {started && <OfflineModal />}
        {started && <MenuSheet />}
        {!started && <TitleScreen />}
      </div>
    </main>
  );
}