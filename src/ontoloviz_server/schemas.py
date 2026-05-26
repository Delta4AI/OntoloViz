"""Pydantic schemas mirroring the TypeScript Ontology data model.

Keep field names in sync with `web/src/lib/ontology/types.ts`. The frontend
deserializes these directly into the same shape it builds from TSV parsing,
so propagation and rendering work identically regardless of the source.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OntologyNode(BaseModel):
    """One ontology node. Mirrors TS `Node`."""

    id: str
    parent: str = ""
    label: str = ""
    description: str = ""
    comment: str = ""
    count: float = 0.0
    color: str = ""
    level: int
    mesh_id: str = Field(default="", alias="meshId")
    synthetic: bool = False

    model_config = {"populate_by_name": True}


class OntologySubtree(BaseModel):
    """A connected subtree. Mirrors TS `Subtree`."""

    root_id: str = Field(alias="rootId")
    nodes: dict[str, OntologyNode]

    model_config = {"populate_by_name": True}


class Ontology(BaseModel):
    """A parsed ontology with one or more subtrees. Mirrors TS `Ontology`."""

    format: str
    count_label: str = Field(default="", alias="countLabel")
    subtrees: dict[str, OntologySubtree]
    node_count: int = Field(alias="nodeCount")
    warnings: list[str] = []

    model_config = {"populate_by_name": True}


class ParseObooRequest(BaseModel):
    """POST body for /api/obo/parse."""

    text: str
    """Raw OBO file contents."""
