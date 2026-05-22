/**
 * Parity tests against the Python reference (src/ontoloviz/core.py).
 *
 * Fixtures are produced by tests/parity/generate_fixtures.py at the repo root.
 * Regenerate with:
 *
 *     uv run python tests/parity/generate_fixtures.py
 *
 * Each fixture covers one combination of (template, mode, level, enabled).
 * This file loads the corresponding example TSV, runs the TS pipeline
 * (parseTsv → propagateCounts), and asserts that every node's count matches
 * the Python-derived expectation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseTsv } from "../../src/lib/ontology/parse";
import {
  propagateCounts,
  type CountPropagationMode,
} from "../../src/lib/ontology/propagate";

interface ParityFixture {
  readonly case: string;
  readonly kind: "atc" | "mesh";
  readonly settings: {
    readonly enabled: boolean;
    readonly countMode: CountPropagationMode;
    readonly level: number;
  };
  readonly subtrees: Record<string, Record<string, number>>;
}

const REPO_ROOT = join(__dirname, "..", "..", "..");
const FIXTURE_DIR = join(REPO_ROOT, "web", "tests", "fixtures", "parity");
const TEMPLATES = join(REPO_ROOT, "templates");

const FIXTURE_TO_TEMPLATE: Record<ParityFixture["kind"], string> = {
  atc: "atc_example_covid_drugs_experimental.tsv",
  mesh: "mesh_example_pubmed_mapped.tsv",
};

const fixtureFiles = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("parity vs core.py — count propagation", () => {
  if (fixtureFiles.length === 0) {
    it.skip("no fixtures present — run `uv run python tests/parity/generate_fixtures.py`", () => {});
    return;
  }

  for (const file of fixtureFiles) {
    const fixture: ParityFixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, file), "utf-8"),
    );
    const templatePath = join(TEMPLATES, FIXTURE_TO_TEMPLATE[fixture.kind]);

    it(`matches ${fixture.case}`, () => {
      const ontology = parseTsv(readFileSync(templatePath, "utf-8"));
      const result = propagateCounts(ontology, fixture.settings);

      const actual: Record<string, Record<string, number>> = {};
      for (const [rootId, subtree] of result.subtrees) {
        actual[rootId] = {};
        for (const [id, node] of subtree.nodes) {
          actual[rootId][id] = node.count;
        }
      }

      // Roots present in both: same.
      expect(Object.keys(actual).sort()).toEqual(
        Object.keys(fixture.subtrees).sort(),
      );

      for (const [rootId, expectedSubtree] of Object.entries(fixture.subtrees)) {
        const actualSubtree = actual[rootId]!;
        const expectedIds = Object.keys(expectedSubtree).sort();
        const actualIds = Object.keys(actualSubtree).sort();
        expect(actualIds).toEqual(expectedIds);

        for (const id of expectedIds) {
          expect(
            actualSubtree[id],
            `${fixture.case} · subtree ${rootId} · node ${id}`,
          ).toBe(expectedSubtree[id]);
        }
      }
    });
  }
});
