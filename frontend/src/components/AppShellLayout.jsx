import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  Group,
  Text,
  Button,
  Stack,
  Box,
  ThemeIcon,
  Badge
} from "@mantine/core";
import { IconDashboard, IconBriefcase, IconSettings, IconLogout, IconShield } from "@tabler/icons-react";
import { clearAuth, getUser } from "../auth";

function SideLink({ to, icon, label }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <NavLink to={to} style={{ textDecoration: "none" }}>
      <Box
        p="sm"
        style={{
          borderRadius: 12,
          background: active ? "rgba(255,255,255,0.10)" : "transparent",
          border: active ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent"
        }}
      >
        <Group gap="sm">
          <ThemeIcon variant="light" radius="md">
            {icon}
          </ThemeIcon>
          <Text fw={700} c={active ? "white" : "gray.2"}>
            {label}
          </Text>
        </Group>
      </Box>
    </NavLink>
  );
}

export default function AppShellLayout() {
  const navigate = useNavigate();
  const user = getUser();

  function logout() {
    clearAuth();
    navigate("/login");
  }

  const isAdmin = user?.role === "admin";

  return (
    <AppShell
      padding="lg"
      navbar={{ width: 290, breakpoint: "sm" }}
      navbarProps={{
        style: {
          background: "rgba(10, 14, 25, 0.75)",
          backdropFilter: "blur(16px)",
          borderRight: "1px solid rgba(255,255,255,0.08)"
        }
      }}
    >
      <AppShell.Navbar p="lg">
        <Stack gap="md" style={{ height: "100%" }}>
          <Box>
            <Group justify="space-between" align="center">
              <Text fw={900} fz={22}>PrintOps</Text>
              <Badge variant="light">{(user?.role || "staff").toUpperCase()}</Badge>
            </Group>
            <Text c="dimmed" fz={12}>Signed in as {user?.username || "user"}</Text>
          </Box>

          <Stack gap={6}>
            <SideLink to="/dashboard" icon={<IconDashboard size={18} />} label="Analytics" />
            <SideLink to="/jobs" icon={<IconBriefcase size={18} />} label="Jobs" />
            <SideLink to="/settings" icon={<IconSettings size={18} />} label="Settings" />
            {isAdmin && <SideLink to="/audit" icon={<IconShield size={18} />} label="Audit Log" />}
          </Stack>

          <Box style={{ marginTop: "auto" }}>
            <Button
              fullWidth
              leftSection={<IconLogout size={18} />}
              variant="light"
              onClick={logout}
              radius="md"
            >
              Log out
            </Button>
          </Box>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
