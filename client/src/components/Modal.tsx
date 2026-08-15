import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A dialog for the short forms that do not deserve a route of their own — creating a habit, rejecting a
 * challenge with a reason, confirming a redemption.
 *
 * Built on `<dialog>` rather than a div with a fixed overlay, so focus trapping, `Esc`, and the
 * top layer come from the platform instead of from several hundred lines that reimplement them
 * incompletely.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;

    // `showModal()` is what puts the dialog in the top layer and makes the rest of the page inert.
    // Guarded because calling it on an already-open dialog throws.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires for Esc as well as for `close()`, which is what keeps React's state in step with a
      // dismissal the platform performed on its own.
      onClose={onClose}
      // A click that lands on the dialog element itself is a click on the backdrop: the content sits in
      // a child, so anything inside it stops here first.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="font-semibold">{title}</h2>
      </div>

      <div className="max-h-[70dvh] overflow-y-auto p-5">{children}</div>

      {footer !== undefined && (
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          {footer}
        </div>
      )}
    </dialog>
  );
}
