/**
 * Color-propagation parity tests against the Python reference.
 *
 * Fixtures are produced by tests/parity/generate_fixtures.py and live in
 * web/tests/fixtures/parity-color/. Each fixture pins the full pipeline:
 *
 *   parseTsv  →  propagateCounts (mode "all")  →  propagateColors (per case)
 *
 * Color matching is done as exact hex-string comparison; both sides use
 * Math.trunc / Python int() truncation and Plotly-compatible linear RGB
 * interpolation, so canonical agreement is the bar.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseTsv } from "../../src/lib/ontology/parse";
import { propagateCounts } from "../../src/lib/ontology/propagate";
import {
  propagateColors,
  type ColorPropagationMode,
  type ColorPropagationSettings,
} from "../../src/lib/ontology/color";

interface ColorFixture {
  readonly case: string;
  readonly kind: "atc" | "mesh";
  readonly settings: {
    readonly enabled: boolean;
    readonly colorMode: ColorPropagationMode;
    readonly level: number;
  };
  readonly subtrees: Record<string, Record<string, string>>;
}

const REPO_ROOT = join(__dirname, "..", "..", "..");
const FIXTURE_DIR = join(REPO_ROOT, "web", "tests", "fixtures", "parity-color");
const TEMPLATES = join(REPO_ROOT, "templates");

const FIXTURE_TO_TEMPLATE: Record<ColorFixture["kind"], string> = {
  atc: "atc_example_covid_drugs_experimental.tsv",
  mesh: "mesh_example_pubmed_mapped.tsv",
};

const STOPS = [
  [0, "#FFFFFF"],
  [0.2, "#403C53"],
  [1, "#C33D35"],
] as const;
const DEFAULT_COLOR = "#FFFFFF";

const fixtureFiles = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

describe("parity vs core.py — color propagation", () => {
  if (fixtureFiles.length === 0) {
    it.skip("no fixtures present — run `uv run python tests/parity/generate_fixtures.py`", () => {});
    return;
  }

  for (const file of fixtureFiles) {
    const fixture: ColorFixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, file), "utf-8"),
    );
    const templatePath = join(TEMPLATES, FIXTURE_TO_TEMPLATE[fixture.kind]);

    it(`matches ${fixture.case}`, () => {
      const parsed = parseTsv(readFileSync(templatePath, "utf-8"));
      // Fixtures are generated with countMode "all", level 0.
      const withCounts = propagateCounts(parsed, {
        enabled: true,
        countMode: "all",
        level: 0,
      });
      const settings: ColorPropagationSettings = {
        enabled: fixture.settings.enabled,
        mode: fixture.settings.colorMode,
        level: fixture.settings.level,
        colorScale: STOPS as unknown as ColorPropagationSettings["colorScale"],
        defaultColor: DEFAULT_COLOR,
      };
      const result = propagateColors(withCounts, settings);

      const actual: Record<string, Record<string, string>> = {};
      for (const [rootId, subtree] of result.subtrees) {
        actual[rootId] = {};
        for (const [id, node] of subtree.nodes) {
          actual[rootId][id] = node.color;
        }
      }

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
