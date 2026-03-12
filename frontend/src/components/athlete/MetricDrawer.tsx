import { useEffect, useCallback } from "react";

type MetricDrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
};

export function MetricDrawer({ open, title, onClose, children, width = "440px" }: MetricDrawerProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div className="ap-drawer-backdrop" onClick={onClose}>
      <aside
        className="ap-drawer"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ap-drawer-header">
          <h2>{title}</h2>
          <button type="button" className="ap-drawer-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="ap-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
