"use client"

import * as React from "react"
import { Textarea as TextareaV1 } from "@/components/ui/textarea"
import { Textarea as TextareaV2 } from "@/components/ui-v2/textarea"
import { useUIRefresh } from "@/lib/feature-flags"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <TextareaV2 ref={ref} {...props} />
  }

  return <TextareaV1 ref={ref} {...props} />
})
Textarea.displayName = "Textarea"

export { Textarea }
