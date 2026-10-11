import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const dir = resolve(".private");
const store = resolve(dir, "remio-notes-release.jks");
const properties = resolve(dir, "android-signing.properties");
if (existsSync(store) || existsSync(properties))
  throw Error(
    "Signing material already exists. Preserve it for future updates.",
  );
mkdirSync(dir, { recursive: true });
const password = randomBytes(32).toString("hex");
const keytool = process.env.JAVA_HOME
  ? resolve(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool",
    )
  : "keytool";
const result = spawnSync(
  keytool,
  [
    "-genkeypair",
    "-keystore",
    store,
    "-storepass:env",
    "REMIO_KEY_PASSWORD",
    "-keypass:env",
    "REMIO_KEY_PASSWORD",
    "-alias",
    "remio-notes",
    "-keyalg",
    "RSA",
    "-keysize",
    "3072",
    "-validity",
    "10000",
    "-dname",
    "CN=remio-notes Android, O=remio-notes",
    "-noprompt",
  ],
  { env: { ...process.env, REMIO_KEY_PASSWORD: password }, stdio: "inherit" },
);
if (result.status !== 0) throw Error("Could not generate signing key");
writeFileSync(
  properties,
  `storeFile=../../.private/remio-notes-release.jks\nstorePassword=${password}\nkeyAlias=remio-notes\nkeyPassword=${password}\n`,
);
console.log(
  "Signing key saved in .private/. Keep both files securely for future APK updates; never publish them.",
);
