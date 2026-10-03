import { Instrument_Serif } from "next/font/google"

/**
 * Explore's magazine voice: a display serif used only for headlines. Loaded
 * here rather than in the root layout so no other route pays for it. Apply
 * `editorialFont.variable` to any subtree (including Radix portals, which
 * escape the Explore layout) that uses the `font-editorial` utility.
 */
export const editorialFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
})
