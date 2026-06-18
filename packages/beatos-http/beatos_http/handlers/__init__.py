"""Side-effect import: registers all write apply handlers.

Importing this module triggers the @register_apply_handler decorators in each
handler file, populating the beatos_core.approvals registry."""
from beatos_http.handlers import ingest  # noqa: F401
from beatos_http.handlers import licenses  # noqa: F401
from beatos_http.handlers import lifecycle  # noqa: F401
from beatos_http.handlers import list_curation  # noqa: F401
from beatos_http.handlers import metadata  # noqa: F401
from beatos_http.handlers import publish  # noqa: F401  # Pro-gated: registers only when the engine is present
