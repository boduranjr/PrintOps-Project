import { useEffect, useMemo, useState } from "react";
import { Card, SimpleGrid, Title, Text, Group, Badge } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import api from "../api";

function Metric({ label, value }) {
  return (
    <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
      <Text c="dimmed" fz={12} fw={700}>{label}</Text>
      <Text fz={28} fw={900} mt={6}>{value}</Text>
    </Card>
  );
}

function toChartData(obj) {
  return Object.entries(obj || {}).map(([name, value]) => ({ name, value }));
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await api.get("/reports");
      setData(res.data);
    })();
  }, []);

  const statusData = useMemo(() => toChartData(data?.byStatus), [data]);
  const typeData = useMemo(() => toChartData(data?.byType), [data]);
  const priorityData = useMemo(() => toChartData(data?.byPriority), [data]);

  if (!data) return <Text c="dimmed">Loading…</Text>;

  return (
    <div style={{ maxWidth: 1100 }}>
      <Group justify="space-between" mb="md">
        <Title order={2}>Analytics</Title>
        <Badge variant="light">{new Date(data.generatedAt).toLocaleString()}</Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mb="md">
        <Metric label="Total Jobs" value={data.summary.total} />
        <Metric label="Overdue" value={data.summary.overdue} />
        <Metric label={`Due Soon (≤ ${data.summary.dueSoonDays} days)`} value={data.summary.dueSoon} />
        <Metric label="System" value="Operational" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <Title order={4} mb="sm">Jobs by Status</Title>
          <BarChart
            h={260}
            data={statusData}
            dataKey="name"
            series={[{ name: "value" }]}
            withLegend={false}
          />
        </Card>

        <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <Title order={4} mb="sm">Jobs by Type</Title>
          <BarChart
            h={260}
            data={typeData}
            dataKey="name"
            series={[{ name: "value" }]}
            withLegend={false}
          />
        </Card>

        <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <Title order={4} mb="sm">Priority Breakdown</Title>
          <BarChart
            h={260}
            data={priorityData}
            dataKey="name"
            series={[{ name: "value" }]}
            withLegend={false}
          />
        </Card>
      </SimpleGrid>
    </div>
  );
}
