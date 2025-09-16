import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const transports = new Map<string, Transport>();

export function setTransport(key: string, transport: Transport): void {
  transports.set(key, transport);
}

export function getTransport<T extends Transport = Transport>(
  key: string,
): T | undefined {
  return transports.get(key) as T | undefined;
}

export function deleteTransport<T extends Transport = Transport>(
  key: string,
): T | undefined {
  const transport = transports.get(key) as T | undefined;
  if (transport) {
    transports.delete(key);
  }
  return transport;
}
