import { useState, useRef, useEffect, type ReactNode } from "react";

type MicroContentProps = {
  title: string;
  children: ReactNode;
};

export function MicroContent({ title, children }: MicroContentProps) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [children, open]);

  return (
    <div className={`ath-micro-block ${open ? "ath-micro-block--open" : ""}`}>
      <button
        className="ath-micro-header"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-expanded={open}
      >
        <span className="ath-micro-icon">?</span>
        <span className="ath-micro-title">{title}</span>
        <span className="ath-micro-toggle">
          {open ? "Cerrar" : "Saber más"}
        </span>
      </button>

      <div
        className="ath-micro-body"
        style={{ maxHeight: open ? bodyHeight : 0 }}
      >
        <div ref={bodyRef} className="ath-micro-body-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
