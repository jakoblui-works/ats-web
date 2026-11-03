import { RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const TryAnother = ({ onReset, children }: { onReset: () => void; children: ReactNode }) => (
  <Button variant="outline" onClick={onReset}>
    <RotateCwIcon aria-hidden />
    {children}
  </Button>
);
