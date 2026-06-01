"""Ontology handoff endpoints.

Lets an external application push a fully-built ontology to the backend and
hand the user a link that renders it. Two surfaces:

  * ``POST /api/ontology`` — accept an :class:`Ontology` payload, store it
    under an unguessable id, return ``{"id": ...}``.
  * ``GET  /api/ontology/{session_id}`` — return a previously stored ontology,
    or 404 if it is unknown or expired.

The store is an in-process TTL + LRU map — handoffs are transient and meant to
be consumed within seconds of creation. Nothing is persisted to disk; a
process restart drops all pending handoffs.

There is no authentication. The id is a 128-bit token from
``secrets.token_urlsafe`` and acts as a capability: possession of the link is
the only access control. Deploy behind your own auth if you expose this to an
untrusted network. ``_MAX_SESSIONS`` bounds the *number* of retained handoffs
(not the byte size of any single payload — Pydantic validation aside, the app
already accepts large ontologies via ``/api/obo``).

The store lives in one process. Run the backend single-worker (the default):
under multiple workers each holds its own ``_store``, so a handoff created on
one worker is invisible to the others and would intermittently 404.
"""

from __future__ import annotations

import secrets
from collections import OrderedDict
from dataclasses import dataclass
from time import monotonic

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..schemas import Ontology

router = APIRouter(tags=["ontology"])

# Handoffs are consumed almost immediately; an hour is generous headroom for
# "POST, then open the browser tab". Past the TTL an id returns 404.
_SESSION_TTL_SECONDS = 60 * 60
# Bounds worst-case memory to roughly (max payload × this). The oldest handoff
# is evicted once the cap is exceeded.
_MAX_SESSIONS = 32
# 16 bytes → 128-bit capability token, URL-safe base64.
_TOKEN_BYTES = 16


@dataclass(frozen=True)
class _Entry:
    ontology: Ontology
    inserted_at: float


_store: OrderedDict[str, _Entry] = OrderedDict()


class CreateOntologyResponse(BaseModel):
    """Result of storing an ontology for handoff."""

    id: str


def _reset_store() -> None:
    """Test helper — drop all pending handoffs."""
    _store.clear()


def _evict_expired() -> None:
    """Drop entries past their TTL. Cheap: the store is bounded small.

    Uses the same strict ``> TTL`` boundary as :func:`get_ontology` so an entry
    aged exactly at the TTL is treated identically by both paths.
    """
    cutoff = monotonic() - _SESSION_TTL_SECONDS
    stale = [key for key, entry in _store.items() if entry.inserted_at < cutoff]
    for key in stale:
        _store.pop(key, None)


@router.post("", response_model=CreateOntologyResponse)
def create_ontology(payload: Ontology) -> CreateOntologyResponse:
    """Store an ontology and return its handoff id.

    The body is validated against the :class:`Ontology` schema, so a malformed
    tree is rejected with 422 before anything is stored.
    """
    _evict_expired()
    session_id = secrets.token_urlsafe(_TOKEN_BYTES)
    _store[session_id] = _Entry(ontology=payload, inserted_at=monotonic())
    _store.move_to_end(session_id)
    while len(_store) > _MAX_SESSIONS:
        _store.popitem(last=False)
    return CreateOntologyResponse(id=session_id)


@router.get("/{session_id}", response_model=Ontology)
def get_ontology(session_id: str) -> Ontology:
    """Return a stored ontology, or 404 if the id is unknown or expired."""
    entry = _store.get(session_id)
    if entry is None or monotonic() - entry.inserted_at > _SESSION_TTL_SECONDS:
        _store.pop(session_id, None)
        raise HTTPException(status_code=404, detail="unknown or expired session")
    _store.move_to_end(session_id)  # LRU touch: an actively-read handoff stays warm
    return entry.ontology
