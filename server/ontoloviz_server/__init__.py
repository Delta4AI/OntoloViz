"""OntoloViz V2 backend."""

from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:
    __version__ = _pkg_version("ontoloviz-server")
except PackageNotFoundError:
    __version__ = "0.0.0+local"
