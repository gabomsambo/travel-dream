export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-landing-background overflow-x-hidden font-body">
      {children}
    </div>
  )
}
