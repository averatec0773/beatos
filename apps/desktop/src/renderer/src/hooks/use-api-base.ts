import { useEffect, useState } from "react";

export function useApiBase(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    void window.beatos.getApiBase().then(setBase);
  }, []);
  return base;
}
