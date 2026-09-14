import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

type OperationsEditorDialogProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  size?: "resource" | "workflow";
  dirty?: boolean;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function OperationsEditorDialog({
  title,
  eyebrow,
  description,
  size = "resource",
  dirty = false,
  busy = false,
  onClose,
  children,
  footer,
}: OperationsEditorDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const node = dialog.current;
    opener.current = document.activeElement as HTMLElement | null;
    if (node && !node.open) node.showModal();
    window.setTimeout(() => {
      node?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    });
    return () => opener.current?.focus();
  }, []);

  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm("尚有未保存的修改，确定关闭吗？")) return;
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="operations-editor-dialog"
      data-size={size}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <div className="operations-editor-dialog-frame">
        <header>
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            aria-label={`关闭${title}`}
            disabled={busy}
            onClick={requestClose}
          >
            ×
          </button>
        </header>
        <div className="operations-editor-dialog-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </dialog>
  );
}
