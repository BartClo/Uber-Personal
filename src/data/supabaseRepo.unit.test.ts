// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Trip } from "../domain/types";
import type { ConnectionState } from "./repo";
import type { TripRow } from "./supabaseMapping";
import { createSupabaseRepo } from "./supabaseRepo";

type StatusCb = (status: string) => void;
type Result = { data: unknown; error: { message: string } | null };

/** Minimal fake of the SupabaseClient surface used by supabaseRepo. */
class FakeChannel {
  handlers: Array<{ table: string; cb: () => void }> = [];
  statusCb: StatusCb | null = null;
  on(_type: string, filter: { table: string }, cb: () => void): this {
    this.handlers.push({ table: filter.table, cb });
    return this;
  }
  subscribe(cb: StatusCb): this {
    this.statusCb = cb;
    return this;
  }
  emitChange(table: string): void {
    for (const h of this.handlers) if (h.table === table) h.cb();
  }
}

class FakeQuery implements PromiseLike<Result> {
  constructor(private readonly result: Promise<Result>) {}
  select(): this {
    return this;
  }
  order(): this {
    return this;
  }
  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.result.then(ok, fail);
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  /** Pending query results per table, consumed in call order. */
  pending: Record<string, Array<(r: Result) => void>> = {};
  removeChannel(c: FakeChannel): Promise<"ok"> {
    queueMicrotask(() => c.statusCb?.("CLOSED"));
    return Promise.resolve("ok");
  }
  channel(): FakeChannel {
    const c = new FakeChannel();
    this.channels.push(c);
    return c;
  }
  from(table: string): FakeQuery {
    const result = new Promise<Result>((resolve) => {
      (this.pending[table] ??= []).push(resolve);
    });
    return new FakeQuery(result);
  }
  rpc(): Promise<Result> {
    return Promise.resolve({ data: null, error: { message: "unused" } });
  }
  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

function tripRow(id: string, name: string): TripRow {
  return {
    id,
    source: "admin",
    customer_name: name,
    customer_phone: "1",
    pickup_address: "A",
    pickup_lat: null,
    pickup_lng: null,
    dropoff_address: "B",
    status: "pending",
    driver_id: null,
    created_at: "2026-11-02T10:00:00.000Z",
    assigned_at: null,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createSupabaseRepo (fake client)", () => {
  it("a removed channel's late CLOSED does not mark the new channel as reconnecting", async () => {
    const fake = new FakeClient();
    const repo = createSupabaseRepo(fake.asClient());
    const off1 = repo.subscribeConnection(() => {});
    fake.channels[0]?.statusCb?.("SUBSCRIBED");
    off1();

    const states: ConnectionState[] = [];
    repo.subscribeConnection((s) => states.push(s));
    expect(fake.channels).toHaveLength(2);
    fake.channels[1]?.statusCb?.("SUBSCRIBED");
    await flush(); // the old channel's CLOSED fires here
    expect(states).toEqual(["connected"]);
  });

  it("out-of-order re-list responses never deliver an older snapshot after a newer one", async () => {
    const fake = new FakeClient();
    const repo = createSupabaseRepo(fake.asClient());
    const cb = vi.fn<(t: Trip[]) => void>();
    repo.subscribeTrips(cb);
    const ch = fake.channels[0];
    ch?.emitChange("trips");
    ch?.emitChange("trips");
    const [first, second] = fake.pending.trips ?? [];
    second?.({ data: [tripRow("t1", "new")], error: null });
    await flush();
    first?.({ data: [tripRow("t1", "old")], error: null });
    await flush();
    const last = cb.mock.calls[cb.mock.calls.length - 1]?.[0];
    expect(last?.[0]?.customerName).toBe("new");
    expect(cb.mock.calls.every((c) => c[0][0]?.customerName === "new")).toBe(
      true,
    );
  });
});
