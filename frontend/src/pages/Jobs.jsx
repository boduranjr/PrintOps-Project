import { useEffect, useState } from "react";
import {
  Title,
  Group,
  Button,
  Card,
  Table,
  Badge,
  Text,
  TextInput,
  Select,
  Modal,
  Stack,
  Textarea,
  ActionIcon,
  Pagination,
  NumberInput,
} from "@mantine/core";

import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconDownload,
  IconPlayerPlay,
  IconCheck,
  IconHandStop,
} from "@tabler/icons-react";

import api from "../api";
import { getUser } from "../auth";

const STATUSES = ["Scheduled", "In Progress", "Completed", "On Hold"];
const TYPES = ["Print", "Bindery", "Shipping", "Other"];
const PRIORITIES = ["Low", "Normal", "High", "Rush"];

/** Safely convert Date|string|null -> YYYY-MM-DD (or "") */
function toIsoDate(value) {
  if (!value) return "";
  // If Mantine gives us a Date
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  // If Mantine gives us a string like "2026-01-13"
  if (typeof value === "string") {
    // normalize if already ISO-ish
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

/** Convert stored YYYY-MM-DD -> Date|null for the picker */
function isoToDate(iso) {
  if (!iso) return null;
  // force local midnight so it doesn't shift a day
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function badgeColorForDue(dateStr) {
  if (!dateStr) return "gray";
  const today = new Date();
  const due = new Date(dateStr + "T00:00:00");
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((due - start) / 86400000);

  if (diff < 0) return "red";
  if (diff <= 2) return "yellow";
  return "gray";
}

export default function Jobs() {
  const user = getUser();
  const isAdmin = user?.role === "admin";

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");

  const [data, setData] = useState({ items: [], total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    job_code: "",
    customer: "",
    due_date: "",
    job_type: "Print",
    status: "Scheduled",
    priority: "Normal",
    quantity: 0,
    notes: "",
  });

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const res = await api.get("/jobs", {
        params: { page: nextPage, page_size: pageSize, q, status, type },
      });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, type]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function openAdd() {
    setEditing(null);
    setForm({
      job_code: "",
      customer: "",
      due_date: "",
      job_type: "Print",
      status: "Scheduled",
      priority: "Normal",
      quantity: 0,
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(job) {
    setEditing(job);
    setForm({
      job_code: job.job_code,
      customer: job.customer || "",
      due_date: job.due_date || "",
      job_type: job.job_type || "Print",
      status: job.status || "Scheduled",
      priority: job.priority || "Normal",
      quantity: job.quantity || 0,
      notes: job.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    try {
      if (!form.job_code || !form.due_date) {
        notifications.show({
          color: "red",
          title: "Missing fields",
          message: "Job code + due date are required.",
        });
        return;
      }

      if (editing) {
        await api.put(`/jobs/${editing.id}`, form);
        notifications.show({ title: "Updated", message: "Job updated." });
      } else {
        await api.post("/jobs", form);
        notifications.show({ title: "Created", message: "Job created." });
      }

      setOpen(false);
      await load(page);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Save failed",
        message: err?.response?.data?.error || "Could not save",
      });
    }
  }

  async function remove(job) {
    if (!isAdmin) {
      notifications.show({
        color: "red",
        title: "Admin only",
        message: "Only admins can delete jobs.",
      });
      return;
    }
    if (!confirm(`Delete ${job.job_code}?`)) return;

    try {
      await api.delete(`/jobs/${job.id}`);
      notifications.show({ title: "Deleted", message: "Job deleted." });
      await load(page);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Delete failed",
        message: err?.response?.data?.error || "Could not delete",
      });
    }
  }

  async function setStatusQuick(job, nextStatus) {
    try {
      await api.put(`/jobs/${job.id}`, { status: nextStatus });
      notifications.show({ title: "Updated", message: `Status set to ${nextStatus}` });
      await load(page);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Update failed",
        message: err?.response?.data?.error || "Could not update status",
      });
    }
  }

async function exportCsv() {
  try {
    const res = await api.get("/jobs/export", {
      params: { q, status, type },
      responseType: "blob", // 👈 critical
    });

    const blob = new Blob([res.data], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "jobs_export.csv";
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    notifications.show({
      color: "red",
      title: "Export failed",
      message: err?.response?.data?.error || "Could not export CSV",
    });
  }
}


  return (
    <div style={{ maxWidth: 1200 }}>
      <Group justify="space-between" mb="md">
        <Title order={2}>Jobs</Title>
        <Group>
          <Button variant="light" leftSection={<IconDownload size={18} />} onClick={exportCsv} radius="md">
            Export CSV
          </Button>
          <Button leftSection={<IconPlus size={18} />} onClick={openAdd} radius="md">
            Add Job
          </Button>
        </Group>
      </Group>

      <Card
        radius="lg"
        p="lg"
        mb="md"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <Group grow>
          <TextInput label="Search" placeholder="job code or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select label="Status" value={status} onChange={setStatus} data={["All", ...STATUSES]} />
          <Select label="Type" value={type} onChange={setType} data={["All", ...TYPES]} />
        </Group>
      </Card>

      <Card
        radius="lg"
        p="lg"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        {loading ? (
          <Text c="dimmed">Loading…</Text>
        ) : (
          <>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Due</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Qty</Table.Th>
                  <Table.Th style={{ width: 200 }}>Workflow</Table.Th>
                  <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {data.items.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text c="dimmed">No jobs found.</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  data.items.map((j) => (
                    <Table.Tr key={j.id}>
                      <Table.Td>
                        <Text fw={900}>{j.job_code}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed">{j.customer || "-"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={badgeColorForDue(j.due_date)} variant="light">
                          {j.due_date || "-"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">{j.job_type}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge>{j.status}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">{j.priority || "Normal"}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="outline">
                          {j.quantity || 0}
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        <Group gap={6}>
                          <ActionIcon
                            variant="light"
                            onClick={() => setStatusQuick(j, "In Progress")}
                            disabled={j.status === "In Progress"}
                            title="Start"
                          >
                            <IconPlayerPlay size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            onClick={() => setStatusQuick(j, "Completed")}
                            disabled={j.status === "Completed"}
                            title="Complete"
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            onClick={() => setStatusQuick(j, "On Hold")}
                            disabled={j.status === "On Hold"}
                            title="Hold"
                          >
                            <IconHandStop size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>

                      <Table.Td>
                        <Group gap={6}>
                          <ActionIcon variant="light" onClick={() => openEdit(j)} title="Edit">
                            <IconPencil size={16} />
                          </ActionIcon>
                          <ActionIcon color="red" variant="light" onClick={() => remove(j)} title="Delete">
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>

            <Group justify="space-between" mt="md">
              <Text c="dimmed">
                {data.total === 0
                  ? "Showing 0"
                  : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + data.items.length} of ${data.total}`}
              </Text>
              <Pagination value={page} onChange={setPage} total={data.total_pages} />
            </Group>
          </>
        )}
      </Card>

      <Modal opened={open} onClose={() => setOpen(false)} title={editing ? "Edit job" : "Add job"} radius="lg" centered>
        <Stack>
          <TextInput
            label="Job Code"
            value={form.job_code}
            onChange={(e) => setForm({ ...form, job_code: e.target.value })}
            required
          />

          <TextInput label="Customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />

          <DateInput
            label="Due Date"
            placeholder="Pick a date"
            value={isoToDate(form.due_date)}
            onChange={(value) => setForm((p) => ({ ...p, due_date: toIsoDate(value) }))}
            popoverProps={{ withinPortal: true }}
            required
          />

          <Group grow>
            <Select label="Type" value={form.job_type} onChange={(v) => setForm({ ...form, job_type: v || "Print" })} data={TYPES} />
            <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v || "Scheduled" })} data={STATUSES} />
          </Group>

          <Group grow>
            <Select
              label="Priority"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v || "Normal" })}
              data={PRIORITIES}
            />
            <NumberInput
              label="Quantity"
              value={form.quantity}
              onChange={(v) => setForm({ ...form, quantity: Number(v || 0) })}
              min={0}
            />
          </Group>

          <Textarea label="Notes" minRows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button onClick={save} radius="md">
            Save
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
