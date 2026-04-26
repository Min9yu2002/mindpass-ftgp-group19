"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalPortalProps = {
  children: ReactNode;
};

export default function ModalPortal({ children }: ModalPortalProps) {
  const portalRoot = typeof document === "undefined" ? null : document.body;

  if (!portalRoot) {
    return null;
  }

  return createPortal(children, portalRoot);
}
