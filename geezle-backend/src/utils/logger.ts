type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const serializeArg = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: isProduction() ? undefined : value.stack
    };
  }
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return value;
};

const write = (level: LogLevel, args: unknown[]) => {
  const payload: Record<string, unknown> = {
    severity: level === 'warn' ? 'WARNING' : level.toUpperCase(),
    time: new Date().toISOString(),
    message:
      args.length === 1 && (typeof args[0] === 'string' || typeof args[0] === 'number')
        ? String(args[0])
        : args.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(serializeArg(entry)))).join(' ')
  };

  if (args.length > 1 || (args.length === 1 && typeof args[0] === 'object')) {
    payload.args = args.map(serializeArg);
  }

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else if (level === 'debug') {
    if (!isProduction()) console.debug(line);
  } else {
    console.log(line);
  }
};

export const logger = {
  info: (...args: any[]) => write('info', args),
  warn: (...args: any[]) => write('warn', args),
  error: (...args: any[]) => write('error', args),
  debug: (...args: any[]) => write('debug', args)
};

export default logger;
