import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const variant = process.argv[2];
if (variant !== "debug" && variant !== "release")
  throw Error("Choose debug or release");
const windows = process.platform === "win32";
const result = spawnSync(
  windows ? "gradlew.bat" : "./gradlew",
  [variant === "debug" ? "assembleDebug" : "assembleRelease"],
  { cwd: resolve("android"), shell: windows, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
