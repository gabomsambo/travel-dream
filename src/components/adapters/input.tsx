"use client"

import * as React from "react"
import { Input as InputV1 } from "@/components/ui/input"
import { Input as InputV2 } from "@/components/ui-v2/input"
import { useUIRefresh } from "@/lib/feature-flags"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const [uiRefreshEnabled] = useUIRefresh()

  if (uiRefreshEnabled) {
    return <InputV2 ref={ref} {...props} />
  }

  return <InputV1 ref={ref} {...props} />
})
Input.displayName = "Input"

export { Input }
