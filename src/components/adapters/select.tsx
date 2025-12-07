"use client"

import * as React from "react"
import {
  Select as SelectV1,
  SelectGroup as SelectGroupV1,
  SelectValue as SelectValueV1,
  SelectTrigger as SelectTriggerV1,
  SelectContent as SelectContentV1,
  SelectLabel as SelectLabelV1,
  SelectItem as SelectItemV1,
  SelectSeparator as SelectSeparatorV1,
  SelectScrollUpButton as SelectScrollUpButtonV1,
  SelectScrollDownButton as SelectScrollDownButtonV1,
} from "@/components/ui/select"
import {
  Select as SelectV2,
  SelectGroup as SelectGroupV2,
  SelectValue as SelectValueV2,
  SelectTrigger as SelectTriggerV2,
  SelectContent as SelectContentV2,
  SelectLabel as SelectLabelV2,
  SelectItem as SelectItemV2,
  SelectSeparator as SelectSeparatorV2,
  SelectScrollUpButton as SelectScrollUpButtonV2,
  SelectScrollDownButton as SelectScrollDownButtonV2,
} from "@/components/ui-v2/select"
import * as SelectPrimitive from "@radix-ui/react-select"
import { useUIRefresh } from "@/lib/feature-flags"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectTriggerV2 ref={ref} {...props} />
  }

  return <SelectTriggerV1 ref={ref} {...props} />
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectScrollUpButtonV2 ref={ref} {...props} />
  }

  return <SelectScrollUpButtonV1 ref={ref} {...props} />
})
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectScrollDownButtonV2 ref={ref} {...props} />
  }

  return <SelectScrollDownButtonV1 ref={ref} {...props} />
})
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectContentV2 ref={ref} {...props} />
  }

  return <SelectContentV1 ref={ref} {...props} />
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectLabelV2 ref={ref} {...props} />
  }

  return <SelectLabelV1 ref={ref} {...props} />
})
SelectLabel.displayName = SelectPrimitive.Label.displayName

interface SelectItemAdapterProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  description?: string
}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemAdapterProps
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectItemV2 ref={ref} {...props} />
  }

  return <SelectItemV1 ref={ref} {...props} />
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <SelectSeparatorV2 ref={ref} {...props} />
  }

  return <SelectSeparatorV1 ref={ref} {...props} />
})
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
