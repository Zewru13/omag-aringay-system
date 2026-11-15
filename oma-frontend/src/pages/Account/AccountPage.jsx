import PageLayout from '../../components/Layout/PageLayout.jsx'

// A page of a farmer, fisherfolk or organization account: the shared layout, then a heading you can see, one helper line, and the
// page's main button (at the right on a computer, full-width under the heading on a phone). Every account page starts the same way.
export default function AccountPage({ title, helper, action, children }) {
  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1100px]">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[20px] font-bold leading-tight text-text-primary">{title}</h1>
            {helper && <p className="mt-1 text-[13px] leading-snug text-text-secondary">{helper}</p>}
          </div>
          {action && <div className="shrink-0 max-md:[&>*]:w-full">{action}</div>}
        </header>
        {children}
      </div>
    </PageLayout>
  )
}
