import { useAuth } from "react-oidc-context";
import { useEffect } from "react";

const features = [
  ["◉", "Live Monitoring", "See the real-time status of generators, ATS units, and power systems.", "View live status"],
  ["♧", "Smart Alerts", "Receive instant notifications for faults, tests, and critical events.", "Manage alerts"],
  ["◇", "Remote Control", "Start, stop, and test ATS equipment securely from one place.", "Learn more"],
  ["▣", "Compliance Reports", "Keep NFPA 110 compliance and automated reporting on track.", "Explore reports"],
  ["□", "Test Management", "Schedule and track generator and ATS test activities.", "View calendar"],
  ["◔", "Analytics Dashboard", "Turn fleet performance and trends into clear decisions.", "Explore analytics"],
];

const featureDetails = {
  "Live Monitoring": "See generator, ATS, fuel, and utility status in real time across every location.",
  "Smart Alerts": "Route fault, low-fuel, and test notifications to the right people before issues escalate.",
  "Remote Control": "Securely start, stop, and exercise supported equipment without travelling to the site.",
  "Compliance Reports": "Create audit-ready NFPA 110 records and recurring reports with a complete activity history.",
  "Test Management": "Plan scheduled tests, track completion, and keep every generator and ATS inspection on time.",
  "Analytics Dashboard": "Compare uptime, alarms, load trends, and maintenance needs to make confident fleet decisions.",
};

features.forEach((feature) => {
  feature[2] = featureDetails[feature[1]] ?? feature[2];
});

export function Landing() {
  const auth = useAuth();
  const signIn = () => auth.signinRedirect().catch((err) => console.error("signinRedirect failed:", err));

  useEffect(() => {
    document.body.classList.add("marketing-mode");
    return () => document.body.classList.remove("marketing-mode");
  }, []);

  return (
    <main className="marketing-page">
      <section className="marketing-hero">
        <nav className="marketing-nav">
          <a className="marketing-brand" href="#top" aria-label="CPC home"><img className="marketing-logo" src="/images/solution61-logo.svg" alt="Solution 61" /><span><strong>CPC</strong><small>Critical Power Command</small></span></a>
          <div className="marketing-links"><a href="#platform">Platform</a><a href="#solutions">Solutions</a><a href="#mobile">Mobile app</a><a href="#resources">Resources</a></div>
          <div className="marketing-actions"><button className="marketing-login" onClick={signIn}>Log in</button><button className="marketing-signin" onClick={signIn}>Sign in</button></div>
        </nav>
        <div className="marketing-hero-image" />
        <div className="marketing-hero-copy" id="top">
          <p className="marketing-kicker">Critical Power Command</p>
          <h1>Power Continuity.<br />Complete <span>Confidence.</span></h1>
          <p className="marketing-lede">Real-time monitoring, compliance reporting, and intelligent alerts for generators and transfer switches across every facility you manage — from a single sign-in.</p>
          <div className="marketing-cta"><a className="cta-primary" href="#platform">Explore platform <span>→</span></a><button className="cta-ghost" onClick={signIn}>Request a demo <span>↗</span></button></div>
          <div className="marketing-proof"><Proof value="99.8%" label="Fleet uptime" /><Proof value="NFPA 110" label="Compliant" /><Proof value="24/7" label="Monitoring" /><Proof value="Multi-site" label="Fleet view" /></div>
        </div>
        <div className="hero-live-card hero-card-generator"><span className="pulse">⌁</span><div><b>Generator-01</b><em>Running</em><small>75% Load</small></div></div>
        <div className="hero-live-card hero-card-grid"><span>⚡</span><div><b>Grid</b><em>Online</em></div></div>
        <div className="hero-live-card hero-card-ats"><span>↕</span><div><b>ATS-01</b><em>Normal</em></div></div>
      </section>

      <section className="marketing-section feature-section" id="solutions">
        <p className="section-kicker">Powering reliability</p><h2>Everything you need in one platform</h2>
        <div className="feature-grid">{features.map(([icon, title, text, link]) => <article className="feature-card" key={title}><span className="feature-icon">{icon}</span><h3>{title}</h3><p>{text}</p><a href="#platform">{link} →</a></article>)}</div>
      </section>

      <section className="marketing-section visibility-section" id="platform">
        <div className="visibility-copy"><p className="section-kicker">Unified visibility</p><h2>Monitor every site.<br />Anytime, anywhere.</h2><p>Get a centralized view of all your systems with powerful dashboards, interactive maps, and real-time insights.</p><ul><li>Live status of every asset</li><li>Interactive site and system maps</li><li>Drill-down into device-level data</li><li>Historical data and trend analysis</li></ul><button className="cta-primary" onClick={signIn}>Explore dashboard <span>→</span></button></div>
        <DashboardPreview />
      </section>

      <section className="mobile-section" id="mobile"><div className="phone-stack"><PhoneMockup label="Overview" /><PhoneMockup label="Generator-01" alternate /></div><div className="mobile-copy"><p className="section-kicker">Mobile app</p><h2>Power in your pocket</h2><p>Stay connected to CPC wherever you are. Monitor systems, receive alerts, and manage operations on the go.</p><div className="store-row"><span> <b>App Store</b></span><span>▶ <b>Google Play</b></span></div></div></section>

      <section className="quote-section"><p className="section-kicker">Trusted by facility managers worldwide</p><blockquote>“CPC has transformed the way we manage our critical power systems. The visibility, alerts, and reporting help us stay compliant and prepared — always.”</blockquote><p className="quote-name">Tadzi Radecki <span>Facilities Manager, Solution 61</span></p></section>

      <footer className="marketing-footer" id="resources"><div className="footer-brand"><a className="marketing-brand" href="#top"><img className="marketing-logo" src="/images/solution61-logo.svg" alt="Solution 61" /><span><strong>CPC</strong><small>Critical Power Command</small></span></a><p>The most advanced platform for monitoring and managing generators, ATS, and critical power systems.</p></div><div><b>Solutions</b><a href="#platform">Generator monitoring</a><a href="#platform">ATS management</a><a href="#platform">Alert management</a></div><div><b>Products</b><a href="#platform">Platform overview</a><a href="#mobile">Mobile app</a><a href="#platform">Integrations</a></div><div><b>Company</b><a href="#top">About us</a><a href="#top">Careers</a><a href="#top">Contact us</a></div><div className="footer-newsletter"><b>Newsletter</b><p>Stay updated with the latest features and insights.</p><button onClick={signIn}>Sign in to get started →</button></div><small className="copyright">© 2026 CPC — Critical Power Command. All rights reserved.</small></footer>
    </main>
  );
}

function Proof({ value, label }) { return <div><b>{value}</b><span>{label}</span></div>; }
function PhoneMockup({ label, alternate }) { return <div className={`phone-mockup ${alternate ? "phone-alt" : ""}`}><i /><b>⚡ CPC</b><small>{label}</small><div className="phone-ring">247</div><p>System status</p><div className="phone-line" /><div className="phone-line short" /></div>; }
function DashboardPreview() { return <div className="dashboard-preview"><aside><b>⚡ CPC</b><span className="active">▦ Dashboard</span><span>▧ Systems</span><span>⌁ Generators</span><span>↕ ATS</span><span>⚠ Alerts</span><span>⌁ Reports</span></aside><div className="preview-main"><header><b>Overview</b><span>All sites · Last 24 hours</span></header><div className="preview-stats"><MiniStat n="247" label="Total systems" /><MiniStat n="189" label="Generators running" good /><MiniStat n="156" label="ATS panels normal" /><MiniStat n="3" label="Active alerts" alert /></div><div className="preview-panels"><div className="map-panel"><b>System status</b><div className="donut">247</div></div><div className="map-panel map-art"><b>Live map</b><span>●　●</span><span>　●　●</span><span>●　　　●</span></div><div className="alerts-panel"><b>Recent alerts</b><p>⚠ Generator-01 · 2 min ago</p><p>⚠ ATS-02 · 5 min ago</p><p>△ Fuel tank low · 15 min ago</p></div></div></div></div>; }
function MiniStat({ n, label, good, alert }) { return <div><b className={good ? "good" : alert ? "alert" : ""}>{n}</b><span>{label}</span></div>; }
