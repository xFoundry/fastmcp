"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ServerRecord = {
  id: string;
  name: string;
  endpoint: string;
  type: "stdio" | "http" | "sse";
  createdAt: string;
  lastCheckAt?: string | null;
  lastCheckStatus?: string | null;
  lastCheckLatencyMs?: number | null;
  lastCheckDetail?: string | null;
  authConfigured?: boolean;
};

type ServerLog = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
};

type NewServerDraft = {
  name: string;
  endpoint: string;
  type: ServerRecord["type"];
  authToken?: string;
};

const emptyDraft: NewServerDraft = {
  name: "",
  endpoint: "",
  type: "http",
  authToken: ""
};

export default function HomePage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draft, setDraft] = useState<NewServerDraft>(emptyDraft);
  const [selectedLogs, setSelectedLogs] = useState<ServerLog[]>([]);
  const [selectedServer, setSelectedServer] = useState<ServerRecord | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<NewServerDraft | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [existingToken, setExistingToken] = useState<string | null>(null);
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  const hasServers = servers.length > 0;
  const sortServers = useMemo(
    () => servers.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [servers]
  );

  const loadServers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/servers", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Failed to load servers.");
        return;
      }
      setErrorMessage(null);
      setServers(data.servers ?? []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const resetDraft = () => {
    setDraft(emptyDraft);
  };

  const handleCreateServer = async () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      return;
    }
    const payload = {
      ...draft,
      authToken: draft.authToken?.trim() || undefined
    };
    const response = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      setErrorMessage(data.error ?? "Failed to add server.");
      return;
    }
    setErrorMessage(null);
    resetDraft();
    setIsDialogOpen(false);
    await loadServers();
  };

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/servers/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setErrorMessage(data.error ?? "Failed to delete server.");
      return;
    }
    setErrorMessage(null);
    await loadServers();
  };

  const handleCheck = async (id: string) => {
    setIsChecking(id);
    try {
      const response = await fetch(`/api/servers/${id}/check`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Check failed.");
        return;
      }
      setErrorMessage(null);
      await loadServers();
    } finally {
      setIsChecking(null);
    }
  };

  const openLogs = async (server: ServerRecord) => {
    const response = await fetch(`/api/servers/${server.id}/logs`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setErrorMessage(data.error ?? "Failed to load logs.");
      return;
    }
    setErrorMessage(null);
    setSelectedLogs(data.logs ?? []);
    setSelectedServer(server);
    setLogsOpen(true);
  };

  const openEdit = (server: ServerRecord) => {
    setEditTargetId(server.id);
    setEditDraft({
      name: server.name,
      endpoint: server.endpoint,
      type: server.type,
      authToken: ""
    });
    setExistingToken(null);
    setIsTokenVisible(false);
    setEditOpen(true);
  };

  const loadToken = async () => {
    if (!editTargetId) {
      return;
    }
    setIsTokenLoading(true);
    try {
      const response = await fetch(`/api/servers/${editTargetId}/token`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "Failed to load token.");
        return;
      }
      setErrorMessage(null);
      setExistingToken(data.authToken ?? null);
      setIsTokenVisible(true);
    } finally {
      setIsTokenLoading(false);
    }
  };

  const copyToken = async () => {
    if (!existingToken) {
      return;
    }
    await navigator.clipboard.writeText(existingToken);
  };

  const handleEdit = async () => {
    if (!editDraft || !editTargetId) {
      return;
    }
    const payload = {
      name: editDraft.name,
      endpoint: editDraft.endpoint,
      type: editDraft.type,
      authToken: editDraft.authToken?.trim() || undefined
    };
    const response = await fetch(`/api/servers/${editTargetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      setErrorMessage(data.error ?? "Failed to update server.");
      return;
    }
    setErrorMessage(null);
    setEditOpen(false);
    setEditDraft(null);
    setEditTargetId(null);
    await loadServers();
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">FastMCP Control Plane</h1>
          <p className="text-sm text-muted-foreground">
            Add MCP servers, manage connections, and inspect recent logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadServers} disabled={isLoading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add server
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add MCP server</DialogTitle>
                <DialogDescription>Register a server endpoint to manage it here.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="server-name">Name</Label>
                  <Input
                    id="server-name"
                    placeholder="Weather API"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="server-endpoint">Endpoint</Label>
                  <Input
                    id="server-endpoint"
                    placeholder="https://example.com/mcp"
                    value={draft.endpoint}
                    onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="server-type">Transport</Label>
                  <select
                    id="server-type"
                    value={draft.type}
                    onChange={(event) =>
                      setDraft({ ...draft, type: event.target.value as ServerRecord["type"] })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="http">HTTP</option>
                    <option value="sse">SSE</option>
                    <option value="stdio">STDIO</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="server-token">API key / bearer token</Label>
                  <Input
                    id="server-token"
                    placeholder="Optional"
                    value={draft.authToken}
                    onChange={(event) => setDraft({ ...draft, authToken: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored in the control plane and used for connectivity checks.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateServer} disabled={!draft.name || !draft.endpoint}>
                  Save server
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      {errorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Registered servers</CardTitle>
          <CardDescription>Manage the MCP endpoints your control plane tracks.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasServers ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No servers yet. Add one to start monitoring.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortServers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell className="text-muted-foreground">{server.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{server.type.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      {server.authConfigured ? (
                        <Badge variant="outline">Auth</Badge>
                      ) : (
                        <Badge variant="muted">No auth</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {server.lastCheckStatus ? (
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={server.lastCheckStatus === "healthy" ? "default" : "destructive"}
                          >
                            {server.lastCheckStatus}
                          </Badge>
                          {server.lastCheckLatencyMs ? (
                            <span className="text-xs text-muted-foreground">
                              {server.lastCheckLatencyMs}ms
                            </span>
                          ) : null}
                          {server.lastCheckDetail ? (
                            <span className="text-xs text-muted-foreground">
                              {server.lastCheckDetail}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="muted">unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(server.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCheck(server.id)}
                        disabled={isChecking === server.id}
                      >
                        {isChecking === server.id ? "Checking..." : "Check"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(server)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openLogs(server)}>
                        Logs
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(server.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedServer?.name ?? "Server"} logs</DialogTitle>
            <DialogDescription>Recent activity for this MCP server.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedLogs.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No logs yet.
              </div>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-auto rounded-md border bg-muted/30 p-4 text-xs">
                {selectedLogs.map((log) => (
                  <div key={log.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground">
                      <span>{log.level}</span>
                      <span>·</span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-foreground">{log.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLogsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit MCP server</DialogTitle>
            <DialogDescription>Update the server details and authentication.</DialogDescription>
          </DialogHeader>
          {editDraft ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-endpoint">Endpoint</Label>
                <Input
                  id="edit-endpoint"
                  value={editDraft.endpoint}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, endpoint: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Transport</Label>
                <select
                  id="edit-type"
                  value={editDraft.type}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      type: event.target.value as ServerRecord["type"]
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                  <option value="stdio">STDIO</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-token">API key / bearer token</Label>
                <Input
                  id="edit-token"
                  placeholder="Leave blank to keep existing"
                  value={editDraft.authToken}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, authToken: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Existing token</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={existingToken ?? "Hidden"}
                    readOnly
                    type={isTokenVisible ? "text" : "password"}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadToken}
                    disabled={isTokenLoading}
                  >
                    {isTokenLoading ? "Loading..." : isTokenVisible ? "Refresh" : "Reveal"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={copyToken}
                    disabled={!existingToken}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tokens stay hidden unless you reveal them.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={!editDraft}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

