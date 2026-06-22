"use client";

import { useEffect } from "react";

type WhatsAppQrRefreshProps = {
  status?: string | null;
};

export function WhatsAppQrRefresh({ status }: WhatsAppQrRefreshProps) {
  useEffect(() => {
    if (status !== "CONNECTING" && status !== "QR_READY") {
      return;
    }

    const timer = window.setInterval(() => {
      const activeElement = document.activeElement;
      const isEditing =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;

      if (isEditing) {
        return;
      }

      window.location.reload();
    }, 12000);

    return () => window.clearInterval(timer);
  }, [status]);

  return null;
}
