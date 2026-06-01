import { afterEach, describe, expect, it, vi } from "vitest";

import { withBase } from "../../src/lib/basePath";
import { fetchSession } from "../../src/lib/ontology/obo";

const WIRE_ONTOLOGY = {
  format: "parent-based",
  countLabel: "Counts",
  subtrees: {
    root1: {
      rootId: "root1",
      nodes: {
        root1: { id: "root1", parent: "", label: "Root", count: 0, level: 0 },
        child1: {
          id: "child1",
          parent: "root1",
          label: "Child A",
          count: 12,
          level: 1,
        },
      },
    },
  },
  nodeCount: 2,
  warnings: [],
};

describe("fetchSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a handoff ontology and converts it to the Map-based model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => WIRE_ONTOLOGY,
    });
    vi.stubGlobal("fetch", fetchMock);

    const ontology = await fetchSession("abc123");

    expect(fetchMock).toHaveBeenCalledWith(withBase("/api/ontology/abc123"), {});
    expect(ontology.nodeCount).toBe(2);
    expect(ontology.subtrees.get("root1")?.nodes.get("child1")?.count).toBe(12);
  });

  it("url-encodes the session id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => WIRE_ONTOLOGY,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSession("a/b c");

    expect(fetchMock).toHaveBeenCalledWith(withBase("/api/ontology/a%2Fb%20c"), {});
  });

  it("throws with the backend detail on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "unknown or expired session" }),
      }),
    );

    await expect(fetchSession("missing")).rejects.toThrow("unknown or expired session");
  });

  it("falls back to the status code when the error body is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(fetchSession("boom")).rejects.toThrow("HTTP 500");
  });
});
