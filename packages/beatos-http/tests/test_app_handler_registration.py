"""Regression: the sidecar's startup must register every write tool's apply
handler. The 2PC removal deleted routes/tokens.py, which had carried the
side-effect import of beatos_http.handlers; without it the apply registry was
empty and EVERY write tool failed with "no apply handler" (QA 2026-06-19).

Uses a FRESH interpreter (subprocess) on purpose: an in-process assertion could
pass spuriously if some other test already imported beatos_http.handlers — which
is exactly how the original Phase-1 tests masked this bug.
"""
import subprocess
import sys


def test_sidecar_startup_registers_apply_handlers():
    code = (
        "import beatos_http.app;"  # the sidecar's real startup import
        "from beatos_core.approvals import _APPLY_HANDLERS;"
        "req={'create_tracks','update_tracks','create_list','update_list',"
        "'add_tracks_to_list','remove_tracks_from_list','reorder_list','delete_list',"
        "'trash_tracks','restore_tracks','purge_tracks','attach_assets',"
        "'detach_assets','set_license_tiers','merge_metadata'};"
        "missing=req-set(_APPLY_HANDLERS);"
        "assert not missing, f'unregistered apply handlers: {missing}';"
        "print('OK', len(_APPLY_HANDLERS))"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert r.returncode == 0, f"stdout={r.stdout!r} stderr={r.stderr!r}"
    assert r.stdout.startswith("OK"), r.stdout
