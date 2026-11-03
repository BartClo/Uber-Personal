import { describe, expect, it } from "vitest";
import { isStale } from "@/domain/freshness";
import { demoDrivers, demoTrips, SILENT_TAXI, stepDrivers } from "./demoData";

const now = new Date("2026-11-03T12:00:00.000Z");

describe("demoData", () => {
  it("covers the review-focus cases: no location, stale signal, offline, trip without coords", () => {
    const drivers = demoDrivers(now);
    const trips = demoTrips(now, drivers);
    expect(drivers.some((d) => d.lat === null)).toBe(true);
    expect(drivers.some((d) => d.status === "offline")).toBe(true);
    expect(
      isStale(
        drivers.find((d) => d.taxiNumber === SILENT_TAXI)!.lastSeenAt,
        now,
      ),
    ).toBe(true);
    expect(
      trips.some((t) => t.status === "pending" && t.pickupLat === null),
    ).toBe(true);
    expect(
      trips
        .filter((t) => t.driverId !== null)
        .every((t) => drivers.some((d) => d.id === t.driverId)),
    ).toBe(true);
  });

  it("stepDrivers moves drivers with signal and refreshes lastSeenAt, but not the silent or offline ones", () => {
    const drivers = demoDrivers(now);
    const later = new Date(now.getTime() + 5_000);
    const next = stepDrivers(drivers, later, () => 1);
    const moved = next.find((d) => d.taxiNumber === "07")!;
    expect(moved.lastSeenAt).toBe(later.toISOString());
    expect(moved.lat).not.toBe(drivers.find((d) => d.taxiNumber === "07")!.lat);
    expect(next.find((d) => d.taxiNumber === SILENT_TAXI)).toEqual(
      drivers.find((d) => d.taxiNumber === SILENT_TAXI),
    );
    expect(next.find((d) => d.status === "offline")).toEqual(
      drivers.find((d) => d.status === "offline"),
    );
  });
});
