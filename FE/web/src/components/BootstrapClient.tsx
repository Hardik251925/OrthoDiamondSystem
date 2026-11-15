"use client";
import { useEffect } from "react";

/** Loads Bootstrap's JS bundle (carousel, accordion, collapse) in the browser only. */
export function BootstrapClient() {
  useEffect(() => {
    void import("bootstrap/dist/js/bootstrap.bundle.min.js");
  }, []);
  return null;
}
