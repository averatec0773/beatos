import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";

export function configureLogger(): void {
  if (!app.isPackaged) {
    const repoLogs = path.resolve(app.getAppPath(), "logs");
    log.transports.file.resolvePathFn = () => path.join(repoLogs, "main.log");
  }
  log.transports.file.maxSize = 10 * 1024 * 1024;
  log.transports.file.level = "info";
  log.transports.console.level = "info";
  log.initialize();
}

export const logger = log;
