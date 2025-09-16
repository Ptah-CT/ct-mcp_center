"use client";

import {
  FileTerminal,
  Key,
  Link as LinkIcon,
  Package,
  Search,
  SearchCode,
  Server,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LogsStatusIndicator } from "@/components/logs-status-indicator";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTranslations } from "@/hooks/useTranslations";
import { useLocale } from "@/hooks/useLocale";

import { getLocalizedPath, SupportedLocale } from "@/lib/i18n";

// Menu items function - now takes locale parameter
const getMenuItems = (t: (key: string) => string, locale: SupportedLocale) => [
  {
    title: t("navigation:exploreMcpServers"),
    url: getLocalizedPath("/search", locale),
    icon: Search,
  },
  {
    title: t("navigation:mcpServers"),
    url: getLocalizedPath("/mcp-servers", locale),
    icon: Server,
  },
  {
    title: t("navigation:metamcpNamespaces"),
    url: getLocalizedPath("/namespaces", locale),
    icon: Package,
  },
  {
    title: t("navigation:metamcpEndpoints"),
    url: getLocalizedPath("/endpoints", locale),
    icon: LinkIcon,
  },
  {
    title: t("navigation:mcpInspector"),
    url: getLocalizedPath("/mcp-inspector", locale),
    icon: SearchCode,
  },
  {
    title: t("navigation:apiKeys"),
    url: getLocalizedPath("/api-keys", locale),
    icon: Key,
  },
  {
    title: t("navigation:settings"),
    url: getLocalizedPath("/settings", locale),
    icon: Settings,
  },
];

function LiveLogsMenuItem() {
  const { t, locale } = useTranslations();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link href={getLocalizedPath("/live-logs", locale)}>
          <FileTerminal />
          <span>{t("navigation:liveLogs")}</span>
          <LogsStatusIndicator />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserInfoFooter() {
  const { t } = useTranslations();

  return (
    <SidebarFooter>
      <div className="flex flex-col gap-4 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <p className="text-xs text-muted-foreground">v2.4.14</p>
        </div>
      </div>
    </SidebarFooter>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = useTranslations();
  const items = getMenuItems(t, locale);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="flex flex-col justify-center items-center px-2 py-4">
          <div className="flex items-center justify-center w-full mb-2">
            <div className="flex items-center gap-4">
              <Image
                src="/favicon.ico"
                alt="MetaMCP Logo"
                width={256}
                height={256}
                className="h-12 w-12"
              />
              <h2 className="text-2xl font-semibold">MetaMCP</h2>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("navigation:application")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <LiveLogsMenuItem />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <UserInfoFooter />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="ml-1 cursor-pointer" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}