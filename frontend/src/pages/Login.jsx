import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Paper, Title, TextInput, PasswordInput, Button, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import api from "../api";
import { setToken, setUser } from "../auth";

export default function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post("/login", { username, password });
      setToken(res.data.token);
      setUser(res.data.user || { username });

      notifications.show({
        title: "Welcome back",
        message: "Login successful.",
      });

      navigate("/dashboard");
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Login failed",
        message: err?.response?.data?.error || "Invalid credentials",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <Paper
        radius="xl"
        p="xl"
        w={420}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(14px)"
        }}
      >
        <Title order={2} mb={6}>Sign in</Title>
        <Text c="dimmed" fz={13} mb="md">
          Use <b>admin</b> / <b>admin123</b>
        </Text>

        <form onSubmit={onSubmit}>
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            mb="sm"
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            mb="md"
          />
          <Button fullWidth type="submit" loading={loading} radius="md">
            Sign in
          </Button>
        </form>
      </Paper>
    </div>
  );
}
