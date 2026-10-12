"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function FileInput({ className, onChange, multiple, ...props }: React.ComponentProps<"input">) {
  const [fileNames, setFileNames] = React.useState("")

  return (
    <span
      data-slot="file-input"
      className={cn(
        "relative inline-flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        props.disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span aria-hidden="true" className="shrink-0 font-medium text-foreground">
        {multiple ? "Choose files" : "Choose file"}
      </span>
      <span aria-hidden="true" className="min-w-0 truncate text-muted-foreground">
        {fileNames || "No file chosen"}
      </span>
      <input
        {...props}
        type="file"
        multiple={multiple}
        title={fileNames || "No file chosen"}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          setFileNames(files.map(file => file.name).join(", "))
          onChange?.(event)
        }}
      />
    </span>
  )
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "file" && !props.hidden) {
    return <FileInput className={className} {...props} />
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
