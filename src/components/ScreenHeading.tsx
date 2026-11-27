import { useLayoutEffect, useRef } from 'react'
import type { ComponentProps } from 'react'

export function ScreenHeading(props: Omit<ComponentProps<'h1'>, 'ref' | 'tabIndex'>) {
  const ref = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    ref.current?.focus()
  }, [])
  return <h1 {...props} ref={ref} tabIndex={-1} />
}
