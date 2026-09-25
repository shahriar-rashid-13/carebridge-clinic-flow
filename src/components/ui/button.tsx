import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123f35]/25 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#123f35] text-white border border-[#123f35] hover:bg-[#0b2e27]",
        destructive: "bg-[#a84b4b] text-white border border-[#a84b4b] hover:bg-[#8c3d3d]",
        outline: "border border-[rgba(23,42,37,0.15)] bg-white text-[#172a25] hover:bg-[#f1eee6]",
        secondary: "bg-[#e8efe9] text-[#172a25] border border-[rgba(23,42,37,0.08)] hover:bg-[#dfe9e3]",
        ghost: "text-[#172a25] hover:bg-[#f1eee6]",
        link: "text-[#123f35] underline-offset-4 hover:underline",
        // 3D Variants for vibrant theme
        "3d-primary": "btn-3d btn-3d-primary",
        "3d-terracotta": "btn-3d btn-3d-terracotta",
        "3d-mist": "btn-3d btn-3d-mist",
        "3d-rose": "btn-3d btn-3d-rose",
        "3d-sage": "btn-3d btn-3d-sage",
        "3d-sand": "btn-3d btn-3d-sand",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[8px] px-3 text-xs",
        lg: "h-12 rounded-[10px] px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
