"""Side-effect import: registers all batch approve handlers.

Importing this module triggers the @register_approve_handler decorators
in each handler file, populating routes/tokens._APPROVE_HANDLERS."""
from beatos_http.handlers import lifecycle  # noqa: F401
