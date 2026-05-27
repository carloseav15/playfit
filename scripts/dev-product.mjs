import { spawn } from "node:child_process";

const processes = [];

function run(command, args, env = {}) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  processes.push(child);
  return child;
}

function shutdown(code = 0) {
  processes.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });

  process.exit(code);
}

run("npm", ["run", "dev:proxy"]);
run("npm", ["run", "dev:public"], { VITE_ENABLE_AI: "true" });

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

processes.forEach((child) => {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
});
