"use client"

import * as React from "react"
import {
  Command as CommandV1,
  CommandDialog as CommandDialogV1,
  CommandInput as CommandInputV1,
  CommandList as CommandListV1,
  CommandEmpty as CommandEmptyV1,
  CommandGroup as CommandGroupV1,
  CommandItem as CommandItemV1,
  CommandSeparator as CommandSeparatorV1,
  CommandShortcut as CommandShortcutV1,
} from "@/components/ui/command"
import {
  Command as CommandV2,
  CommandDialog as CommandDialogV2,
  CommandInput as CommandInputV2,
  CommandList as CommandListV2,
  CommandEmpty as CommandEmptyV2,
  CommandGroup as CommandGroupV2,
  CommandItem as CommandItemV2,
  CommandSeparator as CommandSeparatorV2,
  CommandShortcut as CommandShortcutV2,
} from "@/components/ui-v2/command"
import { Command as CommandPrimitive } from "cmdk"
import { type DialogProps } from "@radix-ui/react-dialog"
import { useUIRefresh } from "@/lib/feature-flags"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandV2 ref={ref} {...props} />
  }

  return <CommandV1 ref={ref} {...props} />
})
Command.displayName = "Command"

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandDialogV2 {...props}>{children}</CommandDialogV2>
  }

  return <CommandDialogV1 {...props}>{children}</CommandDialogV1>
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandInputV2 ref={ref} {...props} />
  }

  return <CommandInputV1 ref={ref} {...props} />
})
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandListV2 ref={ref} {...props} />
  }

  return <CommandListV1 ref={ref} {...props} />
})
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandEmptyV2 ref={ref} {...props} />
  }

  return <CommandEmptyV1 ref={ref} {...props} />
})
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandGroupV2 ref={ref} {...props} />
  }

  return <CommandGroupV1 ref={ref} {...props} />
})
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandItemV2 ref={ref} {...props} />
  }

  return <CommandItemV1 ref={ref} {...props} />
})
CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandSeparatorV2 ref={ref} {...props} />
  }

  return <CommandSeparatorV1 ref={ref} {...props} />
})
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandShortcut = (props: React.HTMLAttributes<HTMLSpanElement>) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <CommandShortcutV2 {...props} />
  }

  return <CommandShortcutV1 {...props} />
}
CommandShortcut.displayName = "CommandShortcut"

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
}
