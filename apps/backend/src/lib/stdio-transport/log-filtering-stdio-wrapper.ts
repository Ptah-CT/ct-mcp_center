import { ChildProcess, spawn } from "child_process";

import { logger } from "../logging/logfire";

/**
 * STDIO Wrapper with Log Filtering
 *
 * Wraps STDIO-based MCP servers that send log output over stdout instead of stderr.
 * Filters out non-JSON-RPC messages and forwards only valid JSON-RPC to the client.
 *
 * This is specifically needed for tools like Serena, Claude-Code, and OpenCode
 * that send INFO/DEBUG logs over stdout, breaking JSON-RPC communication.
 */
export class LogFilteringStdioWrapper {
  private process: ChildProcess | null = null;
  private buffer: string = "";

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
    private onMessage: (message: string) => void,
    private onError: (error: Error) => void,
    private onClose: (code: number | null, signal: string | null) => void,
  ) {}

  /**
   * Start the wrapped STDIO process
   */
  async start(): Promise<void> {
    try {
      this.process = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
        throw new Error("Failed to create stdio pipes for wrapped process");
      }

      // Handle stdout with JSON-RPC filtering
      this.process.stdout.on("data", (chunk: Buffer) => {
        this.handleStdoutData(chunk.toString("utf-8"));
      });

      // Forward stderr to logfire (contains actual errors)
      this.process.stderr.on("data", (chunk: Buffer) => {
        const errorOutput = chunk.toString("utf-8").trim();
        if (errorOutput) {
          logger.warn("Wrapped STDIO process stderr", {
            command: this.command,
            args: this.args,
            output: errorOutput,
          });
        }
      });

      // Handle process events
      this.process.on("close", (code, signal) => {
        logger.info("Wrapped STDIO process closed", {
          command: this.command,
          code,
          signal,
        });
        this.onClose(code, signal);
      });

      this.process.on("error", (error) => {
        logger.error("Wrapped STDIO process error", error, {
          command: this.command,
          args: this.args,
        });
        this.onError(error);
      });

      logger.info("Started log-filtering STDIO wrapper", {
        command: this.command,
        args: this.args,
        pid: this.process.pid,
      });
    } catch (error) {
      logger.error(
        "Failed to start log-filtering STDIO wrapper",
        error as Error,
        {
          command: this.command,
          args: this.args,
        },
      );
      throw error;
    }
  }

  /**
   * Handle stdout data with JSON-RPC filtering
   */
  private handleStdoutData(data: string): void {
    this.buffer += data;

    // Process complete lines
    const lines = this.buffer.split("\\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check if line looks like JSON-RPC
      if (this.isJsonRpcMessage(trimmedLine)) {
        // Forward valid JSON-RPC messages
        this.onMessage(trimmedLine);
      } else {
        // Filter out log messages - send to logfire instead
        this.handleFilteredLogMessage(trimmedLine);
      }
    }
  }

  /**
   * Check if a line is a valid JSON-RPC message
   */
  private isJsonRpcMessage(line: string): boolean {
    try {
      const parsed = JSON.parse(line);

      // Must have jsonrpc field
      if (!parsed.jsonrpc || parsed.jsonrpc !== "2.0") {
        return false;
      }

      // Must be either request, response, or notification
      const hasMethod = "method" in parsed;
      const hasResult = "result" in parsed;
      const hasError = "error" in parsed;
      const hasId = "id" in parsed;

      // Request: method + params + id
      // Response: (result OR error) + id
      // Notification: method + params (no id)
      return (
        (hasMethod && (hasId || !hasId)) || ((hasResult || hasError) && hasId)
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle filtered log messages (send to logfire)
   */
  private handleFilteredLogMessage(line: string): void {
    // Try to parse log level from common patterns
    const logPatterns = [
      /^(DEBUG|INFO|WARNING|ERROR|CRITICAL)\\s+/,
      /^\\[(DEBUG|INFO|WARNING|ERROR|CRITICAL)\\]/,
      /\\s(DEBUG|INFO|WARNING|ERROR|CRITICAL)\\s/,
    ];

    let logLevel = "info";
    for (const pattern of logPatterns) {
      const match = line.match(pattern);
      if (match) {
        logLevel = match[1].toLowerCase();
        break;
      }
    }

    // Send to logfire based on detected level
    switch (logLevel.toLowerCase()) {
      case "debug":
        logger.debug("Filtered STDIO output", {
          source: this.command,
          message: line,
        });
        break;
      case "warning":
        logger.warn("Filtered STDIO output", {
          source: this.command,
          message: line,
        });
        break;
      case "error":
      case "critical":
        logger.error("Filtered STDIO output", new Error(line), {
          source: this.command,
          message: line,
        });
        break;
      default:
        logger.info("Filtered STDIO output", {
          source: this.command,
          message: line,
        });
        break;
    }
  }

  /**
   * Send data to the wrapped process stdin
   */
  send(data: string): void {
    if (!this.process || !this.process.stdin) {
      throw new Error("Wrapped process not started or stdin not available");
    }

    this.process.stdin.write(data + "\\n");
  }

  /**
   * Close the wrapped process
   */
  async close(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.once("close", () => resolve());

      // Try graceful shutdown first
      if (this.process.stdin) {
        this.process.stdin.end();
      }

      // Force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);

      this.process.kill("SIGTERM");
    });
  }
}
