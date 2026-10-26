#!/usr/bin/env node
import { homedir } from "node:os";
import { run } from "./cli/main.js";

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  homeDir: homedir(),
  now: () => new Date(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
