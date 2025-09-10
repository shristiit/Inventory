"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Home, Inbox, LucideListOrdered, Users } from 'lucide-react';
import Link from 'next/link';
import * as Tooltip from "@radix-ui/react-tooltip"; // import Radix Tooltip
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import api from "@/lib/api";
import { useRouter } from "next/navigation";

const AppSideBar = () => {
  const [role, setRole] = useState<"admin" | "staff" | "customer" | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<{ role: "admin" | "staff" | "customer" }>("/api/auth/me");
        setRole(data.role);
      } catch {
        router.replace("/login");
      }
    };
    load();
  }, [router]);

  const listServices = useMemo(() => [
    { id: 1, name: 'Home', route: '/', icon: Home },

    { id: 2, name: 'Products', route: '/Products', icon: Inbox },
    { id: 3, name: 'Users', route: '/Users', icon: Users },
    {id: 4, name: "Orders", route: '/orders', icon: LucideListOrdered}
  ], []);

  const visibleServices = useMemo(() => {
    if (role === 'admin') return listServices;
    if (role === 'staff') return listServices.filter(s => ['Home','Products','Orders'].includes(s.name));
    if (role === 'customer') return listServices.filter(s => ['Home','Products'].includes(s.name));
    return [];
  }, [role, listServices]);

  return (
    <Sidebar className="h-screen bg-white w-64" collapsible="icon">
      <SidebarHeader className="text-lg font-bold m-2 items-center"></SidebarHeader>
      <SidebarContent className="m-1">
        <SidebarMenu className="gap-7">
          <Tooltip.Provider delayDuration={100}>
            {visibleServices.map((service) => (
              <SidebarMenuItem key={service.id} className='m-2'>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Link href={service.route} className="w-full">
                      <SidebarMenuButton className="flex items-center gap-3 w-full p-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition [&>svg]:!size-5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                        <service.icon />
                        <span>{service.name}</span>
                      </SidebarMenuButton>
                    </Link>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      align="center"
                      className="rounded-md text-white bg-black px-3 py-1 text-sm shadow-lg"
                    >
                      <div className="flex items-center gap-2">
                        <service.icon className="w-4 h-4" />
                        <span>{service.name}</span>
                      </div>
                      <Tooltip.Arrow className="fill-gray-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </SidebarMenuItem>
            ))}
          </Tooltip.Provider>
        </SidebarMenu>
      </SidebarContent>

      {/* User footer removed as requested */}
    </Sidebar>
  );
};

export default AppSideBar;
