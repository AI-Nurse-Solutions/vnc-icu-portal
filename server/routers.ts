import { authRouter } from "./routers/auth";
import { calendarRouter } from "./routers/calendar";
import { requestsRouter } from "./routers/requests";
import { managerRouter } from "./routers/manager";
import { adminRouter } from "./routers/admin";
import { configRouter } from "./routers/config";
import { managerToolsRouter } from "./routers/managerTools";
import { superAdminRouter } from "./routers/superAdmin";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  calendar: calendarRouter,
  requests: requestsRouter,
  manager: managerRouter,
  admin: adminRouter,
  config: configRouter,
  tools: managerToolsRouter,
  superAdmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;
