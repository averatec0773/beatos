import { useEffect, useState } from "react";

import { analysis, type BatchJob } from "@/api/analysis";
import { useAnalysisJobStore } from "@/stores/analysis-job";
import { useToastStore } from "@/stores/toast";

export function AnalysisProgressBar() {
  const jobId = useAnalysisJobStore((s) => s.jobId);
  const clear = useAnalysisJobStore((s) => s.clear);
  const [job, setJob] = useState<BatchJob | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const j = await analysis.batchStatus(jobId);
        if (stop) return;
        setJob(j);
        if (j.status === "done") {
          useToastStore
            .getState()
            .show("success", `完成 ${j.done}/${j.total}，填入 BPM ${j.filled_bpm}、Key ${j.filled_key}`);
          clear();
          return;
        }
      } catch {
        if (!stop) clear();
        return;
      }
      if (!stop) window.setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId, clear]);

  if (!jobId || !job) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-text-secondary border-b border-border-subtle bg-bg-row-hover">
      <span>分析中 {job.done}/{job.total}</span>
      {job.current_title && <span className="truncate">{job.current_title}</span>}
    </div>
  );
}
