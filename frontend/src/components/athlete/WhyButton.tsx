import { useState, useRef, useEffect } from "react";

type WhyButtonProps = {
  explanation: string;
};

export function WhyButton({ explanation }: WhyButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="ap-why-wrap" ref={ref}>
      <button
        type="button"
        className="ap-why-btn"
        onClick={() => setOpen((v) => !v)}
      >
        ¿por qué?
      </button>
      {open && (
        <div className="ap-why-popover">
          <p>{explanation}</p>
        </div>
      )}
    </div>
  );
}
