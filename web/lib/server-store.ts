export type ServerType = "stdio" | "http" | "sse";

export type ServerRecord = {
  id: string;
  name: string;
  endpoint: string;
  type: ServerType;
  createdAt: string;
};

export type ServerLog = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
};

type StoreShape = {
  servers: ServerRecord[];
  logs: Record<string, ServerLog[]>;
};

const globalKey = "__fastmcp_ui_store__";

function getStore(): StoreShape {
  const globalStore = globalThis as typeof globalThis & {
    [globalKey]?: StoreShape;
  };
  if (!globalStore[globalKey]) {
    globalStore[globalKey] = { servers: [], logs: {} };
  }
  return globalStore[globalKey];
}

export function listServers(): ServerRecord[] {
  return getStore().servers;
}

export function addServer(server: Omit<ServerRecord, "createdAt">): ServerRecord {
  const record: ServerRecord = {
    ...server,
    createdAt: new Date().toISOString()
  };
  const store = getStore();
  store.servers = [record, ...store.servers];
  store.logs[record.id] = [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Server ${record.name} added (${record.type}).`
    }
  ];
  return record;
}

export function removeServer(id: string): boolean {
  const store = getStore();
  const before = store.servers.length;
  store.servers = store.servers.filter((server) => server.id !== id);
  delete store.logs[id];
  return store.servers.length < before;
}

export function getServerLogs(id: string): ServerLog[] {
  const store = getStore();
  if (!store.logs[id]) {
    store.logs[id] = [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: "No logs yet for this server."
      }
    ];
  }
  return store.logs[id];
}

export function appendServerLog(id: string, log: Omit<ServerLog, "id">) {
  const store = getStore();
  const entry: ServerLog = { ...log, id: crypto.randomUUID() };
  store.logs[id] = [entry, ...(store.logs[id] ?? [])].slice(0, 200);
}

