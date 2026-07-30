import type { SVGProps } from 'react'

/**
 * A hand-rolled 16px stroke set. An icon library would drag in a few hundred
 * glyphs to use fourteen, and these are tuned to the 1.4px hairline weight the
 * rest of the interface uses.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconOverview = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 9.2 8 3l6 6.2" />
    <path d="M3.6 8.4V13h8.8V8.4" />
  </Icon>
)

export const IconFlow = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 12.5c2.2 0 2.6-9 5.2-9s2.4 6 4.1 6c1.1 0 1.6-2 2.7-2" />
    <path d="M2 14.2h12" />
  </Icon>
)

export const IconAccounts = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M1.8 6.4 8 2.6l6.2 3.8" />
    <path d="M3.4 7v5.2M6.4 7v5.2M9.6 7v5.2M12.6 7v5.2" />
    <path d="M2 13.6h12" />
  </Icon>
)

export const IconBills = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.4 2h7.2l2 2v10H3.4z" />
    <path d="M5.6 6.6h5M5.6 9.2h5M5.6 11.6h3" />
  </Icon>
)

export const IconIncome = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 13.2V3" />
    <path d="M4.6 6.4 8 3l3.4 3.4" />
    <path d="M2.4 13.4h11.2" />
  </Icon>
)

export const IconSubscriptions = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13.4 7.2a5.4 5.4 0 1 0-.7 3.4" />
    <path d="M13.6 6.6v3h-3" />
  </Icon>
)

export const IconInvest = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 11.6 5.6 8l2.6 2.4L14 4.4" />
    <path d="M10.6 4.4H14v3.2" />
  </Icon>
)

export const IconCredit = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1.4" />
    <path d="M1.8 6.8h12.4" />
    <path d="M4.4 10h2.6" />
  </Icon>
)

export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 2.2 13.2 4v4c0 3-2.2 5-5.2 5.8C5 13 2.8 11 2.8 8V4z" />
    <path d="M5.9 7.9 7.4 9.4l2.9-3" />
  </Icon>
)

export const IconRules = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="4" cy="4.2" r="1.8" />
    <circle cx="12" cy="11.8" r="1.8" />
    <path d="M5.8 4.2h3.4a2.6 2.6 0 0 1 2.6 2.6v3.2" />
    <path d="M2.6 6.4v3.2a2.6 2.6 0 0 0 2.6 2.6h5" />
  </Icon>
)

export const IconReports = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.4 13.4V7.6M6.8 13.4V3.2M10.2 13.4V9.4M13.6 13.4v-4" />
  </Icon>
)

export const IconCfo = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 1.8 9.7 5l3.5.5-2.6 2.5.7 3.5L8 9.8 4.7 11.5l.7-3.5L2.8 5.5 6.3 5z" />
  </Icon>
)

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.8v1.9M8 12.3v1.9M14.2 8h-1.9M3.7 8H1.8M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3M12.4 12.4l-1.3-1.3M4.9 4.9 3.6 3.6" />
  </Icon>
)

export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" />
  </Icon>
)

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
)

export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 3.6 10.4 8 6 12.4" />
  </Icon>
)

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </Icon>
)

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.8 4.4h10.4" />
    <path d="M6.2 4.4V3.1h3.6v1.3" />
    <path d="M4.2 4.4v8a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1v-8" />
  </Icon>
)

export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 2.6 14.4 13H1.6z" />
    <path d="M8 6.6v3M8 11.2v.1" />
  </Icon>
)

export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 2v3.2M8 10.8V14M2 8h3.2M10.8 8H14M4 4l2.2 2.2M9.8 9.8 12 12M12 4 9.8 6.2M6.2 9.8 4 12" />
  </Icon>
)
