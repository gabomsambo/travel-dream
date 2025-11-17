"use client"

import * as DropdownMenuV1 from "@/components/ui/dropdown-menu"
import * as DropdownMenuV2 from "@/components/ui-v2/dropdown-menu"
import { useUIRefresh } from "@/lib/feature-flags"

export function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenu>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenu {...props} /> : <DropdownMenuV1.DropdownMenu {...props} />
}

export function DropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuPortal>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuPortal {...props} /> : <DropdownMenuV1.DropdownMenuPortal {...props} />
}

export function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuTrigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuTrigger {...props} /> : <DropdownMenuV1.DropdownMenuTrigger {...props} />
}

export function DropdownMenuContent(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuContent>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuContent {...props} /> : <DropdownMenuV1.DropdownMenuContent {...props} />
}

export function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuGroup>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuGroup {...props} /> : <DropdownMenuV1.DropdownMenuGroup {...props} />
}

export function DropdownMenuItem(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuItem>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuItem {...props} /> : <DropdownMenuV1.DropdownMenuItem {...props} />
}

export function DropdownMenuCheckboxItem(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuCheckboxItem>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuCheckboxItem {...props} /> : <DropdownMenuV1.DropdownMenuCheckboxItem {...props} />
}

export function DropdownMenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuRadioGroup>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuRadioGroup {...props} /> : <DropdownMenuV1.DropdownMenuRadioGroup {...props} />
}

export function DropdownMenuRadioItem(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuRadioItem>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuRadioItem {...props} /> : <DropdownMenuV1.DropdownMenuRadioItem {...props} />
}

export function DropdownMenuLabel(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuLabel>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuLabel {...props} /> : <DropdownMenuV1.DropdownMenuLabel {...props} />
}

export function DropdownMenuSeparator(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuSeparator>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuSeparator {...props} /> : <DropdownMenuV1.DropdownMenuSeparator {...props} />
}

export function DropdownMenuShortcut(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuShortcut>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuShortcut {...props} /> : <DropdownMenuV1.DropdownMenuShortcut {...props} />
}

export function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuSub>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuSub {...props} /> : <DropdownMenuV1.DropdownMenuSub {...props} />
}

export function DropdownMenuSubTrigger(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuSubTrigger>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuSubTrigger {...props} /> : <DropdownMenuV1.DropdownMenuSubTrigger {...props} />
}

export function DropdownMenuSubContent(props: React.ComponentProps<typeof DropdownMenuV2.DropdownMenuSubContent>) {
  const [uiRefreshEnabled] = useUIRefresh()
  return uiRefreshEnabled ? <DropdownMenuV2.DropdownMenuSubContent {...props} /> : <DropdownMenuV1.DropdownMenuSubContent {...props} />
}
