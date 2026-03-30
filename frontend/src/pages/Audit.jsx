import { useEffect, useState } from "react";
import { Title, Card, Table, Text, Badge, Group } from "@mantine/core";
import api from "../api";

export default function Audit() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await api.get("/audit", { params: { limit: 100 } });
      setItems(res.data);
    })();
  }, []);

  if (!items) return <Text c="dimmed">Loading…</Text>;

  return (
    <div style={{ maxWidth: 1100 }}>
      <Group justify="space-between" mb="md">
        <Title order={2}>Audit Log</Title>
        <Badge variant="light">Admin only</Badge>
      </Group>

      <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Actor</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Entity</Table.Th>
              <Table.Th>Details</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td><Text c="dimmed">{a.created_at}</Text></Table.Td>
                <Table.Td><Badge variant="light">{a.actor}</Badge></Table.Td>
                <Table.Td><Badge>{a.action}</Badge></Table.Td>
                <Table.Td><Text fw={700}>{a.entity} #{a.entity_id}</Text></Table.Td>
                <Table.Td><Text c="dimmed" lineClamp={1}>{a.detail}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </div>
  );
}
