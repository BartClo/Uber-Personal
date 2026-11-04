"use client";

import { useEffect, useState } from "react";
import { FakeRepo } from "@/data/fakeRepo";
import { demoDrivers, demoTrips, stepDrivers } from "@/demo/demoData";
import { Dashboard } from "@/ui/Dashboard";
import styles from "./DemoApp.module.css";

const STEP_MS = 3_000;

function createDemoRepo(): FakeRepo {
  const repo = new FakeRepo();
  const now = new Date();
  const drivers = demoDrivers(now);
  repo.seed({ drivers, trips: demoTrips(now, drivers) });
  return repo;
}

/** Panel con datos simulados en memoria: no requiere Supabase. Browser-only. */
export default function DemoApp() {
  const [repo] = useState(createDemoRepo);

  useEffect(() => {
    const id = setInterval(() => {
      void repo.listDrivers().then((current) => {
        repo.seed({ drivers: stepDrivers(current, new Date(), Math.random) });
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [repo]);

  return (
    <>
      <p role="note" className={styles.note}>
        Modo demostración · datos simulados
      </p>
      <Dashboard repo={repo} />
    </>
  );
}
