import type { SVGProps } from 'react'

// Ikoner fra Figma som ikke finnes i Lucide. Stiene er kopiert fra Figma,
// fargen styres med text-farge (currentColor).

/** «play-03». Bruk `tight` for den beskårne varianten i popupen. */
export function PlayIcon({ tight, ...props }: SVGProps<SVGSVGElement> & { tight?: boolean }) {
  return (
    <svg
      width={tight ? 13.928 : 20.448}
      height={tight ? 16.001 : 18.667}
      viewBox={tight ? '3.26 1.333 13.928 16.001' : '0 0 20.448 18.667'}
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M15.3132 10.5138C16.4817 9.84415 16.4775 9.09909 15.3132 8.50682L6.17604 2.58412C5.2289 2.05598 4.23494 2.3672 4.26048 3.46875L4.29879 15.1029C4.37967 16.2988 5.15015 16.6251 6.28458 16.0724L15.3132 10.5138Z"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  )
}

/** «users-profiles-02» */
export function UsersProfilesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M19.2 13.6857C20.4673 14.6326 21.6 17.0167 21.6 18.4857C21.6 18.9433 21.2661 19.3143 20.8542 19.3143H20.4M15.6 9.80448C16.4198 9.33023 16.9714 8.44382 16.9714 7.42857C16.9714 6.41333 16.4198 5.52691 15.6 5.05266M3.14577 19.3143H16.2828C16.6947 19.3143 17.0286 18.9433 17.0286 18.4857C17.0286 15.609 14.6253 13.2771 9.71428 13.2771C4.80326 13.2771 2.4 15.609 2.4 18.4857C2.4 18.9433 2.73389 19.3143 3.14577 19.3143ZM12.4571 7.42857C12.4571 8.94341 11.2291 10.1714 9.71428 10.1714C8.19945 10.1714 6.97143 8.94341 6.97143 7.42857C6.97143 5.91373 8.19945 4.68571 9.71428 4.68571C11.2291 4.68571 12.4571 5.91373 12.4571 7.42857Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  )
}

const smallIcon = { width: 17.995, height: 17.995, viewBox: '0 0 17.9948 17.9948', fill: 'none' }
const smallStroke = { stroke: 'currentColor', strokeWidth: 1.49957, strokeLinecap: 'round' as const }

export function TabletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...smallIcon} aria-hidden {...props}>
      <path
        d="M4.4987 2.24935H13.4961C14.3243 2.24935 14.9957 2.92073 14.9957 3.74892V14.2459C14.9957 15.0741 14.3243 15.7455 13.4961 15.7455H4.4987C3.67051 15.7455 2.99913 15.0741 2.99913 14.2459V3.74892C2.99913 2.92073 3.67051 2.24935 4.4987 2.24935Z"
        strokeLinejoin="round"
        {...smallStroke}
      />
      <path d="M7.49783 13.4961H10.497" strokeLinejoin="round" {...smallStroke} />
    </svg>
  )
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...smallIcon} aria-hidden {...props}>
      <path d="M6.74805 3.74892V14.2459" {...smallStroke} />
      <path d="M11.2467 3.74892V14.2459" {...smallStroke} />
    </svg>
  )
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...smallIcon} aria-hidden {...props}>
      <path d="M3.74892 8.9974L7.49783 12.7463L14.2459 5.24848" strokeLinejoin="round" {...smallStroke} />
    </svg>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden {...props}>
      <path
        d="M1.4994 4.49964H3.49956M3.49956 4.49964H6.4998M3.49956 4.49964L4.49964 16.5006H13.5004L14.5004 4.49964M6.4998 4.49964H11.5002M6.4998 4.49964V1.4994H11.5002V4.49964M11.5002 4.49964H14.5004M14.5004 4.49964H16.5006M7.49988 7.49988V13.5004M10.5001 7.49988V13.5004"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** «Rediger» */
export function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden {...props}>
      <path
        d="M6.47406 2.21882H3.15694C2.05774 2.21882 1.16667 3.10987 1.16667 4.20903V10.8431C1.16667 11.9423 2.05774 12.8333 3.15694 12.8333H9.79118C10.8904 12.8333 11.7815 11.9423 11.7815 10.8431L11.7815 7.52608M4.48379 9.51626L6.89754 9.02992C7.02568 9.0041 7.14333 8.941 7.23574 8.84855L12.6392 3.44235C12.8982 3.18315 12.898 2.763 12.6388 2.50402L11.4941 1.36071C11.2349 1.10183 10.815 1.10201 10.556 1.3611L5.15206 6.76787C5.05983 6.86014 4.99686 6.97755 4.97102 7.10542L4.48379 9.51626Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CircleCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      <path
        d="M4.49988 6L5.49996 7.00008L7.50012 4.99992M11.0004 6C11.0004 8.76164 8.76164 11.0004 6 11.0004C3.23836 11.0004 0.9996 8.76164 0.9996 6C0.9996 3.23836 3.23836 0.9996 6 0.9996C8.76164 0.9996 11.0004 3.23836 11.0004 6Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden {...props}>
      <path
        d="M7.34821 11.7999C7.27679 11.5231 7.13249 11.2704 6.93032 11.0683C6.72815 10.8661 6.47549 10.7218 6.19864 10.6504L1.29077 9.38479C1.20704 9.36102 1.13334 9.31059 1.08087 9.24115C1.02839 9.17171 1 9.08704 1 9C1 8.91296 1.02839 8.82829 1.08087 8.75885C1.13334 8.68941 1.20704 8.63898 1.29077 8.61521L6.19864 7.34884C6.4754 7.27749 6.72798 7.1333 6.93015 6.93128C7.13231 6.72926 7.27667 6.47677 7.34821 6.20007L8.61378 1.29219C8.63731 1.20813 8.68769 1.13407 8.75723 1.08131C8.82678 1.02856 8.91168 1 8.99897 1C9.08626 1 9.17116 1.02856 9.24071 1.08131C9.31025 1.13407 9.36063 1.20813 9.38416 1.29219L10.6489 6.20007C10.7203 6.47692 10.8647 6.72957 11.0668 6.93175C11.269 7.13392 11.5216 7.27822 11.7985 7.34964L16.7064 8.61441C16.7908 8.63769 16.8652 8.68801 16.9182 8.75767C16.9713 8.82732 17 8.91245 17 9C17 9.08755 16.9713 9.17268 16.9182 9.24233C16.8652 9.31198 16.7908 9.36231 16.7064 9.38559L11.7985 10.6504C11.5216 10.7218 11.269 10.8661 11.0668 11.0683C10.8647 11.2704 10.7203 11.5231 10.6489 11.7999L9.38336 16.7078C9.35983 16.7919 9.30945 16.8659 9.23991 16.9187C9.17036 16.9714 9.08546 17 8.99817 17C8.91088 17 8.82598 16.9714 8.75643 16.9187C8.68689 16.8659 8.63651 16.7919 8.61298 16.7078L7.34821 11.7999Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </svg>
  )
}
