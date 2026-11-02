export const Missing = ({ children = "Not found" }: { children?: string }) => (
  <span className="text-muted-foreground italic">{children}</span>
);
