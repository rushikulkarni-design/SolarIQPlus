
import {
  LayoutDashboard,
  FolderKanban,
  Wrench,
  FileBarChart,
  Settings,
  Sun,
  AlertTriangle,
  Calculator,
} from "lucide-react";

/*
 * SolarIQ+ main navigation.
 *
 * Planning stages stay inside the Project workflow.
 * Post-installation monitoring tools remain organized
 * under AI & Operations.
 * Customer service requests are available under User Support.
 */

export const NAV = [
  {
    type: "item",
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
  },

  {
    type: "group",
    label: "Solar Planning",
    icon: FolderKanban,
    children: [
      {
        to: "/planner/project",
        label: "Project",
        icon: FolderKanban,
      },
    ],
  },

  {
    type: "group",
    label: "AI & Operations",
    icon: AlertTriangle,
    children: [
      {
        to: "/monitoring/issue-diagnosis",
        label: "Issue Diagnosis",
        icon: AlertTriangle,
      },
      {
        to: "/maintenance",
        label: "Maintenance",
        icon: Wrench,
      },
    ],
  },

  {
    type: "item",
    to: "/simulator",
    label: "Solar Simulator",
    icon: Calculator,
  },

  {
    type: "item",
    to: "/reports",
    label: "Reports",
    icon: FileBarChart,
  },

  {
    type: "group",
    label: "User Support",
    icon: Wrench,
    children: [
      {
        to: "/services",
        label: "Services",
        icon: Wrench,
      },
    ],
  },

  {
    type: "item",
    to: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

export const MOBILE_NAV = [
  {
    to: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
  },
  {
    to: "/planner/project",
    label: "Plan",
    icon: Sun,
  },
  {
    to: "/simulator",
    label: "Simulator",
    icon: Calculator,
  },
  {
    to: "/monitoring/issue-diagnosis",
    label: "AI",
    icon: AlertTriangle,
  },
  {
    to: "/settings",
    label: "More",
    icon: Settings,
  },
];
