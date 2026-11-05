import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

export function Accordion({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`accordion-item${open ? " is-open" : ""}`}>
      <h3>
        <button
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {title}
          <Plus size={17} aria-hidden="true" />
        </button>
      </h3>
      <div
        id={id}
        className="accordion-reveal"
        aria-hidden={!open}
        inert={!open}
      >
        <div>
          <div className="accordion-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
