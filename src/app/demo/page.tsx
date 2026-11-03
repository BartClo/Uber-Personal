"use client";

import dynamic from "next/dynamic";

const DemoApp = dynamic(() => import("./DemoApp"), {
  ssr: false,
  loading: () => <p role="status">Cargando…</p>,
});

export default function DemoPage() {
  return <DemoApp />;
}
