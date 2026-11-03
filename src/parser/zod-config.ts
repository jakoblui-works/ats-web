import { z } from "zod";

// The site's CSP blocks eval, so zod's one-time `new Function` probe (run when a schema is built)
// would be reported as a violation; it falls back either way. Imported before any schema module.
z.config({ jitless: true });
