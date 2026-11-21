export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Avir</h1>
        <p className="text-xl mb-4">
          AI-powered assistant for urban air quality navigation during winter smog seasons
        </p>
        
        <div className="space-y-6 mt-8">
          <section>
            <h2 className="text-2xl font-semibold mb-3">Overview</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Context-Aware Recommendations: Balances individual vulnerability profiles</li>
              <li>Dynamic Schedule Adjustments: Proposes low-exposure time windows</li>
              <li>Practical Indoor Solutions: Recommends accessible air safety methods</li>
              <li>Impact Metrics: Quantifies exposure reduction and carbon savings</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-semibold mb-3">Status</h2>
            <p>Active Development - Urban Air Quality & Winter Smog Management</p>
          </section>
        </div>
      </div>
    </main>
  )
}
