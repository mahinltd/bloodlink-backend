// BloodLink Backend - Console Logger
const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const timestamp = () => new Date().toLocaleString("en-GB", { hour12: false });

const formatArg = (arg) => {
  if (arg instanceof Error) return `\n${arg.stack || arg.message}`;
  if (typeof arg === "object") return `\n${JSON.stringify(arg, null, 2)}`;
  return arg;
};

const log = (color, level, args) => {
  const message = args.map(formatArg).join(" ");
  console.log(
    `${colors.gray}[${timestamp()}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`,
  );
};

const logger = {
  info: (...args) => log(colors.cyan, "INFO", args),
  success: (...args) => log(colors.green, "OK", args),
  warn: (...args) => log(colors.yellow, "WARN", args),
  error: (...args) => log(colors.red, "ERROR", args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== "production")
      log(colors.magenta, "DEBUG", args);
  },
};

module.exports = logger;
