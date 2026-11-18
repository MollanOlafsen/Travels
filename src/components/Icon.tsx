export type IconName = 'home' | 'calendar' | 'plus' | 'plane' | 'doc' | 'scale' | 'gear' | 'camera' | 'trash' | 'edit' | 'share' | 'download'

const PATHS: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  plus: 'M12 5v14M5 12h14',
  plane: 'M2.5 19 21 12 2.5 5l2 6 8 1-8 1z',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  scale: 'M12 3v18M4 7h16M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0zM8 21h8',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h-1M21 12h-1M12 4V3M12 21v-1M6.3 6.3l-.7-.7M18.4 18.4l-.7-.7M6.3 17.7l-.7.7M18.4 5.6l-.7.7',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  download: 'M12 3v12M8 11l4 4 4-4M5 19h14',
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
