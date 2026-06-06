import { useEffect, useState } from "react";

import { platform } from "@/platform";

export function useApiBase(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    void platform.getApiBase().then(setBase);
  }, []);
  return base;
}
