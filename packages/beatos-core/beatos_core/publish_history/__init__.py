"""Durable publish history domain (migration 024).

`publish_job` (020) is a hard-deletable live cache; this is the record that
survives it. See `service.py` for the read/write surface.
"""
