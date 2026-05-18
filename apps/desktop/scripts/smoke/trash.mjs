// Trash assertions (v0.0.14): soft-delete + restore round-trip.

export async function assertTrashSoftDeleteRestore(ctx) {
  const { baseUrl, postJson, failures } = ctx;
  try {
    const trashTrack = await postJson("/api/tracks", { title: "trash-test" });
    const delRes = await fetch(`${baseUrl}/api/tracks/${trashTrack.id}`, { method: "DELETE" });
    if (!delRes.ok) {
      failures.push(`trash: soft-delete returned ${delRes.status}`);
    } else {
      const trash = await (await fetch(`${baseUrl}/api/tracks/trash`)).json();
      const foundInTrash = Array.isArray(trash) && trash.some((t) => t.id === trashTrack.id);
      if (!foundInTrash) {
        failures.push(`trash: newly trashed track ${trashTrack.id} not in /api/tracks/trash`);
      } else {
        const restoreRes = await fetch(`${baseUrl}/api/tracks/${trashTrack.id}/restore`, { method: "POST" });
        if (!restoreRes.ok) {
          failures.push(`trash: restore returned ${restoreRes.status}`);
        } else {
          const trash2 = await (await fetch(`${baseUrl}/api/tracks/trash`)).json();
          const stillThere = trash2.some((t) => t.id === trashTrack.id);
          if (stillThere) {
            failures.push(`trash: restored track still appears in trash list`);
          } else {
            console.log("smoke: trash soft-delete + restore PASS");
          }
        }
      }
    }
  } catch (e) {
    failures.push(`trash flow assertion error: ${e.message}`);
  }
}
