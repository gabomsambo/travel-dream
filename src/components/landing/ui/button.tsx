import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Start by creating lib/utils if not exists, but I'll assume users usually have it or I need to create it.
// Wait, I haven't created lib/utils. Next.js does not create it by default unless I asked? I used default template.
// I'll create the Button simple first without complex libs if I can, or create utils first.
// I'll stick to simple Tailwind for now to avoid dependency hell if I don't have shadcn setup.
// Actually, I installed clsx and tailwind-merge, so I should creat lib/utils.

// Let's create the Button component without external lib/utils dependency for now, or just define cn here.

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-landing-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-landing-primary text-white hover:bg-landing-primary/90",
                destructive: "bg-red-500 text-white hover:bg-red-500/90",
                outline: "border border-landing-surface bg-landing-background hover:bg-landing-accent hover:text-white",
                secondary: "bg-landing-surface text-landing-secondary hover:bg-landing-surface/80",
                ghost: "hover:bg-landing-accent/10 hover:text-landing-accent",
                link: "text-landing-primary underline-offset-4 hover:underline",
                cta: "bg-landing-primary text-[#FDFCF8] hover:bg-[#404040] rounded-full px-6 py-3 text-base font-semibold shadow-sm hover:shadow-md transition-all duration-300",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-11 rounded-md px-8",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
