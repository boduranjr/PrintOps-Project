import { useEffect, useState } from "react";
import { Title, Card, TextInput, Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import api from "../api";

export default function Settings() {
  const [settings, setSettings] = useState(null);

  async function load() {
    const res = await api.get("/settings");
    setSettings(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    await api.put("/settings", settings);
    notifications.show({ title: "Saved", message: "Settings updated." });
    await load();
  }

  if (!settings) return <Text c="dimmed">Loading…</Text>;

  return (
    <div style={{ maxWidth: 900 }}>
      <Title order={2} mb="md">Settings</Title>

      <Card radius="lg" p="lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
        <Group grow>
          <TextInput
            label="Company Name"
            value={settings.company_name || ""}
            onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
          />
          <TextInput
            label="Dashboard Title"
            value={settings.dashboard_title || ""}
            onChange={(e) => setSettings({ ...settings, dashboard_title: e.target.value })}
          />
        </Group>

        <Group grow mt="md">
          <TextInput
            label="Due Soon Days"
            value={settings.due_soon_days || "2"}
            onChange={(e) => setSettings({ ...settings, due_soon_days: e.target.value })}
          />
          <TextInput
            label="Timezone Label"
            value={settings.timezone_label || "Local"}
            onChange={(e) => setSettings({ ...settings, timezone_label: e.target.value })}
          />
        </Group>

        <Button mt="lg" onClick={save} radius="md">
          Save Settings
        </Button>
      </Card>
    </div>
  );
}
