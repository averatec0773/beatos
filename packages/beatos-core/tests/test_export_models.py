from beatos_core.export.models import ExportField, ExportResult


def test_export_field_defaults():
    f = ExportField(key="title", label="标题", value="My Beat")
    assert f.options == []
    assert f.note is None


def test_export_result_shape():
    r = ExportResult(platform="netease", fields=[ExportField(key="bpm", label="BPM", value="140")])
    dumped = r.model_dump()
    assert dumped["platform"] == "netease"
    assert dumped["fields"][0]["key"] == "bpm"
