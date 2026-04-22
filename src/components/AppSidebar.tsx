import { LayoutDashboard, Table2, Sliders, GitCompare, Info, Wrench, History as HistoryIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Scenario", url: "/scenario", icon: Table2 },
  { title: "Assumptions", url: "/assumptions", icon: Sliders },
  { title: "Scenario Comparison", url: "/comparison", icon: GitCompare },
  { title: "Om modellen", url: "/om-modellen", icon: Info },
];

const adminItems = [
  { title: "Historikk", url: "/history", icon: HistoryIcon },
  { title: "Health & Import", url: "/admin", icon: Wrench },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const renderItem = (item: { title: string; url: string; icon: typeof LayoutDashboard }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild tooltip={collapsed ? item.title : undefined}>
        <NavLink
          to={item.url}
          end
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <div className={`px-4 py-5 ${collapsed ? "text-center" : ""}`}>
          <div className="font-semibold text-sidebar-foreground tracking-tight text-base">
            {collapsed ? "LTP" : "LTP Modell"}
          </div>
          {!collapsed && (
            <div className="text-xs text-muted-foreground mt-0.5">Long-Term Plan</div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigasjon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Verktøy</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{adminItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
