from importlib.metadata import PackageNotFoundError, version as _pkg_version

from .core import ATCSunburst, MeSHSunburst
from .core_utils import rgb_to_hex, chunks, generate_color_range
from .app import App, run_app

try:
    __version__ = _pkg_version("ontoloviz")
except PackageNotFoundError:
    __version__ = "0.0.0+local"
