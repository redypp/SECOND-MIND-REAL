import type React from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const sonnerTheme: ToasterProps["theme"] = theme === "night" ? "dark" : "light";

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      duration={3000}
      position="top-center"
      closeButton={false}
      richColors={false}
      toastOptions={{
        classNames: {
          toast: "hidden",
          error: "!flex group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
