// The coloured band at the top of a dashboard or an account Home: a title and one muted line in white on the theme colour.
// `theme` picks the colour: "staff" (deep theme green), "crop" (farmer, farmers' organization) or "fisheries" (fisherfolk,
// fisherfolk organization). It is the one strong colour block on the page; everything else only takes accents.

const THEMES = {
  staff: 'from-[#16382A] to-[#2F5233]',
  crop: 'from-[#163318] to-[#2D6B4A]',
  fisheries: 'from-[#0E3C56] to-[#155E82]',
}

export default function WelcomeBand({ title, subtitle, theme = 'staff', className = '' }) {
  return (
    <header className={`rounded-[var(--radius-md)] bg-gradient-to-r px-4 py-4 text-white shadow-sm md:px-6 md:py-5 ${THEMES[theme]} ${className}`}>
      <h1 className="text-[20px] font-bold leading-tight md:text-[24px]">{title}</h1>
      {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-white/80 md:text-[13px]">{subtitle}</p>}
    </header>
  )
}
