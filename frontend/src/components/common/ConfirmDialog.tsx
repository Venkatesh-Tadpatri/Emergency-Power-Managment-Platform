import type { ReactNode } from "react";

import { Modal } from "./Modal";

export function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-dialog-message">{message}</p>
      <div className="modal-actions">
        <button type="button" className="header-btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={`header-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
